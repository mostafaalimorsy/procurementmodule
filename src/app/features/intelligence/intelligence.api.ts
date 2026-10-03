import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { problemMessage } from '../../core/localization/product-problem';
import { PERFORMANCE_FEATURES } from '../performance/performance.api';

// Part 12: subcontractor intelligence and the Home dashboard. The C# contracts are the source of truth: rates, variances, hours
// and money travel as decimal strings (never numbers), enums as strings, and a field the caller may not see is absent on the
// server (null here), never merely hidden in the browser.

export const INTELLIGENCE_PERMISSIONS = {
  view: 'Intelligence.View',
  viewCommercial: 'Intelligence.ViewCommercial',
} as const;

/** Intelligence reads procurement, decision and performance evidence together, so it needs every feature they need. */
export const INTELLIGENCE_FEATURES: readonly string[] = ['intelligence', ...PERFORMANCE_FEATURES];

/** CF-080 (ADR-131): the read-only pilot metrics — procurement leadership, the Director and company administration. */
export const METRICS_PERMISSION = 'Metrics.View';

/** Days with one decimal; median and p90 only from two observations. */
export interface PilotDuration {
  readonly count: number;
  readonly median: string | null;
  readonly p90: string | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
}

export interface PilotPeriod {
  readonly from: string;
  readonly to: string;
  readonly tenderCycleDays: PilotDuration;
  readonly invitations: {
    readonly issued: number;
    readonly valid: number;
    readonly replied: number;
    readonly submitted: number;
    readonly responseRatePercent: string | null;
    readonly submissionRatePercent: string | null;
  };
  readonly openingToLevelingDays: PilotDuration;
  readonly decisionApprovalDays: PilotDuration;
  readonly recommendations: {
    readonly computed: number;
    readonly weighingHistory: number;
    readonly historyApplied: number;
    readonly appliedPercent: string | null;
  };
  readonly closeouts: {
    readonly awards: number;
    readonly due30: number;
    readonly within30: number;
    readonly within30Percent: string | null;
    readonly due60: number;
    readonly within60: number;
    readonly within60Percent: string | null;
  };
}

export interface PilotMetrics {
  readonly from: string;
  readonly to: string;
  readonly generatedAtUtc: string;
  readonly rule: string;
  readonly total: PilotPeriod;
  readonly months: readonly PilotPeriod[];
  readonly truncated: boolean;
}

export type EvidenceStrength = 'None' | 'Limited' | 'Moderate' | 'Strong';
export type ParticipationOutcome =
  'Open' | 'Revoked' | 'Cancelled' | 'Submitted' | 'Declined' | 'NoResponse';
export type SimilarityReason = 'SameCategory' | 'SameProject' | 'ComparableValue';

export interface SampleSummary {
  readonly count: number;
  readonly median: string | null;
  readonly mean: string | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
}

export interface IntelligenceAccess {
  readonly commercial: boolean;
  readonly performance: boolean;
  readonly decisions: boolean;
}

export interface CategoryOption {
  readonly key: string;
  readonly category: string | null;
  readonly invitations: number;
  readonly completedProjects: number;
  readonly latestActivityUtc: string | null;
}

export interface ProcurementIntelligence {
  readonly issued: number;
  readonly open: number;
  readonly revoked: number;
  readonly cancelled: number;
  readonly valid: number;
  readonly submitted: number;
  readonly declined: number;
  readonly noResponse: number;
  /** CF-049 (ADR-100): the firm submitted and then withdrew before the deadline (valid, not a bid). */
  readonly withdrawn?: number;
  readonly reliabilityPercent: string | null;
  readonly hoursToFirstReply: SampleSummary;
  readonly hoursToFirstSubmission: SampleSummary;
  /** CF-124 (ADR-128): the share of the bidding window used before the first submission, in percent — the primary speed figure. */
  readonly windowShareToFirstSubmission?: SampleSummary | null;
  readonly earliestInvitationUtc: string | null;
  readonly latestInvitationUtc: string | null;
}

export interface AwardItem {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly category: string | null;
  readonly awardedAtUtc: string;
  readonly disposition: 'Award' | 'Reserve' | 'Reject' | string;
  readonly recommendedRank: number | null;
  readonly awardWasOverride: boolean;
  /**
   * Red-team G077 (CF-046 AC8): which award of the tender this row is — a tender may have a declined or withdrawn award before the one in
   * force, so the list keys by award — and where that award stands (NotRecorded, AwaitingResponse, Accepted, Declined, WithdrawalPending,
   * Withdrawn).
   */
  readonly awardId: string;
  readonly awardState: string;
}

