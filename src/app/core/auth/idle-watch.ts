import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';

/**
 * CF-068 (ADR-146): the server ends a workspace session after the company's idle timeout without a request. This watch keeps the time of
 * the last answered workspace API request and warns two minutes before the timeout, so the user can stay signed in.
 */
@Injectable({ providedIn: 'root' })
export class IdleWatch {
  private lastActivity = Date.now();
  readonly warning = signal(false);
  readonly expired = signal(false);

  touch(now = Date.now()): void {
    this.lastActivity = now;
    this.warning.set(false);
    this.expired.set(false);
  }

  /** Re-evaluated on a timer by the shell. */
  check(idleMinutes: number | undefined, now = Date.now()): void {
    if (!idleMinutes) return;
    const remaining = this.lastActivity + idleMinutes * 60_000 - now;
    this.expired.set(remaining <= 0);
    this.warning.set(remaining > 0 && remaining <= 2 * 60_000);
  }
}

/** Every answered workspace API request (not the console's, not the bidder portal's) counts as activity. */
export const idleActivityInterceptor: HttpInterceptorFn = (request, next) => {
  const watch = inject(IdleWatch);
  const tracked =
    request.url.startsWith('/api/v1/') &&
    !request.url.startsWith('/api/v1/platform/') &&
    !request.url.startsWith('/api/v1/tender-invitations/');
  return next(request).pipe(
    tap((event) => {
      if (tracked && event instanceof HttpResponse) watch.touch();
    }),
  );
};
