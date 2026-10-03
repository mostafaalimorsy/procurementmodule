import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  timeout,
} from 'rxjs';

export interface PlatformIdentity {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
}

/** CF-066 (ADR-142): the password step's answer — a TOTP code is needed (with a new secret to enroll on the first sign-in). */
export interface OperatorChallenge {
  readonly status: 'totp_required' | 'enrollment_required';
  readonly challenge: string;
  readonly secret: string | null;
  readonly provisioningUri: string | null;
}

/** Platform identity is resolved independently of tenant roles. Cookies stay browser-managed. */
@Injectable({ providedIn: 'root' })
export class PlatformSessionService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<PlatformIdentity | null>(null);
  private pending?: Observable<void>;
  private generation = 0;
  readonly identity = this.current.asReadonly();

  load(): Observable<void> {
    if (this.pending) return this.pending;
    this.current.set(null);
    const generation = ++this.generation;
    return (this.pending = this.http.get<unknown>('/api/v1/platform/auth/session').pipe(
      timeout(5000),
      tap((value) => {
        if (generation === this.generation)
          this.current.set(isPlatformIdentity(value) ? value : null);
      }),
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => {
        if (generation === this.generation) this.pending = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  /** Step 1: the password. Nothing is signed in yet; the answer is the challenge for the TOTP step. */
  login(email: string, password: string): Observable<OperatorChallenge> {
    this.clear();
    const generation = this.generation;
    return this.refreshCsrf().pipe(
      switchMap(() => {
        if (generation !== this.generation) throw new Error('Platform sign in was superseded.');
        return this.http.post<unknown>('/api/v1/platform/auth/login', { email, password });
      }),
      map((value) => {
        if (generation !== this.generation) throw new Error('Platform sign in was superseded.');
        if (!isChallenge(value)) throw new Error('Invalid sign-in challenge.');
        return value;
      }),
      timeout(15000),
    );
  }

  /** Step 2: the TOTP code (enrolling the challenge's secret on the first sign-in) — only now is the operator signed in. */
  verify(challenge: string, code: string): Observable<void> {
    const generation = this.generation;
    return this.http.post<unknown>('/api/v1/platform/auth/totp', { challenge, code }).pipe(
      switchMap((value) => {
        if (generation !== this.generation) throw new Error('Platform sign in was superseded.');
        if (!isPlatformIdentity(value)) throw new Error('Invalid platform session.');
        return this.refreshCsrf().pipe(map(() => value));
      }),
      tap((value) => {
        if (generation !== this.generation) throw new Error('Platform sign in was superseded.');
        this.current.set(value);
      }),
      map(() => undefined),
      timeout(15000),
    );
  }

  /** A new operator sets their own password from the one-time setup link. */
  setup(token: string, password: string): Observable<void> {
    return this.refreshCsrf().pipe(
      switchMap(() => this.http.post<void>('/api/v1/platform/auth/setup', { token, password })),
      map(() => undefined),
      timeout(15000),
    );
  }

  logout(): Observable<void> {
    this.clear();
    const generation = this.generation;
    return this.refreshCsrf().pipe(
      switchMap(() => {
        if (generation !== this.generation) throw new Error('Platform sign out was superseded.');
        return this.http.post<void>('/api/v1/platform/auth/logout', {});
      }),
      switchMap(() => this.refreshCsrf()),
      timeout(15000),
    );
  }

  private refreshCsrf(): Observable<void> {
    return this.http.get<void>('/api/v1/platform/auth/csrf');
  }

  clear(): void {
    this.generation++;
    this.pending = undefined;
    this.current.set(null);
  }
}

function isPlatformIdentity(value: unknown): value is PlatformIdentity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['id'] === 'string' &&
    item['id'].length > 0 &&
    typeof item['email'] === 'string' &&
    item['email'].includes('@') &&
    !('tenantId' in item)
  );
}

function isChallenge(value: unknown): value is OperatorChallenge {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item['status'] === 'totp_required' || item['status'] === 'enrollment_required') &&
    typeof item['challenge'] === 'string' &&
    item['challenge'].length > 0
  );
}
