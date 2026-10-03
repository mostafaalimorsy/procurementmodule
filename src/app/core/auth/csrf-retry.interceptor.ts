import {
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, filter, switchMap, take, throwError } from 'rxjs';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ADR-176: an antiforgery refusal means the request did nothing — its token was issued to another session (locally the workspace and
 * the console share a host, so signing in to one replaces the other's antiforgery cookie). The token for the request's own surface is
 * read again and the request retried once; a second refusal reaches the caller unchanged.
 */
export const csrfRetryInterceptor: HttpInterceptorFn = (request, next) => {
  if (READS.has(request.method) || !request.url.startsWith('/api/')) return next(request);
  const tokens = inject(HttpXsrfTokenExtractor);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 400 ||
        (error.error as { code?: unknown } | null)?.code !== 'request.antiforgery_invalid'
      )
        return throwError(() => error);
      const csrf = request.url.startsWith('/api/v1/platform/')
        ? '/api/v1/platform/auth/csrf'
        : '/api/v1/auth/csrf';
      return next(new HttpRequest('GET', csrf)).pipe(
        filter((event) => event.type === HttpEventType.Response),
        take(1),
        // The built-in XSRF interceptor ran before this one, so the fresh token is set here.
        switchMap(() => {
          const token = tokens.getToken();
          return next(token ? request.clone({ setHeaders: { 'X-XSRF-TOKEN': token } }) : request);
        }),
      );
    }),
  );
};
