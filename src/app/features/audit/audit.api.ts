import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Paged } from '../subcontractors/subcontractors.api';

// Part 12: the company audit log (Company Administration only). Metadata arrives already reduced by the server to short facts —
// identifiers, codes, counts and states; free text, contact data, secrets, amounts and hashes never leave it.

export const AUDIT_PERMISSION = 'Audit.View';

export type AuditActorKind = 'User' | 'Bidder' | 'System' | 'Platform';
export type AuditArea =
  | 'Identity'
  | 'Company'
  | 'Projects'
  | 'Directory'
  | 'Sourcing'
  | 'Tendering'
  | 'Evaluation'
  | 'Decision'
  | 'Performance'
  | 'SignIns'
  | 'Other';

export const AUDIT_AREAS: readonly AuditArea[] = [
  'Identity',
  'Company',
  'Projects',
  'Directory',
  'Sourcing',
  'Tendering',
  'Evaluation',
  'Decision',
  'Performance',
  'SignIns',
  'Other',
];

export interface AuditEntry {
  readonly id: string;
  readonly occurredAtUtc: string;
  readonly actorKind: AuditActorKind;
  readonly actorName: string | null;
  readonly actorAccountId: string | null;
  readonly action: string;
  readonly area: AuditArea;
  readonly targetType: string | null;
  readonly reference: string | null;
  readonly details: readonly { readonly key: string; readonly value: string }[];
  /** The member an identity event concerns (role change, suspension, reset). */
  readonly targetName: string | null;
  /** CF-095 (ADR-132): the person was erased — shown as an erased user, never by a former name. */
  readonly targetErased?: boolean;
  readonly actorErased?: boolean;
  /** CF-122 (ADR-148): the request the event was recorded in; null for the product's own changes. */
  readonly request?: AuditRequest | null;
}

/** CF-122 (ADR-148): request id (the X-Request-Id / error traceId), client address as trusted proxies vouch for it, user agent. */
export interface AuditRequest {
  readonly requestId: string | null;
  readonly sourceAddress: string | null;
  readonly userAgent: string | null;
}

export interface AuditFacets {
  readonly actions: readonly string[];
  readonly actors: readonly { readonly accountId: string; readonly displayName: string }[];
}

export interface AuditFilter {
  readonly area?: AuditArea | '';
  readonly action?: string;
  /** An account id, or one of the non-member kinds. */
  readonly actor?: string;
  readonly from?: string;
  readonly to?: string;
  readonly reference?: string;
  /** CF-122 (ADR-148): the entries one request recorded. */
  readonly requestId?: string;
}

export interface AuditExportResult {
  readonly blob: Blob;
  readonly rows: number;
  readonly truncated: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  list(filter: AuditFilter, page: number): Observable<Paged<AuditEntry>> {
    return this.http.get<Paged<AuditEntry>>('/api/v1/admin/audit', {
      params: params(filter).set('page', String(page)).set('pageSize', '25'),
    });
  }

  facets(): Observable<AuditFacets> {
    return this.http.get<AuditFacets>('/api/v1/admin/audit/facets');
  }

  exportCsv(filter: AuditFilter): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/v1/admin/audit/export', {
      params: params(filter),
      responseType: 'blob',
      observe: 'response',
    });
  }
}

function params(filter: AuditFilter): HttpParams {
  let result = new HttpParams();
  if (filter.area) result = result.set('area', filter.area);
  if (filter.action) result = result.set('action', filter.action);
  if (filter.actor === 'Bidder' || filter.actor === 'System' || filter.actor === 'Platform')
    result = result.set('actorKind', filter.actor);
  else if (filter.actor) result = result.set('actorAccountId', filter.actor);
  if (filter.from) result = result.set('from', filter.from);
  if (filter.to) result = result.set('to', filter.to);
  if (filter.reference?.trim()) result = result.set('reference', filter.reference.trim());
  if (filter.requestId?.trim()) result = result.set('requestId', filter.requestId.trim());
  return result;
}
