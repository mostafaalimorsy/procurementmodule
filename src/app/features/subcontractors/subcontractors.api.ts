import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { knownProductProblem, problemMessage } from '../../core/localization/product-problem';
import { SubcontractorStatus, subcontractorStatusLabel } from '../../core/localization/labels';

export type { SubcontractorStatus } from '../../core/localization/labels';

export const DIRECTORY_PERMISSIONS = {
  view: 'Subcontractors.View',
  create: 'Subcontractors.Create',
  edit: 'Subcontractors.Edit',
  changeStatus: 'Subcontractors.ChangeStatus',
  block: 'Subcontractors.Block',
  import: 'Subcontractors.Import',
  manageTrades: 'Trades.Manage',
} as const;

export const DIRECTORY_FEATURE = 'subcontractor_directory';

export const SUBCONTRACTOR_STATUSES: readonly SubcontractorStatus[] = [
  'Active',
  'Inactive',
  'Blocked',
];

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface TradeRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface Trade extends TradeRef {
  readonly subcontractorCount: number;
  readonly updatedAtUtc: string;
  readonly version: string;
}

/** CF-027 (ADR-089): one stored category text and the trade it resolves to. */
export interface CategoryMappingRow {
  readonly sourceKey: string;
  readonly label: string;
  readonly workPackages: number;
  readonly closeouts: number;
  /** Manual, TradeRenamed, MatchedByName or Unmapped. */
  readonly resolution: string;
  readonly tradeId: string | null;
  readonly tradeCode: string | null;
  readonly tradeName: string | null;
  readonly mappedAtUtc: string | null;
  readonly mappedByName: string | null;
}

export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isPrimary: boolean;
}

export interface SubcontractorSummary {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly status: SubcontractorStatus;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly trades: readonly TradeRef[];
  readonly primaryContactName: string | null;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** CF-014 (ADR-130): finalized closeouts across categories, for intelligence readers (absent otherwise). */
  readonly history?: SubcontractorHistory | null;
}

export interface SubcontractorHistory {
  readonly closeouts: number;
  readonly categories: number;
  readonly latestClosedAtUtc: string | null;
}

export interface SubcontractorDetail {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly commercialRegistrationNumber: string | null;
  readonly taxRegistrationNumber: string | null;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly status: SubcontractorStatus;
  readonly statusReason: string | null;
  readonly notes: string | null;
  readonly imported: boolean;
  readonly trades: readonly TradeRef[];
  readonly contacts: readonly Contact[];
  readonly allowedNextStatuses: readonly SubcontractorStatus[];
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly version: string;
}

export interface ContactWrite {
  readonly id: string | null;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isPrimary: boolean;
}

export interface SubcontractorWrite {
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly commercialRegistrationNumber: string | null;
  readonly taxRegistrationNumber: string | null;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly notes: string | null;
  readonly tradeIds: readonly string[];
  readonly contacts: readonly ContactWrite[];
}

export interface DirectoryListOptions {
  readonly search?: string;
  readonly status?: readonly SubcontractorStatus[];
  readonly tradeId?: string | null;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'Code' | 'LegalName' | 'UpdatedAt';
  readonly desc?: boolean;
}

/**
 * The largest file the directory import accepts in any format (an .xlsx workbook), checked here first
 * to spare an upload. The server applies each format's own cap: CSV files are smaller.
 */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_CSV_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_TEMPLATE_URL = '/api/v1/subcontractors/import/template';

/** CF-056 (ADR-096): Update adds what an existing firm lacks; Contact is a continuation row adding a contact to an earlier row's firm. */
export type ImportRowOutcome = 'Create' | 'Unchanged' | 'Differs' | 'Error' | 'Update' | 'Contact';

/** CF-056: how the import treats the file — the valid rows only, or all or nothing; and whether existing firms receive what they lack. */
export interface ImportOptions {
  readonly validRows: boolean;
  readonly updateExisting: boolean;
}

export interface ImportIssue {
  readonly severity: 'Warning' | 'Error';
  readonly code: string;
  readonly column: string | null;
  readonly parameters: Readonly<Record<string, string>> | null;
}

export interface ImportRow {
  readonly row: number;
  readonly code: string | null;
  readonly legalName: string | null;
  readonly outcome: ImportRowOutcome;
  readonly differingFields: readonly string[];
  readonly issues: readonly ImportIssue[];
  /** CF-056: what an update adds to the existing firm. */
  readonly addedFields?: readonly string[] | null;
}

export interface ImportCounts {
  readonly rows: number;
  readonly create: number;
  readonly unchanged: number;
  readonly differs: number;
  readonly errors: number;
  readonly warnings: number;
  readonly update?: number;
  readonly contact?: number;
}

export interface ImportPreview {
  readonly sha256: string;
  readonly format: 'Csv' | 'Xlsx';
  readonly counts: ImportCounts;
  readonly capacity: {
    readonly usage: number;
    readonly limit: number | null;
    readonly required: number;
    readonly sufficient: boolean;
  };
  readonly fileIssues: readonly ImportIssue[];
  readonly rows: readonly ImportRow[];
  readonly canConfirm: boolean;
}

export interface ImportResult {
  readonly batchId: string;
  readonly sha256: string;
  readonly format: 'Csv' | 'Xlsx';
  readonly counts: ImportCounts;
  /** CF-056: the rows not imported (download them as a correction sheet). */
  readonly rejected?: readonly ImportRow[] | null;
}

/** Red-team G044 (CF-044 AC6): one piece of live work with the firm — the tender and, for a decision, its state. No amounts. */
export interface SubcontractorEngagement {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  /** Draft, PendingApproval or Approved for a decision; null for an invitation. */
  readonly decisionState: string | null;
}

