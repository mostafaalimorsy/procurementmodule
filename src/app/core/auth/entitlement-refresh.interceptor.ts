import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { EntitlementsService } from './entitlements.service';

const FEATURES_URL = '/api/v1/company/features';

/**
 * CF-105 (ADR-122): a request refused because the plan lacks a feature means the cached features may be stale (the operator changed the
 * plan), so they are read once more — a section added meanwhile then appears without a new sign-in, and a removed one disappears. The error
 * itself still reaches the caller unchanged.
 */
export const entitlementRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  const entitlements = inject(EntitlementsService);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        !request.url.startsWith(FEATURES_URL) &&
        (error.error as { code?: unknown } | null)?.code === 'entitlement.feature_not_entitled'
      )
        entitlements.refresh().subscribe();
      return throwError(() => error);
    }),
  );
};
