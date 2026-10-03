import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { registerPlanAudience } from '../localization/product-problem';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';

/** Server-validated identity. Never derive tenancy or permissions from browser storage. */
export interface SessionIdentity {
  readonly userId: string;
  readonly tenantId: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly companyName?: string;
  /** CF-061 (ADR-133): the company is read-only until then (null when fully active). */
  readonly readOnlyUntilUtc?: string | null;
  /** CF-068 (ADR-146): the company's idle timeout in minutes. */
  readonly idleTimeoutMinutes?: number;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** CF-065 (ADR-145): the password step's answer when the account signs in with an authenticator. */
export interface TenantMfaChallenge {
  readonly status: 'totp_required' | 'enrollment_required';
  readonly challenge: string;
  readonly secret: string | null;
  readonly provisioningUri: string | null;
}

const LOGOUT_PENDING_KEY = 'bidperformance.tenant-logout-pending';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly currentIdentity = signal<SessionIdentity | null>(null);
  private pending?: Observable<void>;
  private generation = 0;
  readonly identity = this.currentIdentity.asReadonly();

  hasPermission(permission: string): boolean {
    return !!permission && (this.identity()?.permissions.includes(permission) ?? false);
  }

  /** CF-105: whoever can change the plan (the Company Admin) is pointed to the provider; everyone else to their Company Admin. */
  managesPlan(): boolean {
    return (
      (this.identity()?.roles.includes('CompanyAdmin') ?? false) || this.hasPermission('Users.View')
    );
  }

  constructor() {
    registerPlanAudience(() => this.managesPlan());
  }

