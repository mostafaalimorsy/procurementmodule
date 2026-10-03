import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

/**
 * What the company has purchased, as the server reports it.
 *
 * This is presentation only: it decides whether a menu item is worth showing, never whether an
 * operation is allowed. The backend re-decides every call, so a stale or tampered value here can
 * only ever produce a misleading menu, not access.
 */
@Injectable({ providedIn: 'root' })
export class EntitlementsService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<readonly string[] | null>(null);
  private readonly end = signal<string | null>(null);
  private pending?: Observable<void>;
  readonly features = this.current.asReadonly();
  /** CF-060 (ADR-137): the stage the plan's workflow ends at when it is not the full loop. */
  readonly workflowEndsAt = this.end.asReadonly();

  has(feature: string): boolean {
    return !!feature && (this.current()?.includes(feature) ?? false);
  }

  /** CF-105: the first of these features the loaded plan lacks (null while the plan is unknown, so nothing flashes "not included"). */
  missing(features: readonly string[]): string | null {
    const current = this.current();
    if (!current) return null;
    return features.find((feature) => !current.includes(feature)) ?? null;
  }

  load(): Observable<void> {
    if (this.pending) return this.pending;
    return (this.pending ??= this.http.get<unknown>('/api/v1/company/features').pipe(
      tap((value) => {
        this.current.set(readFeatures(value));
        this.end.set(readWorkflowEnd(value));
      }),
      map(() => undefined),
      // A company without a session or plan simply has no features; the guard then redirects.
      catchError(() => {
        this.current.set(null);
        this.end.set(null);
        return of(undefined);
      }),
      finalize(() => (this.pending = undefined)),
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  /** CF-105: read the plan again (after a denial the operator may have changed it); concurrent calls share one request. */
  refresh(): Observable<void> {
    return this.load();
  }

  clear(): void {
    this.pending = undefined;
    this.current.set(null);
    this.end.set(null);
  }
}

function readFeatures(value: unknown): readonly string[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const features = (value as Record<string, unknown>)['features'];
  if (!Array.isArray(features)) return null;
  return features.filter((feature): feature is string => typeof feature === 'string');
}

function readWorkflowEnd(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const end = (value as Record<string, unknown>)['workflowEndsAt'];
  return typeof end === 'string' ? end : null;
}