/** Red-team G044: what blocking the firm would affect — its open invitations and the decisions proposing it. */
export interface SubcontractorEngagements {
  readonly invitations: readonly SubcontractorEngagement[];
  readonly decisions: readonly SubcontractorEngagement[];
}

@Injectable({ providedIn: 'root' })
export class DirectoryApi {
  private readonly http = inject(HttpClient);

  list(options: DirectoryListOptions = {}): Observable<Paged<SubcontractorSummary>> {
    let params = new HttpParams();
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    for (const status of options.status ?? []) params = params.append('status', status);
    if (options.tradeId) params = params.set('tradeId', options.tradeId);
    if (options.page) params = params.set('page', options.page);
    if (options.pageSize) params = params.set('pageSize', options.pageSize);
    if (options.sortBy) params = params.set('sortBy', options.sortBy);
    if (options.desc !== undefined) params = params.set('desc', options.desc);
    return this.http.get<Paged<SubcontractorSummary>>('/api/v1/subcontractors', { params });
  }

  get(id: string): Observable<SubcontractorDetail> {
    return this.http.get<SubcontractorDetail>(this.url(id));
  }

  create(request: SubcontractorWrite & { code: string }): Observable<SubcontractorDetail> {
    return this.http.post<SubcontractorDetail>('/api/v1/subcontractors', request);
  }

  update(
    id: string,
    request: SubcontractorWrite & { version: string },
  ): Observable<SubcontractorDetail> {
    return this.http.put<SubcontractorDetail>(this.url(id), request);
  }

  /** CF-071 (ADR-134): pseudonymises one non-primary contact on request. */
  eraseContact(id: string, contactId: string, version: string): Observable<SubcontractorDetail> {
    return this.http.post<SubcontractorDetail>(
      `${this.url(id)}/contacts/${encodeURIComponent(contactId)}/erase`,
      { version },
    );
  }

  changeStatus(
    id: string,
    status: SubcontractorStatus,
    reason: string | null,
    version: string,
  ): Observable<SubcontractorDetail> {
    return this.http.post<SubcontractorDetail>(`${this.url(id)}/status`, {
      status,
      reason,
      version,
    });
  }

  /** Red-team G044 (CF-044 AC6): the live invitations and pending decisions a block would affect (block right required). */
  engagements(id: string): Observable<SubcontractorEngagements> {
    return this.http.get<SubcontractorEngagements>(`${this.url(id)}/engagements`);
  }

  /** CF-027 (ADR-089): every stored category text history reads, with what it resolves to (trade managers only). */
  categoryMappings(): Observable<CategoryMappingRow[]> {
    return this.http.get<CategoryMappingRow[]>('/api/v1/category-mappings');
  }

  /** Maps a stored category text to a trade, or clears its mapping (tradeId null). Audited. */
  setCategoryMapping(sourceKey: string, tradeId: string | null): Observable<CategoryMappingRow[]> {
    return this.http.put<CategoryMappingRow[]>('/api/v1/category-mappings', { sourceKey, tradeId });
  }

  trades(): Observable<Trade[]> {
    return this.http.get<Trade[]>('/api/v1/trades');
  }

  createTrade(code: string, name: string): Observable<Trade> {
    return this.http.post<Trade>('/api/v1/trades', { code, name });
  }

  renameTrade(id: string, name: string, version: string): Observable<Trade> {
    return this.http.put<Trade>(`/api/v1/trades/${encodeURIComponent(id)}`, { name, version });
  }

  setTradeActive(id: string, isActive: boolean, version: string): Observable<Trade> {
    return this.http.post<Trade>(`/api/v1/trades/${encodeURIComponent(id)}/status`, {
      isActive,
      version,
    });
  }

  /** Judges a file without storing it or anything else. */
  previewImport(file: File, options?: ImportOptions): Observable<ImportPreview> {
    return this.http.post<ImportPreview>(
      '/api/v1/subcontractors/import/preview',
      this.form(file, undefined, options),
    );
  }

  /** CF-056: the rows that cannot be imported, as a CSV correction sheet (cells as written, plus the issue codes). */
  importCorrections(file: File, options?: ImportOptions): Observable<Blob> {
    return this.http.post(
      '/api/v1/subcontractors/import/corrections',
      this.form(file, undefined, options),
      { responseType: 'blob' },
    );
  }

  /** Sends the same file again with the checksum its preview returned; the server judges it anew. */
  confirmImport(file: File, sha256: string, options?: ImportOptions): Observable<ImportResult> {
    return this.http.post<ImportResult>(
      '/api/v1/subcontractors/import/confirm',
      this.form(file, sha256, options),
    );
  }

  private form(file: File, sha256?: string, options?: ImportOptions): FormData {
    const form = new FormData();
    form.append('file', file, file.name);
    if (sha256) form.append('sha256', sha256);
    if (options) {
      form.append('mode', options.validRows ? 'valid_rows' : 'all_or_nothing');
      if (options.updateExisting) form.append('updateExisting', 'true');
    }
    return form;
  }

  private url(id: string): string {
    return `/api/v1/subcontractors/${encodeURIComponent(id)}`;
  }
}

/** One resolution order for every directory screen: known code, then localized fallback. */
export function directoryProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}

/**
 * Import refusals: a known code first; a body the proxy refused for size carries no code, so its
 * status is explained in the same words as the server's own size refusal.
 */
export function importProblemMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 413)
    return (
      knownProductProblem({
        code: 'import.file_too_large',
        parameters: { max: IMPORT_MAX_BYTES },
      }) ?? directoryProblemMessage(error)
    );
  return directoryProblemMessage(error);
}

export const statusLabel = subcontractorStatusLabel;