  /** Resolve the current cookie session. Tenant identity always comes from the server. */
  load(): Observable<void> {
    if (this.pending) return this.pending;
    if (hasPendingLogout()) return this.completePendingLogout();
    this.currentIdentity.set(null);
    const generation = ++this.generation;
    return (this.pending ??= this.http.get<unknown>('/api/v1/session').pipe(
      timeout(5000),
      tap((value) => {
        if (generation === this.generation) {
          this.currentIdentity.set(isSessionIdentity(value) ? value : null);
        }
      }),
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => {
        if (generation === this.generation) this.pending = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  /**
   * Step 1: the password. Signs in directly — or, for an account with an authenticator or in a role the company signs in with MFA
   * (CF-065), answers the challenge for {@link verify} and signs nobody in yet.
   */
  login(email: string, password: string): Observable<TenantMfaChallenge | null> {
    this.clear();
    const generation = this.generation;
    return this.refreshCsrf().pipe(
      switchMap(() => {
        if (generation !== this.generation) return superseded('Tenant sign in');
        return this.http.post<unknown>('/api/v1/auth/login', { email, password });
      }),
      switchMap((value) => {
        if (generation !== this.generation) return superseded('Tenant sign in');
        if (isChallenge(value)) return of(value);
        return this.establish(value, generation).pipe(map(() => null));
      }),
      timeout(15000),
    );
  }

  /** Step 2 (CF-065): the authenticator or recovery code. Returns the recovery codes when the account has just enrolled. */
  verify(challenge: string, code: string): Observable<readonly string[] | null> {
    const generation = this.generation;
    return this.http.post<unknown>('/api/v1/auth/totp', { challenge, code }).pipe(
      switchMap((value) => {
        if (generation !== this.generation) return superseded('Tenant sign in');
        const codes = readRecoveryCodes(value);
        return this.establish(value, generation).pipe(map(() => codes));
      }),
      timeout(15000),
    );
  }

  private establish(value: unknown, generation: number): Observable<void> {
    if (!isSessionIdentity(value)) return throwError(() => new Error('Invalid tenant session.'));
    return this.refreshCsrf().pipe(
      tap(() => {
        if (generation !== this.generation) throw new Error('Tenant sign in was superseded.');
        clearPendingLogout();
        this.currentIdentity.set(value);
      }),
    );
  }

  /** CF-087 (ADR-161): this device by default; `everywhere` ends every session of the account. */
  logout(everywhere = false): Observable<void> {
    this.clear();
    markLogoutPending(everywhere);
    return this.revokeSession(everywhere).pipe(
      tap(() => clearPendingLogout()),
      catchError((error: unknown) => {
        if (isAlreadySignedOut(error)) {
          clearPendingLogout();
          return of(undefined);
        }
        return throwError(() => error);
      }),
      switchMap(() => this.refreshCsrf()),
      timeout(15000),
    );
  }

  /**
   * A full page reload can abort an in-flight XHR. The tab-scoped marker contains no identity or
   * secret; it makes the replacement app finish revocation before it can resolve a cookie session.
   */
  private completePendingLogout(): Observable<void> {
    this.currentIdentity.set(null);
    const generation = ++this.generation;
    return (this.pending ??= this.revokeSession(pendingLogoutEverywhere()).pipe(
      tap(() => clearPendingLogout()),
      catchError((error: unknown) => {
        if (isAlreadySignedOut(error)) clearPendingLogout();
        return of(undefined);
      }),
      switchMap(() => this.refreshCsrf().pipe(catchError(() => of(undefined)))),
      finalize(() => {
        if (generation === this.generation) this.pending = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  private revokeSession(everywhere = false): Observable<void> {
    const generation = this.generation;
    return this.refreshCsrf().pipe(
      switchMap(() => {
        if (generation !== this.generation) return superseded('Tenant sign out');
        return this.http.post<void>(
          everywhere ? '/api/v1/auth/logout?everywhere=true' : '/api/v1/auth/logout',
          {},
        );
      }),
    );
  }

  private refreshCsrf(): Observable<void> {
    return this.http.get<void>('/api/v1/auth/csrf');
  }

  clear(): void {
    this.generation++;
    this.pending = undefined;
    this.currentIdentity.set(null);
  }
}

function isSessionIdentity(value: unknown): value is SessionIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['userId'] === 'string' &&
    item['userId'].length > 0 &&
    typeof item['tenantId'] === 'string' &&
    item['tenantId'].length > 0 &&
    Array.isArray(item['roles']) &&
    item['roles'].every((role) => typeof role === 'string') &&
    Array.isArray(item['permissions']) &&
    item['permissions'].every((permission) => typeof permission === 'string') &&
    optionalString(item['email']) &&
    optionalString(item['displayName']) &&
    optionalString(item['companyName']) &&
    (item['readOnlyUntilUtc'] === undefined ||
      item['readOnlyUntilUtc'] === null ||
      typeof item['readOnlyUntilUtc'] === 'string') &&
    !item['roles'].includes('PlatformOperator') &&
    !item['permissions'].some(
      (permission) => permission === '*' || permission.startsWith('Platform.'),
    )
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function superseded(operation: string): Observable<never> {
  return throwError(() => new Error(`${operation} was superseded.`));
}

function markLogoutPending(everywhere: boolean): void {
  try {
    sessionStorage.setItem(LOGOUT_PENDING_KEY, everywhere ? 'everywhere' : '1');
  } catch {
    // Browser storage can be unavailable under restrictive policies. Identity is still cleared and
    // the server revocation remains authoritative; the marker only closes the reload race.
  }
}

function hasPendingLogout(): boolean {
  try {
    const value = sessionStorage.getItem(LOGOUT_PENDING_KEY);
    return value === '1' || value === 'everywhere';
  } catch {
    return false;
  }
}

/** Whether the interrupted sign-out was for every device (a reload must finish it with the same scope). */
function pendingLogoutEverywhere(): boolean {
  try {
    return sessionStorage.getItem(LOGOUT_PENDING_KEY) === 'everywhere';
  } catch {
    return false;
  }
}

function clearPendingLogout(): void {
  try {
    sessionStorage.removeItem(LOGOUT_PENDING_KEY);
  } catch {
    // See markLogoutPending: server revocation remains authoritative.
  }
}

function isAlreadySignedOut(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
}

function isChallenge(value: unknown): value is TenantMfaChallenge {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    (item['status'] === 'totp_required' || item['status'] === 'enrollment_required') &&
    typeof item['challenge'] === 'string' &&
    item['challenge'].length > 0
  );
}

function readRecoveryCodes(value: unknown): readonly string[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const codes = (value as Record<string, unknown>)['recoveryCodes'];
  return Array.isArray(codes) && codes.every((code) => typeof code === 'string') ? codes : null;
}