export interface AwardIntelligence {
  readonly participations: number;
  readonly awards: number;
  readonly awardRatePercent: string | null;
  readonly awaitingDecision: number;
  readonly openedThenCancelled: number;
  readonly reserves: number | null;
  readonly rejections: number | null;
  readonly items: readonly AwardItem[];
  /** CF-046 (ADR-110): awards to the firm it declined, and awards the buyer withdrew — never counted as awards. */
  readonly awardsDeclined?: number | null;
  readonly awardsWithdrawn?: number | null;
}

export interface CompetitiveTender {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly category: string | null;
  readonly computedAtUtc: string;
  readonly currency: string;
  readonly submittedTotal: string;
  readonly leveledTotal: string;
  readonly comparableBids: number;
  readonly position: number;
  readonly tiedPosition: boolean;
  readonly leveledVersusMedianPercent: string | null;
  readonly submittedVersusMedianPercent: string | null;
  /** CF-126: Ineligible, OtherCurrency or SingleComparableBid when not compared. */
  readonly notComparedReason?: string | null;
}

export interface Competitiveness {
  readonly tenders: number;
  readonly compared: number;
  readonly lowest: number;
  readonly belowMedian: number;
  readonly atMedian: number;
  readonly aboveMedian: number;
  readonly leveledVersusMedian: SampleSummary;
  readonly items: readonly CompetitiveTender[];
}

export interface EvidenceSummary {
  readonly completedProjects: number;
  readonly earliestClosedAtUtc: string | null;
  readonly latestClosedAtUtc: string | null;
  readonly strength: EvidenceStrength;
  readonly dated: boolean;
}

export interface DeliveryOutcome {
  readonly awardId: string;
  readonly versionNumber: number;
  readonly tenderReference: string;
  readonly projectCode: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly category: string | null;
  readonly awardedAtUtc: string;
  readonly closedAtUtc: string;
  readonly costVariancePercent: string | null;
  readonly plannedDurationDays: number | null;
  readonly actualDurationDays: number;
  readonly scheduleVariancePercent: string | null;
  readonly scheduleOutcome: string;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly variationCount: number;
  readonly claimCount: number;
  readonly unresolvedClaimCount: number;
  readonly disputeCount: number;
  readonly unresolvedDisputeCount: number;
  readonly wouldWorkAgain: string;
  /** CF-048 / CF-082 (ADR-124). */
  readonly outcomeType?: string;
  readonly earlyWorksDeclared?: boolean;
  readonly timingWarnings?: readonly string[];
  readonly finalizedDaysAfterAward?: number | null;
  /** CF-025 (ADR-125): the cause is general; the value, share and residual are commercial (null otherwise). */
  readonly variationCause?: string | null;
  readonly variationAttribution?: string;
  readonly variationValue?: string | null;
  readonly variationSharePercent?: string | null;
  readonly residualCostVariance?: string | null;
  readonly residualCostVariancePercent?: string | null;
}

export interface DeliveryIntelligence {
  readonly onTime: number;
  readonly late: number;
  readonly noScheduleBaseline: number;
  readonly onTimeRatePercent: string | null;
  readonly costVariance: SampleSummary | null;
  readonly scheduleVariance: SampleSummary;
  readonly quality: SampleSummary;
  readonly hse: SampleSummary;
  readonly qualityDistribution: readonly number[];
  readonly hseDistribution: readonly number[];
  readonly projectsWithVariations: number;
  readonly variations: number;
  readonly projectsWithClaims: number;
  readonly claims: number;
  readonly unresolvedClaims: number;
  readonly projectsWithDisputes: number;
  readonly disputes: number;
  readonly unresolvedDisputes: number;
  readonly wouldWorkAgainYes: number;
  readonly wouldWorkAgainConditional: number;
  readonly wouldWorkAgainNo: number;
  readonly outcomeScore: string | null;
  readonly outcomeScoreRule: string;
  readonly outcomes: readonly DeliveryOutcome[];
  /** CF-048: finalized closeouts per outcome type, and how many were left out of on-time and variance figures. */
  readonly outcomeTypes?: Readonly<Record<string, number>> | null;
  readonly excludedFromVariance?: number;
}

