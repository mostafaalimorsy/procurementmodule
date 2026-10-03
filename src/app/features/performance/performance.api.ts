import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { problemMessage } from '../../core/localization/product-problem';
import { AWARD_FEATURES } from '../decision/decision.api';

// Part 11: performance closeout of awards and the company's private performance history. The C# contracts are the source of
// truth; enums travel as strings, money as exact decimal strings and percentages as two-decimal strings — never numbers.

export const PERFORMANCE_PERMISSIONS = {
  view: 'Performance.View',
  editCommercial: 'Performance.EditCommercial',
  editExecution: 'Performance.EditExecution',
  finalize: 'Performance.Finalize',
  reopen: 'Performance.Reopen',
} as const;

/** A closeout records the outcome of an award, so it needs the award feature and everything the award needs. */
export const PERFORMANCE_FEATURES: readonly string[] = ['performance', ...AWARD_FEATURES];

export const NOTE_MAX = 1000;
export const FEEDBACK_MAX = 2000;
export const REASON_MIN = 3;
export const REASON_MAX = 1000;
export const COUNT_MAX = 9999;

export type CloseoutLifecycle = 'Pending' | 'InProgress' | 'Reopened' | 'Closed';
export type MobilizationOutcome = 'AsPlanned' | 'MinorDelay' | 'MajorDelay' | 'NotApplicable';
export type WouldWorkAgain = 'Yes' | 'Conditional' | 'No';
export type VariationCause =
  'ClientChange' | 'DesignChange' | 'ScopeGap' | 'SiteCondition' | 'Other';
export type ScheduleOutcome = 'WithinDuration' | 'Late' | 'NoBaseline';
export type CloseoutEventKind = 'Started' | 'Finalized' | 'Reopened';
/** CF-048 (ADR-124): how the subcontract ended; only Completed compares cost and time with the award. */
export type CloseoutOutcomeType =
  | 'Completed'
  | 'TerminatedForDefault'
  | 'TerminatedForConvenience'
  | 'Abandoned'
  | 'Descoped'
  | 'CompletedByOthers';
export const OUTCOME_TYPES: readonly CloseoutOutcomeType[] = [
  'Completed',
  'TerminatedForDefault',
  'TerminatedForConvenience',
  'Abandoned',
  'Descoped',
  'CompletedByOthers',
];
/** CF-082: timing a finalizer confirms explicitly (finalized soon after the award, a very short duration). */
export type TimingWarning = 'finalized_soon' | 'short_duration';

export const LIFECYCLES: readonly CloseoutLifecycle[] = [
  'Pending',
  'InProgress',
  'Reopened',
  'Closed',
];
export const MOBILIZATION_OUTCOMES: readonly MobilizationOutcome[] = [
  'AsPlanned',
  'MinorDelay',
  'MajorDelay',
  'NotApplicable',
];
export const REHIRE_CHOICES: readonly WouldWorkAgain[] = ['Yes', 'Conditional', 'No'];
export const VARIATION_CAUSES: readonly VariationCause[] = [
  'ClientChange',
  'DesignChange',
  'ScopeGap',
  'SiteCondition',
  'Other',
];
export const RATINGS: readonly number[] = [1, 2, 3, 4, 5];

export interface CloseoutBaseline {
  readonly awardId: string;
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly workPackageId: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly category: string | null;
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  /** CF-073 (ADR-088): null for a reader without commercial visibility of this award. */
  readonly awardValue: string | null;
  readonly currency: string;
  readonly plannedDurationDays: number | null;
  readonly mobilizationCommitment: string | null;
  readonly scopeCompliance: string;
  readonly warrantyMonths: number | null;
  readonly exclusions: readonly string[];
  readonly commercialDeviationCount: number;
  readonly technicalDeviationCount: number;
  readonly technicalMeanAtAward: number | null;
  readonly awardedAtUtc: string;
  readonly baselineSha256: string;
  readonly baselineVerified: boolean;
}

