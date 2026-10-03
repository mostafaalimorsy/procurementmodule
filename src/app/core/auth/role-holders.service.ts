import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { SessionService } from './session.service';

/** `GET /api/v1/access/role-holders` — the roles holding a permission, in the matrix's assignable-role order. */
export interface RoleHolders {
  readonly permission: string;
  readonly roles: readonly string[];
}

/**
 * S-ROLES (CF-101 AC2, CF-013 AC3): which roles hold a permission, read from the permission matrix, so copy such as "Only Company Admin
 * can reopen it" follows the matrix instead of hard-coding a role. Presentation only — nothing here authorizes anything.
 *
 * Answers are cached for the session (the matrix changes only with a release or a company setting) and dropped when the signed-in
 * account changes. A failed read is not cached, and the caller leaves the role names out.
 */
@Injectable({ providedIn: 'root' })
export class RoleHoldersService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly cache = new Map<string, Observable<readonly string[]>>();
  private cachedFor: string | null = null;

  rolesWith(permission: string): Observable<readonly string[]> {
    const identity = this.session.identity();
    const owner = identity ? `${identity.tenantId}/${identity.userId}` : '';
    if (owner !== this.cachedFor) {
      this.cache.clear();
      this.cachedFor = owner;
    }
    const cached = this.cache.get(permission);
    if (cached) return cached;
    const request: Observable<readonly string[]> = this.http
      .get<RoleHolders>('/api/v1/access/role-holders', { params: { permission } })
      .pipe(
        map((answer) => (Array.isArray(answer?.roles) ? answer.roles : [])),
        catchError((error: unknown) => {
          if (this.cache.get(permission) === request) this.cache.delete(permission);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.cache.set(permission, request);
    return request;
  }
}