export interface SimilarProject {
  readonly reasons: readonly SimilarityReason[];
  readonly outcome: DeliveryOutcome;
}

export interface SimilarProjects {
  readonly workPackageId: string;
  readonly projectCode: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly category: string | null;
  readonly categoryMissing: boolean;
  readonly matches: number;
  readonly items: readonly SimilarProject[];
}

export interface ParticipationItem {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly category: string | null;
  readonly issuedAtUtc: string;
  readonly outcome: ParticipationOutcome;
  readonly awardedToFirm: boolean;
}

export interface SubcontractorIntelligence {
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly standing: string;
  readonly trades: readonly string[];
  readonly categoryKey: string | null;
  readonly category: string | null;
  readonly categories: readonly CategoryOption[];
  readonly access: IntelligenceAccess;
  readonly rule: string;
  readonly generatedAtUtc: string;
  readonly procurement: ProcurementIntelligence;
  readonly awards: AwardIntelligence;
  readonly competitiveness: Competitiveness | null;
  readonly evidence: EvidenceSummary;
  readonly delivery: DeliveryIntelligence | null;
  readonly similar: SimilarProjects | null;
  readonly recentParticipation: readonly ParticipationItem[];
  readonly truncated: boolean;
  /** CF-002 (ADR-126): confirmed retrospective outcomes in scope (general count) and, for performance readers, the records. */
  readonly retrospectiveProjects?: number;
  readonly retrospective?: RetrospectiveEvidence | null;
}

export interface RetrospectiveEvidenceItem {
  readonly recordId: string;
  readonly versionNumber: number;
  readonly category: string;
  readonly projectLabel: string;
  readonly packageLabel: string;
  readonly outcomeType: string;
  readonly scheduleOutcome: string;
  readonly scheduleVariancePercent: string | null;
  /** Commercial: null without commercial access. */
  readonly costVariancePercent: string | null;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly wouldWorkAgain: string;
  readonly variationCause: string | null;
  readonly sourceReference: string;
  readonly imported: boolean;
  readonly createdByName: string;
  readonly confirmedByName: string;
  readonly confirmedAtUtc: string;
}

export interface RetrospectiveEvidence {
  readonly count: number;
  readonly items: readonly RetrospectiveEvidenceItem[];
}

export interface CandidateEvidence {
  readonly subcontractorId: string;
  /** CF-002: confirmed retrospective outcomes in the package's category (labelled, never in the figures). */
  readonly retrospectiveProjects?: number;
  /** CF-029 / CF-030 (ADR-128). */
  readonly similarComparableValueProjects?: number;
  readonly similarSameProject?: number;
  readonly declined?: number;
  readonly noResponse?: number;
  readonly validInvitations: number;
  readonly submitted: number;
  readonly reliabilityPercent: string | null;
  readonly completedProjects: number;
  readonly latestClosedAtUtc: string | null;
  readonly strength: EvidenceStrength;
  readonly dated: boolean;
  readonly similarProjects: number;
  readonly onTime: number | null;
  readonly late: number | null;
  readonly wouldWorkAgainYes: number | null;
  readonly wouldWorkAgainConditional: number | null;
  readonly wouldWorkAgainNo: number | null;
}

export interface WorkPackageEvidence {
  readonly workPackageId: string;
  readonly category: string | null;
  readonly categoryMissing: boolean;
  readonly access: IntelligenceAccess;
  readonly rule: string;
  readonly candidates: readonly CandidateEvidence[];
  /** Some firm has more invitations than were read (the newest 200 per firm count). */
  readonly truncated: boolean;
}

export interface DashboardItem {
  readonly kind: string;
  readonly id: string;
  readonly tenderId: string | null;
  readonly reference: string;
  readonly title: string | null;
  readonly detail: string | null;
  readonly status: string | null;
  readonly atUtc: string | null;
}