export interface CommercialOutcome {
  readonly actualFinalCost: string | null;
  readonly costExplanation: string | null;
  readonly variationCount: number | null;
  readonly variationValue: string | null;
  readonly variationCause: VariationCause | null;
  readonly variationNote: string | null;
  readonly claimCount: number | null;
  readonly claimedValue: string | null;
  readonly unresolvedClaimCount: number | null;
  readonly claimNote: string | null;
  readonly disputeCount: number | null;
  readonly unresolvedDisputeCount: number | null;
  readonly disputeNote: string | null;
  readonly commercialFeedback: string | null;
  readonly evidenceNote: string | null;
  readonly sectionVersion: string | null;
  readonly updatedAtUtc: string | null;
  readonly updatedByName: string | null;
  /** CF-048: what completion by others cost (commercial; only for that outcome). */
  readonly costToCompleteByOthers?: string | null;
}

export interface ExecutionOutcome {
  readonly actualStartDate: string | null;
  readonly actualCompletionDate: string | null;
  readonly scheduleExplanation: string | null;
  readonly mobilization: MobilizationOutcome | null;
  readonly mobilizationNote: string | null;
  readonly qualityRating: number | null;
  readonly qualityComment: string | null;
  readonly hseRating: number | null;
  readonly hseComment: string | null;
  readonly executionFeedback: string | null;
  readonly wouldWorkAgain: WouldWorkAgain | null;
  readonly wouldWorkAgainRationale: string | null;
  readonly evidenceNote: string | null;
  readonly sectionVersion: string | null;
  readonly updatedAtUtc: string | null;
  readonly updatedByName: string | null;
  /** CF-048 / CF-082 (ADR-124). */
  readonly outcomeType?: CloseoutOutcomeType | null;
  readonly percentComplete?: number | null;
  readonly earlyWorksDeclared?: boolean;
  readonly earlyWorksNote?: string | null;
}

export interface CloseoutMetrics {
  /** CF-073 (ADR-088): null for a reader without commercial visibility of this award. */
  readonly awardValue: string | null;
  readonly actualFinalCost: string | null;
  /** Signed: "-50000.00" when the final cost finished below the award value. */
  readonly costVarianceAmount: string | null;
  /** Signed two-decimal percentage; null without a final cost or with a zero award value. */
  readonly costVariancePercent: string | null;
  readonly plannedDurationDays: number | null;
  readonly actualDurationDays: number | null;
  readonly durationVarianceDays: number | null;
  readonly scheduleVariancePercent: string | null;
  readonly scheduleOutcome: ScheduleOutcome | null;
  readonly impliedCompletionDate: string | null;
  readonly actualCompletionDate: string | null;
}

export interface CloseoutCompleteness {
  readonly complete: boolean;
  readonly recorded: number;
  readonly required: number;
  readonly missing: readonly string[];
}

export interface CloseoutVersion {
  readonly number: number;
  readonly authoritative: boolean;
  readonly finalizedAtUtc: string;
  readonly finalizedByName: string;
  readonly actualFinalCost: string | null;
  readonly costVariancePercent: string | null;
  readonly actualDurationDays: number;
  readonly scheduleVariancePercent: string | null;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly variationCount: number;
  readonly claimCount: number;
  readonly disputeCount: number;
  readonly wouldWorkAgain: WouldWorkAgain;
  readonly sha256: string;
  readonly fingerprintVerified: boolean;
  /** CF-048 / CF-082: v1 versions read Completed with no flags. */
  readonly outcomeType?: CloseoutOutcomeType;
  readonly fingerprintVersion?: number;
  readonly percentComplete?: number | null;
  readonly earlyWorksDeclared?: boolean;
  readonly timingWarnings?: readonly TimingWarning[];
}

export interface CloseoutEvent {
  readonly kind: CloseoutEventKind;
  readonly versionNumber: number;
  readonly atUtc: string;
  readonly actorName: string;
  readonly reason: string | null;
}

export interface CloseoutAccess {
  readonly editCommercial: boolean;
  readonly editExecution: boolean;
  readonly finalize: boolean;
  readonly reopen: boolean;
}

