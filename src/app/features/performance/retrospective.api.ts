import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CloseoutCompleteness,
  CloseoutOutcomeType,
  VariationCause,
  WouldWorkAgain,
} from './performance.api';

// CF-002 (ADR-126): retrospective outcomes — a firm's past work recorded from documents, labelled "retrospective — not system-evidenced"
// everywhere and never weighed by a recommendation. Money travels as exact decimal strings, never numbers.

/** Confirming and correcting is procurement leadership's (the shortlist-approval right). */
export const RETROSPECTIVE_CONFIRM_PERMISSION = 'Sourcing.ApproveShortlist';

export type RetrospectiveStatus = 'Draft' | 'Confirmed' | 'Correcting';
export const RETROSPECTIVE_STATUSES: readonly RetrospectiveStatus[] = [
  'Draft',
  'Correcting',
  'Confirmed',
];
export type RetrospectiveEventKind = 'Created' | 'Confirmed' | 'CorrectionStarted';

export interface RetrospectiveListItem {
  readonly id: string;
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly category: string;
  readonly projectLabel: string;
  readonly packageLabel: string;
  readonly status: RetrospectiveStatus;
  readonly currentVersionNumber: number;
  readonly recorded: number;
  readonly required: number;
  readonly imported: boolean;
  readonly updatedAtUtc: string;
}

export interface RetrospectivePage {
  readonly items: readonly RetrospectiveListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
}

export interface RetrospectiveCommercial {
  readonly awardValue: string | null;
  readonly actualFinalCost: string | null;
  readonly variationValue: string | null;
  readonly variationCause: VariationCause | null;
  readonly sectionVersion: string | null;
  readonly updatedAtUtc: string | null;
  readonly updatedByName: string | null;
}

export interface RetrospectiveExecution {
  readonly plannedDurationDays: number | null;
  readonly actualStartDate: string | null;
  readonly actualCompletionDate: string | null;
  readonly qualityRating: number | null;
  readonly hseRating: number | null;
  readonly wouldWorkAgain: WouldWorkAgain | null;
  readonly wouldWorkAgainRationale: string | null;
  readonly outcomeType: CloseoutOutcomeType | null;
  readonly percentComplete: number | null;
  readonly sectionVersion: string | null;
  readonly updatedAtUtc: string | null;
  readonly updatedByName: string | null;
}

export interface RetrospectiveVersion {
  readonly number: number;
  readonly authoritative: boolean;
  readonly confirmedAtUtc: string;
  readonly confirmedByName: string;
  readonly createdByName: string;
  readonly commercialRecordedByName: string | null;
  readonly executionRecordedByName: string | null;
  readonly awardValue: string | null;
  readonly actualFinalCost: string | null;
  readonly costVariancePercent: string | null;
  readonly actualDurationDays: number;
  readonly scheduleVariancePercent: string | null;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly wouldWorkAgain: WouldWorkAgain;
  readonly outcomeType: CloseoutOutcomeType;
  readonly correctionReason: string | null;
  readonly sha256: string;
  readonly fingerprintVerified: boolean;
}

export interface RetrospectiveEvent {
  readonly kind: RetrospectiveEventKind;
  readonly versionNumber: number;
  readonly atUtc: string;
  readonly actorName: string;
  readonly reason: string | null;
}

export interface RetrospectiveOutcome {
  readonly id: string;
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly tradeId: string;
  readonly category: string;
  readonly projectLabel: string;
  readonly packageLabel: string;
  readonly currency: string;
  readonly sourceReference: string;
  readonly imported: boolean;
  readonly status: RetrospectiveStatus;
  readonly version: string;
  readonly currentVersionNumber: number;
  readonly recordedAtUtc: string;
  readonly createdByName: string;
  readonly confirmedAtUtc: string | null;
  readonly confirmedByName: string | null;
  readonly commercial: RetrospectiveCommercial;
  readonly execution: RetrospectiveExecution;
  readonly completeness: CloseoutCompleteness;
  readonly versions: readonly RetrospectiveVersion[];
  readonly events: readonly RetrospectiveEvent[];
  readonly access: {
    readonly editCommercial: boolean;
    readonly editExecution: boolean;
    readonly confirm: boolean;
    readonly correct: boolean;
  };
  readonly commercialVisible: boolean;
}

export interface RetrospectiveImportIssue {
  readonly code: string;
  readonly column: string | null;
  readonly parameters?: Readonly<Record<string, string>> | null;
}

export interface RetrospectiveImportRow {
  readonly row: number;
  readonly subcontractorCode: string | null;
  readonly tradeCode: string | null;
  readonly projectLabel: string | null;
  readonly outcome: 'Create' | 'Duplicate' | 'Error';
  readonly issues: readonly RetrospectiveImportIssue[];
}

export interface RetrospectiveImportPreview {
  readonly sha256: string;
  readonly format: string;
  readonly rows: number;
  readonly toCreate: number;
  readonly duplicates: number;
  readonly errors: number;
  readonly fileIssues: readonly RetrospectiveImportIssue[];
  readonly items: readonly RetrospectiveImportRow[];
  readonly canConfirm: boolean;
}

export interface RetrospectiveImportResult {
  readonly sha256: string;
  readonly created: number;
  readonly duplicates: number;
}