export interface Dashboard {
  readonly generatedAtUtc: string;
  readonly portfolio: {
    readonly activeProjects: number;
    readonly onHoldProjects: number;
    readonly activeWorkPackages: number;
  } | null;
  readonly tenders: {
    readonly drafts: number;
    readonly openForBids: number;
    readonly closingSoon: number;
    readonly awaitingOpening: number;
    readonly items: readonly DashboardItem[];
  } | null;
  readonly evaluation: {
    readonly pending: number;
    readonly readyForDecision: number;
    /** CF-007: completed evaluations on a plan without the award (the plan's last stage). */
    readonly completedInPlan?: number;
    readonly items: readonly DashboardItem[];
  } | null;
  readonly decisions: {
    readonly awaitingApproval: number;
    readonly approvedAwaitingAward: number;
    /** CF-129: pending decisions whose next step the reader may approve now. */
    readonly awaitingYourApproval?: number;
    readonly items: readonly DashboardItem[];
    readonly recentAwards: readonly DashboardItem[];
  } | null;
  readonly closeouts: {
    readonly pending: number;
    readonly inProgress: number;
    readonly reopened: number;
    readonly closed: number;
    readonly recentlyClosed: readonly DashboardItem[];
  } | null;
  readonly evidence: {
    readonly firmsWithHistory: number;
    readonly categories: readonly {
      readonly category: string | null;
      readonly firms: number;
      readonly projects: number;
      readonly firmsWithModerateEvidence: number;
      readonly latestClosedAtUtc: string;
      readonly strongestFirmEvidence: EvidenceStrength;
      readonly dated: boolean;
    }[];
  } | null;
}

/** Which slice of a profile to read: every category together, one category, or packages without a category. */
export type CategoryScope =
  { readonly kind: 'all' } | { readonly kind: 'key'; readonly key: string };

@Injectable({ providedIn: 'root' })
export class IntelligenceApi {
  private readonly http = inject(HttpClient);

  subcontractor(
    subcontractorId: string,
    scope: CategoryScope,
    workPackageId?: string | null,
  ): Observable<SubcontractorIntelligence> {
    let params = new HttpParams();
    if (scope.kind === 'key') {
      params =
        scope.key === '' ? params.set('uncategorized', 'true') : params.set('category', scope.key);
    }
    if (workPackageId) params = params.set('workPackageId', workPackageId);
    return this.http.get<SubcontractorIntelligence>(
      `/api/v1/intelligence/subcontractors/${subcontractorId}`,
      { params },
    );
  }

  /** CF-080: [from, to) as yyyy-mm-dd (UTC); both absent = the last six calendar months. */
  pilotMetrics(from?: string, to?: string): Observable<PilotMetrics> {
    return this.http.get<PilotMetrics>('/api/v1/intelligence/pilot-metrics', {
      params: pilotParams(from, to),
    });
  }

  pilotMetricsExportUrl(from?: string, to?: string): string {
    const query = pilotParams(from, to).toString();
    return `/api/v1/intelligence/pilot-metrics/export${query ? `?${query}` : ''}`;
  }

  candidates(
    workPackageId: string,
    subcontractorIds: readonly string[],
  ): Observable<WorkPackageEvidence> {
    let params = new HttpParams();
    for (const id of subcontractorIds.slice(0, 50)) params = params.append('ids', id);
    return this.http.get<WorkPackageEvidence>(
      `/api/v1/intelligence/work-packages/${workPackageId}/candidates`,
      { params },
    );
  }

  /** CF-001 (ADR-115): the work waiting on the caller, oldest first. */
  myWork(): Observable<MyWork> {
    return this.http.get<MyWork>('/api/v1/dashboard/my-work');
  }

  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/v1/dashboard');
  }
}

export function intelligenceProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}

/** CF-001 (ADR-115): one piece of work waiting on the caller — never a price, estimate or leveled total. */
export interface MyWorkItem {
  readonly kind: string;
  readonly recordId: string;
  readonly tenderId: string | null;
  readonly reference: string;
  readonly title: string | null;
  readonly sinceUtc: string;
  readonly reason: string | null;
  readonly step: number | null;
  /** CF-010: when it is due under the company's target (null: no target set). */
  readonly dueAtUtc?: string | null;
}

export interface MyWork {
  readonly generatedAtUtc: string;
  readonly items: readonly MyWorkItem[];
  readonly total: number;
  readonly kinds: Readonly<Record<string, number>>;
}

function pilotParams(from?: string, to?: string): HttpParams {
  let params = new HttpParams();
  if (from) params = params.set('from', from);
  if (to) params = params.set('to', to);
  return params;
}