export interface CloseoutWorkspace {
  readonly awardId: string;
  readonly lifecycle: CloseoutLifecycle;
  readonly version: string | null;
  readonly baseline: CloseoutBaseline;
  readonly commercial: CommercialOutcome;
  readonly execution: ExecutionOutcome;
  readonly metrics: CloseoutMetrics;
  readonly completeness: CloseoutCompleteness;
  readonly currentVersionNumber: number;
  readonly closedAtUtc: string | null;
  readonly closedByName: string | null;
  readonly versions: readonly CloseoutVersion[];
  readonly events: readonly CloseoutEvent[];
  readonly access: CloseoutAccess;
  readonly serverTimeUtc: string;
  /** CF-073 (ADR-088): false when this closeout is shown without its commercial figures and notes (they are null). */
  readonly commercialVisible: boolean;
  /** CF-036: the project's assigned Project Manager (null: none assigned), and whether that is the reader. */
  readonly assignedProjectManagerName: string | null;
  readonly assignedToYou: boolean;
  /** CF-082: what finalizing now needs confirmed; whether the recorded works started or finished before the award. */
  readonly timingWarnings?: readonly TimingWarning[];
  readonly startsBeforeAward?: boolean;
}

export interface CloseoutListItem {
  readonly awardId: string;
  readonly tenderReference: string;
  readonly projectCode: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly category: string | null;
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly awardedAtUtc: string;
  /** CF-073 (ADR-088): null for a reader without commercial visibility of this award. */
  readonly awardValue: string | null;
  readonly currency: string;
  readonly lifecycle: CloseoutLifecycle;
  readonly recorded: number;
  readonly required: number;
  readonly closedAtUtc: string | null;
  readonly updatedAtUtc: string | null;
}