export interface RetrospectiveCommercialDraft {
  awardValue: string;
  actualFinalCost: string;
  variationValue: string;
  variationCause: VariationCause | '';
}

export interface RetrospectiveExecutionDraft {
  plannedDurationDays: number | null;
  actualStartDate: string;
  actualCompletionDate: string;
  qualityRating: number | null;
  hseRating: number | null;
  wouldWorkAgain: WouldWorkAgain | '';
  wouldWorkAgainRationale: string;
  outcomeType: CloseoutOutcomeType | '';
  percentComplete: number | null;
}

export function retrospectiveCommercialDraft(
  commercial: RetrospectiveCommercial,
): RetrospectiveCommercialDraft {
  return {
    awardValue: commercial.awardValue ?? '',
    actualFinalCost: commercial.actualFinalCost ?? '',
    variationValue: commercial.variationValue ?? '',
    variationCause: commercial.variationCause ?? '',
  };
}

export function retrospectiveExecutionDraft(
  execution: RetrospectiveExecution,
): RetrospectiveExecutionDraft {
  return {
    plannedDurationDays: execution.plannedDurationDays,
    actualStartDate: execution.actualStartDate ?? '',
    actualCompletionDate: execution.actualCompletionDate ?? '',
    qualityRating: execution.qualityRating,
    hseRating: execution.hseRating,
    wouldWorkAgain: execution.wouldWorkAgain ?? '',
    wouldWorkAgainRationale: execution.wouldWorkAgainRationale ?? '',
    outcomeType: execution.outcomeType ?? '',
    percentComplete: execution.percentComplete,
  };
}

const text = (value: string): string | null => value.trim() || null;
const whole = (value: number | null | string): number | null =>
  value === null || value === '' || value === undefined ? null : Number(value);

@Injectable({ providedIn: 'root' })
export class RetrospectiveApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/performance/retrospective-outcomes';

  list(query: {
    status?: RetrospectiveStatus | '';
    search?: string;
    page?: number;
  }): Observable<RetrospectivePage> {
    let params = new HttpParams().set('page', String(query.page ?? 1)).set('pageSize', '24');
    if (query.status) params = params.set('status', query.status);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    return this.http.get<RetrospectivePage>(this.base, { params });
  }

  get(id: string): Observable<RetrospectiveOutcome> {
    return this.http.get<RetrospectiveOutcome>(`${this.base}/${encodeURIComponent(id)}`);
  }

  create(request: {
    subcontractorId: string;
    tradeId: string;
    projectLabel: string;
    packageLabel: string;
    currency: string;
    sourceReference: string;
    requestKey: string;
  }): Observable<RetrospectiveOutcome> {
    return this.http.post<RetrospectiveOutcome>(this.base, request);
  }

  saveCommercial(
    id: string,
    sectionVersion: string | null,
    draft: RetrospectiveCommercialDraft,
  ): Observable<RetrospectiveOutcome> {
    return this.http.put<RetrospectiveOutcome>(
      `${this.base}/${encodeURIComponent(id)}/commercial`,
      {
        sectionVersion,
        awardValue: text(draft.awardValue),
        actualFinalCost: text(draft.actualFinalCost),
        variationValue: text(draft.variationValue),
        variationCause: draft.variationCause || null,
      },
    );
  }

  saveExecution(
    id: string,
    sectionVersion: string | null,
    draft: RetrospectiveExecutionDraft,
  ): Observable<RetrospectiveOutcome> {
    return this.http.put<RetrospectiveOutcome>(`${this.base}/${encodeURIComponent(id)}/execution`, {
      sectionVersion,
      plannedDurationDays: whole(draft.plannedDurationDays),
      actualStartDate: draft.actualStartDate || null,
      actualCompletionDate: draft.actualCompletionDate || null,
      qualityRating: whole(draft.qualityRating),
      hseRating: whole(draft.hseRating),
      wouldWorkAgain: draft.wouldWorkAgain || null,
      wouldWorkAgainRationale: text(draft.wouldWorkAgainRationale),
      outcomeType: draft.outcomeType || null,
      percentComplete:
        draft.outcomeType && draft.outcomeType !== 'Completed'
          ? whole(draft.percentComplete)
          : null,
    });
  }

  confirm(id: string, version: string, requestKey: string): Observable<RetrospectiveOutcome> {
    return this.http.post<RetrospectiveOutcome>(`${this.base}/${encodeURIComponent(id)}/confirm`, {
      version,
      attested: true,
      requestKey,
    });
  }

  correct(
    id: string,
    version: string,
    reason: string,
    requestKey: string,
  ): Observable<RetrospectiveOutcome> {
    return this.http.post<RetrospectiveOutcome>(`${this.base}/${encodeURIComponent(id)}/correct`, {
      version,
      reason,
      requestKey,
    });
  }

  previewImport(file: File): Observable<RetrospectiveImportPreview> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<RetrospectiveImportPreview>(`${this.base}/import/preview`, form);
  }

  confirmImport(file: File, sha256: string): Observable<RetrospectiveImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('sha256', sha256);
    return this.http.post<RetrospectiveImportResult>(`${this.base}/import/confirm`, form);
  }

  templateUrl(): string {
    return `${this.base}/import/template`;
  }
}
