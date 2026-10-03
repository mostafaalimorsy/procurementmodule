import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

// Part 12: the company-wide search. The server searches only the record types the caller may open (permission and plan); a type it
// cannot see is absent from the answer — no count, no hint that such records exist.

export type SearchType = 'Subcontractors' | 'Projects' | 'WorkPackages' | 'Tenders' | 'Closeouts';

export const SEARCH_TYPES: readonly SearchType[] = [
  'Subcontractors',
  'Projects',
  'WorkPackages',
  'Tenders',
  'Closeouts',
];

/** The status values each type can be filtered by (the record's own lifecycle vocabulary). */
export const SEARCH_STATUSES: Readonly<Record<SearchType, readonly string[]>> = {
  Subcontractors: ['Active', 'Inactive', 'Blocked'],
  Projects: ['Draft', 'Active', 'OnHold', 'Completed', 'Cancelled'],
  WorkPackages: ['Draft', 'Active', 'OnHold', 'Completed', 'Cancelled'],
  Tenders: ['Draft', 'Published', 'Cancelled'],
  Closeouts: ['Pending', 'InProgress', 'Reopened', 'Closed'],
};

export interface SearchHit {
  readonly type: SearchType;
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: string | null;
  readonly category: string | null;
}

export interface SearchGroup {
  readonly type: SearchType;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly items: readonly SearchHit[];
}

export interface SearchResult {
  readonly query: string;
  readonly type: SearchType | null;
  readonly groups: readonly SearchGroup[];
}

export interface SearchRequest {
  readonly q: string;
  readonly type?: SearchType | null;
  readonly status?: string | null;
  readonly page?: number;
}

@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly http = inject(HttpClient);

  search(request: SearchRequest): Observable<SearchResult> {
    let params = new HttpParams();
    if (request.q.trim()) params = params.set('q', request.q.trim());
    if (request.type) {
      params = params
        .set('type', request.type)
        .set('page', String(request.page ?? 1))
        .set('pageSize', '20');
      if (request.status) params = params.set('status', request.status);
    }
    return this.http.get<SearchResult>('/api/v1/search', { params });
  }
}