export interface CloseoutPage {
  readonly items: readonly CloseoutListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface CloseoutSummary {
  readonly pending: number;
  readonly inProgress: number;
  readonly reopened: number;
  readonly closed: number;
}

export interface PerformanceOutcome {
  readonly awardId: string;
  readonly versionNumber: number;
  readonly tenderReference: string;
  readonly projectCode: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly category: string | null;
  readonly awardedAtUtc: string;
  readonly closedAtUtc: string;
  readonly currency: string;
  readonly awardValue: string | null;
  readonly actualFinalCost: string | null;
  readonly costVariancePercent: string | null;
  readonly plannedDurationDays: number | null;
  readonly actualDurationDays: number;
  readonly scheduleVariancePercent: string | null;
  readonly scheduleOutcome: ScheduleOutcome;
  readonly mobilization: MobilizationOutcome | null;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly variationCount: number;
  readonly variationValue: string | null;
  readonly claimCount: number;
  readonly claimedValue: string | null;
  readonly unresolvedClaimCount: number;
  readonly disputeCount: number;
  readonly unresolvedDisputeCount: number;
  readonly wouldWorkAgain: WouldWorkAgain;
  /** CF-048 / CF-082 (ADR-124). */
  readonly outcomeType?: CloseoutOutcomeType;
  readonly earlyWorksDeclared?: boolean;
  readonly timingWarnings?: readonly TimingWarning[];
  readonly finalizedDaysAfterAward?: number | null;
  /** CF-025 (ADR-125). */
  readonly variationCause?: VariationCause | null;
  readonly variationAttribution?: string;
  readonly variationSharePercent?: string | null;
  readonly residualCostVariance?: string | null;
  readonly residualCostVariancePercent?: string | null;
}

export interface CategoryPerformance {
  readonly category: string | null;
  readonly sampleSize: number;
  readonly earliestClosedAtUtc: string;
  readonly latestClosedAtUtc: string;
  readonly qualityMean: string;
  readonly hseMean: string;
  readonly costVarianceMin: string | null;
  readonly costVarianceMax: string | null;
  readonly scheduleVarianceMin: string | null;
  readonly scheduleVarianceMax: string | null;
  readonly withinDuration: number;
  readonly late: number;
  readonly noDurationBaseline: number;
  readonly variations: number;
  readonly claims: number;
  readonly disputes: number;
  readonly unresolvedDisputes: number;
  readonly wouldWorkAgainYes: number;
  readonly wouldWorkAgainConditional: number;
  readonly wouldWorkAgainNo: number;
  readonly outcomes: readonly PerformanceOutcome[];
  /** CF-048: projects that did not complete, left out of the variance ranges and on-time counts. */
  readonly excludedFromVariance?: number;
}

export interface SubcontractorPerformance {
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly completedProjects: number;
  readonly categories: readonly CategoryPerformance[];
  readonly inCorrection: number;
  readonly inProgress: number;
  /** CF-073: false when award values, final costs and cost variances are withheld (null) from this reader. */
  readonly commercialVisible: boolean;
}

/** The commercial section as the form edits it: every field optional while the closeout is in progress. */
export interface CommercialDraft {
  actualFinalCost: string;
  costExplanation: string;
  variationCount: number | null;
  variationValue: string;
  variationCause: VariationCause | '';
  variationNote: string;
  claimCount: number | null;
  claimedValue: string;
  unresolvedClaimCount: number | null;
  claimNote: string;
  disputeCount: number | null;
  unresolvedDisputeCount: number | null;
  disputeNote: string;
  commercialFeedback: string;
  evidenceNote: string;
  costToCompleteByOthers: string;
}

export interface ExecutionDraft {
  actualStartDate: string;
  actualCompletionDate: string;
  scheduleExplanation: string;
  mobilization: MobilizationOutcome | '';
  mobilizationNote: string;
  qualityRating: number | null;
  qualityComment: string;
  hseRating: number | null;
  hseComment: string;
  executionFeedback: string;
  wouldWorkAgain: WouldWorkAgain | '';
  wouldWorkAgainRationale: string;
  evidenceNote: string;
  outcomeType: CloseoutOutcomeType | '';
  percentComplete: number | null;
  earlyWorksDeclared: boolean;
  earlyWorksNote: string;
}

export function commercialDraft(outcome: CommercialOutcome): CommercialDraft {
  return {
    actualFinalCost: outcome.actualFinalCost ?? '',
    costExplanation: outcome.costExplanation ?? '',
    variationCount: outcome.variationCount,
    variationValue: outcome.variationValue ?? '',
    variationCause: outcome.variationCause ?? '',
    variationNote: outcome.variationNote ?? '',
    claimCount: outcome.claimCount,
    claimedValue: outcome.claimedValue ?? '',
    unresolvedClaimCount: outcome.unresolvedClaimCount,
    claimNote: outcome.claimNote ?? '',
    disputeCount: outcome.disputeCount,
    unresolvedDisputeCount: outcome.unresolvedDisputeCount,
    disputeNote: outcome.disputeNote ?? '',
    commercialFeedback: outcome.commercialFeedback ?? '',
    evidenceNote: outcome.evidenceNote ?? '',
    costToCompleteByOthers: outcome.costToCompleteByOthers ?? '',
  };
}

export function executionDraft(outcome: ExecutionOutcome): ExecutionDraft {
  return {
    actualStartDate: outcome.actualStartDate ?? '',
    actualCompletionDate: outcome.actualCompletionDate ?? '',
    scheduleExplanation: outcome.scheduleExplanation ?? '',
    mobilization: outcome.mobilization ?? '',
    mobilizationNote: outcome.mobilizationNote ?? '',
    qualityRating: outcome.qualityRating,
    qualityComment: outcome.qualityComment ?? '',
    hseRating: outcome.hseRating,
    hseComment: outcome.hseComment ?? '',
    executionFeedback: outcome.executionFeedback ?? '',
    wouldWorkAgain: outcome.wouldWorkAgain ?? '',
    wouldWorkAgainRationale: outcome.wouldWorkAgainRationale ?? '',
    evidenceNote: outcome.evidenceNote ?? '',
    outcomeType: outcome.outcomeType ?? '',
    percentComplete: outcome.percentComplete ?? null,
    earlyWorksDeclared: outcome.earlyWorksDeclared ?? false,
    earlyWorksNote: outcome.earlyWorksNote ?? '',
  };
}

const text = (value: string): string | null => value.trim() || null;
const count = (value: number | null | string): number | null =>
  value === null || value === '' || value === undefined ? null : Number(value);

@Injectable({ providedIn: 'root' })
export class PerformanceApi {
  private readonly http = inject(HttpClient);

  list(query: {
    status?: CloseoutLifecycle | '';
    search?: string;
    page?: number;
  }): Observable<CloseoutPage> {
    let params = new HttpParams().set('page', String(query.page ?? 1)).set('pageSize', '24');
    if (query.status) params = params.set('status', query.status);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    return this.http.get<CloseoutPage>('/api/v1/performance/closeouts', { params });
  }

  summary(): Observable<CloseoutSummary> {
    return this.http.get<CloseoutSummary>('/api/v1/performance/closeouts/summary');
  }

  closeout(awardId: string): Observable<CloseoutWorkspace> {
    return this.http.get<CloseoutWorkspace>(this.path(awardId));
  }

  /** Money fields must already be canonical decimal strings (validated by the form); blanks are "not recorded yet". */
  saveCommercial(
    awardId: string,
    sectionVersion: string | null,
    draft: CommercialDraft,
  ): Observable<CloseoutWorkspace> {
    return this.http.put<CloseoutWorkspace>(`${this.path(awardId)}/commercial`, {
      sectionVersion,
      actualFinalCost: text(draft.actualFinalCost),
      costExplanation: text(draft.costExplanation),
      variationCount: count(draft.variationCount),
      variationValue: text(draft.variationValue),
      variationCause: draft.variationCause || null,
      variationNote: text(draft.variationNote),
      claimCount: count(draft.claimCount),
      claimedValue: text(draft.claimedValue),
      unresolvedClaimCount: count(draft.unresolvedClaimCount),
      claimNote: text(draft.claimNote),
      disputeCount: count(draft.disputeCount),
      unresolvedDisputeCount: count(draft.unresolvedDisputeCount),
      disputeNote: text(draft.disputeNote),
      commercialFeedback: text(draft.commercialFeedback),
      evidenceNote: text(draft.evidenceNote),
      costToCompleteByOthers: text(draft.costToCompleteByOthers),
    });
  }

  saveExecution(
    awardId: string,
    sectionVersion: string | null,
    draft: ExecutionDraft,
  ): Observable<CloseoutWorkspace> {
    return this.http.put<CloseoutWorkspace>(`${this.path(awardId)}/execution`, {
      sectionVersion,
      actualStartDate: draft.actualStartDate || null,
      actualCompletionDate: draft.actualCompletionDate || null,
      scheduleExplanation: text(draft.scheduleExplanation),
      mobilization: draft.mobilization || null,
      mobilizationNote: text(draft.mobilizationNote),
      qualityRating: count(draft.qualityRating),
      qualityComment: text(draft.qualityComment),
      hseRating: count(draft.hseRating),
      hseComment: text(draft.hseComment),
      executionFeedback: text(draft.executionFeedback),
      wouldWorkAgain: draft.wouldWorkAgain || null,
      wouldWorkAgainRationale: text(draft.wouldWorkAgainRationale),
      evidenceNote: text(draft.evidenceNote),
      outcomeType: draft.outcomeType || null,
      // A completed subcontract is complete by definition.
      percentComplete:
        draft.outcomeType && draft.outcomeType !== 'Completed'
          ? count(draft.percentComplete)
          : null,
      earlyWorksDeclared: draft.earlyWorksDeclared,
      earlyWorksNote: draft.earlyWorksDeclared ? text(draft.earlyWorksNote) : null,
    });
  }

  /** CF-036: `notAssignedConfirmed` — the reader confirmed finalizing a project another Project Manager is assigned to. */
  finalize(
    awardId: string,
    version: string,
    requestKey: string,
    notAssignedConfirmed = false,
    timingConfirmed = false,
  ): Observable<CloseoutWorkspace> {
    return this.http.post<CloseoutWorkspace>(`${this.path(awardId)}/finalize`, {
      version,
      confirmed: true,
      requestKey,
      notAssignedConfirmed,
      // CF-082: the finalizer confirmed the timing warnings shown in the dialog.
      timingConfirmed,
    });
  }

  reopen(
    awardId: string,
    version: string,
    reason: string,
    requestKey: string,
  ): Observable<CloseoutWorkspace> {
    return this.http.post<CloseoutWorkspace>(`${this.path(awardId)}/reopen`, {
      version,
      reason: reason.trim(),
      confirmed: true,
      requestKey,
    });
  }

  subcontractor(subcontractorId: string): Observable<SubcontractorPerformance> {
    return this.http.get<SubcontractorPerformance>(
      `/api/v1/performance/subcontractors/${subcontractorId}`,
    );
  }

  private path(awardId: string): string {
    return `/api/v1/performance/closeouts/${awardId}`;
  }
}

export function performanceProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}
