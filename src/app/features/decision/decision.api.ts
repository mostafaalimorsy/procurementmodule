import { ComplianceItem } from '../subcontractors/compliance.api';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { problemMessage } from '../../core/localization/product-problem';
import { EVALUATION_FEATURES } from '../evaluation/evaluation.api';
import { TenderLocalTime } from '../tendering/tendering.api';

// Part 10: negotiation / BAFO rounds, recommendation, decision, approval and award. The C# contracts are the source of
// truth; enums travel as strings and money as exact decimal strings (never numbers).

export const DECISION_PERMISSIONS = {
  view: 'Decision.View',
  negotiationManage: 'Negotiation.Manage',
  negotiationNote: 'Negotiation.Note',
  managePolicy: 'Recommendation.ManagePolicy',
  compute: 'Recommendation.Compute',
  prepare: 'Decision.Prepare',
  override: 'Decision.OverrideRecommendation',
  submit: 'Decision.Submit',
  approve: 'Award.Approve',
  issue: 'Award.Issue',
  manageMatrix: 'Award.ManageApprovalMatrix',
} as const;

/** Awards work on evaluated tenders, so they need evaluation and everything evaluation needs. */
export const AWARD_FEATURES: readonly string[] = ['award', ...EVALUATION_FEATURES];

/** CF-136: who may open the approval routes (`/approval-matrix/read`): the matrix's managers, approvers and submitters. */
export function readsApprovalRoutes(session: {
  hasPermission(permission: string): boolean;
}): boolean {
  return [
    DECISION_PERMISSIONS.manageMatrix,
    DECISION_PERMISSIONS.approve,
    DECISION_PERMISSIONS.submit,
  ].some((permission) => session.hasPermission(permission));
}

export const PURPOSE_MIN = 3;
export const PURPOSE_MAX = 500;
export const INSTRUCTIONS_MAX = 4000;
export const NEGOTIATION_NOTE_MAX = 2000;
export const DECISION_REASON_MIN = 3;
export const DECISION_REASON_MAX = 1000;
export const DECISION_COMMENT_MAX = 1000;
export const RATIONALE_MAX = 2000;
export const RECOMMENDATION_POLICY_NAME_MAX = 120;
export const RECOMMENDATION_POLICY_DESCRIPTION_MAX = 1000;
export const APPROVAL_RULE_NAME_MAX = 120;
export const APPROVAL_CATEGORY_MAX = 120;

// ------------------------------------------------------------------ negotiation rounds

export type NegotiationRoundType = 'Revision' | 'Bafo';
export type NegotiationScope = 'Commercial' | 'Technical' | 'CommercialAndTechnical';
export type NegotiationRoundStatus = 'Open' | 'Closed' | 'Cancelled';
export type NegotiationRoundClosure = 'Deadline' | 'Early';
export type NegotiationParticipantStatus =
  'Invited' | 'Started' | 'Submitted' | 'Declined' | 'NoResponse' | 'Withdrawn';

export const ROUND_TYPES: readonly NegotiationRoundType[] = ['Revision', 'Bafo'];
export const ROUND_SCOPES: readonly NegotiationScope[] = [
  'Commercial',
  'Technical',
  'CommercialAndTechnical',
];

export interface NegotiationParticipant {
  readonly id: string;
  readonly openingBidId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly status: NegotiationParticipantStatus;
  readonly baseRevisionNumber: number;
  readonly submittedRevisionNumber: number | null;
  readonly firstViewedAtUtc: string | null;
  readonly startedAtUtc: string | null;
  readonly submittedAtUtc: string | null;
  readonly declinedAtUtc: string | null;
  readonly withdrawnAtUtc: string | null;
  readonly withdrawnByName: string | null;
  readonly emailStatus: string | null;
  readonly version: string;
}

export interface NegotiationRound {
  readonly id: string;
  readonly number: number;
  readonly type: NegotiationRoundType;
  readonly scope: NegotiationScope;
  readonly status: NegotiationRoundStatus;
  /** Internal; null for readers without commercial visibility (like the instructions and every reason). */
  readonly purpose: string | null;
  readonly instructions: string | null;
  readonly responseDeadline: TenderLocalTime;
  readonly deadlinePassed: boolean;
  readonly issuedAtUtc: string;
  readonly issuedByName: string;
  readonly closedAtUtc: string | null;
  readonly closedByName: string | null;
  readonly closureKind: NegotiationRoundClosure | null;
  readonly earlyCloseReason: string | null;
  readonly cancelledAtUtc: string | null;
  readonly cancelledByName: string | null;
  readonly cancellationReason: string | null;
  readonly participants: readonly NegotiationParticipant[];
  readonly submittedCount: number;
  readonly version: string;
}

export interface NegotiationCandidate {
  readonly openingBidId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly currentRevisionNumber: number;
  readonly currentRound: number;
  readonly invitable: boolean;
  readonly blocker: string | null;
}

export interface NegotiationNote {
  readonly id: string;
  readonly roundId: string | null;
  readonly openingBidId: string | null;
  readonly text: string;
  readonly authorName: string;
  readonly writtenAtUtc: string;
}

export interface NegotiationAccess {
  readonly manage: boolean;
  readonly note: boolean;
  readonly viewCommercial: boolean;
  readonly viewTechnical: boolean;
}

export interface NegotiationWorkspace {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly timeZoneId: string;
  readonly tenderCancelled: boolean;
  readonly tenderAwarded: boolean;
  readonly issueBlocker: string | null;
  readonly issueBlockerReason: string | null;
  readonly maximumRounds: number;
  readonly rounds: readonly NegotiationRound[];
  readonly candidates: readonly NegotiationCandidate[];
  readonly notes: readonly NegotiationNote[];
  readonly access: NegotiationAccess;
  readonly serverNowUtc: string;
}

export interface IssueRoundInput {
  readonly type: NegotiationRoundType;
  readonly scope: NegotiationScope;
  readonly purpose: string;
  readonly instructions: string;
  /** 'yyyy-MM-ddTHH:mm' in the tender's time zone. */
  readonly responseDeadlineLocal: string;
  readonly openingBidIds: readonly string[];
}

// ------------------------------------------------------------------ original vs revised vs final

export type RevisionKind = 'Submission' | 'Revision' | 'Bafo' | 'Resubmission' | 'OutsidePortal';
export type LineChange = 'unchanged' | 'changed' | 'added' | 'removed';

export interface RevisionColumn {
  readonly revisionId: string;
  readonly number: number;
  readonly round: number;
  readonly kind: RevisionKind | string;
  readonly submittedAtUtc: string;
  readonly contentSha256: string;
  readonly isOpened: boolean;
  readonly isCurrent: boolean;
}

export interface FieldComparison {
  readonly field: string;
  readonly section: 'technical' | 'commercial' | string;
  readonly values: readonly (string | null)[];
  readonly changedFromPrevious: readonly boolean[];
  readonly changedFromOriginal: boolean;
}

export interface LineComparison {
  readonly description: string;
  readonly amounts: readonly (string | null)[];
  readonly change: LineChange | string;
}

export interface ListComparison {
  readonly field: string;
  readonly section: string;
  readonly text: string;
  readonly statedIn: readonly boolean[];
}

export interface FileComparison {
  readonly fileName: string;
  readonly classification: string;
  readonly presentIn: readonly boolean[];
}

export interface BidComparison {
  readonly openingBidId: string;
  readonly position: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly revisions: readonly RevisionColumn[];
  readonly originalTotal: string | null;
  readonly finalTotal: string | null;
  readonly absoluteChange: string | null;
  readonly percentChange: string | null;
  readonly fields: readonly FieldComparison[];
  readonly lines: readonly LineComparison[];
  readonly lists: readonly ListComparison[];
  readonly files: readonly FileComparison[];
  readonly technicalChanged: boolean;
  readonly commercialChanged: boolean | null;
}

export interface RevisionComparison {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly currency: string;
  /** False for a technical-only reader: no amount, line, commercial term or commercial file is included. */
  readonly includesCommercial: boolean;
  readonly bids: readonly BidComparison[];
}

// ------------------------------------------------------------------ recommendation policies

export type RecommendationCriterionKind =
  'Commercial' | 'Technical' | 'Schedule' | 'Risk' | 'PastPerformance';
export const CRITERION_KINDS: readonly RecommendationCriterionKind[] = [
  'Commercial',
  'Technical',
  'Schedule',
  'Risk',
  'PastPerformance',
];
export type RecommendationPolicyStatus = 'Active' | 'Inactive';

export interface RecommendationCriterion {
  readonly id: string;
  readonly position: number;
  readonly kind: RecommendationCriterionKind;
  readonly weight: number;
}

/** CF-021 (ADR-127): how a policy applies past performance. */
export type HistoryRule = 'AllOrNothing' | 'Partial';

export interface RecommendationPolicyVersion {
  readonly id: string;
  readonly number: number;
  readonly minimumTechnicalScore: number | null;
  readonly historyRule?: HistoryRule;
  readonly neutralHistoryScore?: number | null;
  readonly createdAtUtc: string;
  readonly createdByName: string;
  readonly lockedAtUtc: string | null;
  readonly criteria: readonly RecommendationCriterion[];
}

export interface RecommendationPolicySummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: RecommendationPolicyStatus;
  readonly currentVersionNumber: number;
  readonly criteriaCount: number;
  readonly currentVersionLocked: boolean;
  readonly weighsHistory: boolean;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** CF-128 (ADR-108): weighs past performance, which the plan no longer includes — needs review. */
  readonly historyNotInPlan?: boolean;
}

export interface RecommendationPolicy {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: RecommendationPolicyStatus;
  readonly currentVersionNumber: number;
  readonly current: RecommendationPolicyVersion;
  readonly versions: readonly RecommendationPolicyVersion[];
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface RecommendationCriterionInput {
  kind: RecommendationCriterionKind;
  /** Percentage as typed ("35.5"); sent as a number with at most two decimals. */
  weight: string;
}

export interface RecommendationPolicyInput {
  readonly name: string;
  readonly description: string;
  /** Typed pass mark out of 100 with at most one decimal, or '' for none. */
  readonly minimumTechnicalScore: string;
  readonly criteria: readonly RecommendationCriterionInput[];
  /** CF-021 (ADR-127): the history rule and, for the partial rule, the neutral value as typed ('' for the default 50). */
  readonly historyRule?: HistoryRule;
  readonly neutralHistoryScore?: string;
}

// ------------------------------------------------------------------ decision workspace

export type EvidenceSource = 'Current' | 'Historical';
export type EvidenceStatus = 'Available' | 'Missing' | 'Unavailable' | 'NotScored';
export type RecommendationState = 'Ready' | 'InsufficientHistory';
export type HistoryStatus = 'NotInPolicy' | 'Unavailable' | 'Applied';
export type LiveState = 'Ready' | 'InsufficientHistory' | 'RecomputeRequired' | 'MissingEvaluation';
export type ReadinessState =
  | 'Ready'
  | 'NotOpened'
  | 'MissingEvaluation'
  | 'RefreshRequired'
  | 'NegotiationOpen'
  | 'TenderCancelled'
  | 'Awarded';
export type DecisionStatus = 'Draft' | 'PendingApproval' | 'Approved' | 'Awarded';
export type BidDisposition = 'Award' | 'Reserve' | 'Reject';
export type ApprovalActionKind = 'Approve' | 'Return' | 'Reject' | 'Withdraw';
export type SubmissionOutcome =
  'Pending' | 'Approved' | 'Returned' | 'Rejected' | 'Withdrawn' | 'Awarded' | 'Superseded';

export interface DecisionReadiness {
  readonly state: ReadinessState | string;
  readonly gaps: readonly string[];
}

export interface CriterionOutcome {
  readonly kind: RecommendationCriterionKind;
  readonly source: EvidenceSource;
  readonly weight: number;
  readonly appliedWeight: number;
  readonly status: EvidenceStatus;
  /** A money string for Commercial, a number as text otherwise. */
  readonly input: string | null;
  readonly baseline: string | null;
  readonly score: number | null;
  readonly contribution: number | null;
}

export interface RecommendationCandidate {
  readonly openingBidId: string;
  /** CF-002 (ADR-126): confirmed retrospective outcomes in the tender's category, read now — shown labelled, never weighed. */
  readonly retrospectiveProjects?: number;
  /** CF-026: the firm, to open its profile in the tender's category. */
  readonly subcontractorId?: string | null;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidRevisionNumber: number;
  readonly round: number;
  readonly submittedTotal: string;
  readonly leveledTotal: string;
  readonly technicalMean: number | null;
  readonly eligible: boolean;
  readonly ineligibleReason: string | null;
  readonly rank: number | null;
  readonly tied: boolean;
  readonly total: number | null;
  readonly criteria: readonly CriterionOutcome[];
  readonly flags: readonly string[];
  /** Part 11: the historical performance evidence the candidate had when computed; null when the firm had none. */
  readonly history?: HistoricalEvidence | null;
}

/** Part 11: one finalized closeout behind a candidate's history (percentages are signed two-decimal strings). */
export interface HistoricalOutcome {
  readonly awardId: string;
  readonly versionNumber: number;
  readonly tenderReference: string;
  readonly closedAtUtc: string;
  readonly costVariancePercent: string | null;
  readonly scheduleVariancePercent: string | null;
  readonly qualityRating: number;
  readonly hseRating: number;
  readonly variationCount: number;
  readonly claimCount: number;
  readonly disputeCount: number;
  readonly wouldWorkAgain: string;
  readonly outcomeScore: string;
  /** CF-025 / CF-048: null on recommendations computed before they were kept. */
  readonly variationCause?: string | null;
  readonly variationAttribution?: string;
  readonly variationSharePercent?: string | null;
  readonly residualCostVariancePercent?: string | null;
  readonly outcomeType?: string;
}

/** Part 11: a candidate's category history — the engine's whole-number score, always with sample size and recency. */
export interface HistoricalEvidence {
  readonly score: string;
  readonly sampleSize: number;
  readonly earliestOutcomeAtUtc: string | null;
  readonly latestOutcomeAtUtc: string;
  readonly category: string | null;
  readonly scoreRule: string | null;
  readonly outcomes: readonly HistoricalOutcome[];
}

export interface Recommendation {
  readonly id: string;
  readonly number: number;
  readonly liveState: LiveState | string;
  readonly staleReason: string | null;
  readonly computedState: RecommendationState;
  readonly history: HistoryStatus;
  readonly reducedConfidence: boolean;
  readonly policyId: string;
  readonly policyName: string;
  readonly policyVersionNumber: number;
  readonly currentPolicyVersionNumber: number | null;
  readonly minimumTechnicalScore: number | null;
  readonly appliedWeightTotal: number;
  readonly unappliedWeight: number;
  readonly currency: string;
  readonly evaluationRound: number;
  readonly evaluationCompletedAtUtc: string | null;
  readonly computedAtUtc: string;
  readonly computedByName: string;
  readonly evidenceFingerprint: string;
  readonly candidates: readonly RecommendationCandidate[];
  /** CF-038: the company minimum snapshotted when computed (null for older recommendations). */
  readonly minimumCompliantBids: number | null;
  readonly limitedCompetition: boolean;
  /** CF-040 (ADR-105): the declared policy used, another one (with the reason), or none declared; flagged when anything changed after opening. */
  readonly criteriaDeclaration?: CriteriaDeclaration;
  readonly declaredPolicyName?: string | null;
  readonly declaredPolicyVersionNumber?: number | null;
  readonly criteriaDeviationReason?: string | null;
  readonly evaluationCriteriaDeviated?: boolean;
  readonly criteriaChangedAfterOpening?: boolean;
  /** CF-128 (ADR-108): the policy weighs past performance and the plan does not include it (shown instead of "reduced confidence"). */
  readonly historyNotInPlan?: boolean;
  /** CF-021 / CF-022 (ADR-127): the history rule id it was computed with, and the partial rule's neutral value. */
  readonly historyRule?: string;
  readonly neutralHistoryScore?: number | null;
}

export type CriteriaDeclaration = 'declared' | 'deviated' | 'notDeclared';

/** CF-040: which policy a recommendation ranked with, against what the tender declared. */
export interface RecommendationCriteria {
  readonly declaration: CriteriaDeclaration;
  readonly policyName: string;
  readonly policyVersionNumber: number;
  readonly declaredPolicyName: string | null;
  readonly declaredPolicyVersionNumber: number | null;
  readonly deviationReason: string | null;
  readonly evaluationCriteriaDeviated: boolean;
  readonly changedAfterOpening: boolean;
}

export interface RecommendationSummary {
  readonly id: string;
  readonly number: number;
  readonly computedAtUtc: string;
  readonly computedByName: string;
  readonly policyName: string;
  readonly policyVersionNumber: number;
  readonly latest: boolean;
}

export interface RecommendationPolicyOption {
  readonly id: string;
  readonly name: string;
  readonly currentVersionNumber: number;
  readonly weighsHistory: boolean;
  /** CF-040: the policy the tender declared (it ranks with its declared version). */
  readonly declared?: boolean;
  readonly declaredVersionNumber?: number | null;
  /** CF-128: weighs past performance, which the plan does not include. */
  readonly historyNotInPlan?: boolean;
}

export interface DispositionChoice {
  readonly openingBidId: string;
  readonly disposition: BidDisposition;
  readonly reserveRank: number | null;
  readonly reason: string | null;
}

export interface DecisionDraft {
  readonly recommendationId: string | null;
  readonly proposedOpeningBidId: string | null;
  readonly isOverride: boolean;
  readonly overrideReason: string | null;
  readonly awardValue: string | null;
  readonly valueReason: string | null;
  readonly rationale: string | null;
  readonly dispositions: readonly DispositionChoice[];
  /** The proposed bid's leveled total: the value that needs no adjustment reason. */
  readonly suggestedAwardValue: string | null;
  readonly updatedAtUtc: string;
  readonly preparedByName: string;
  readonly competitionCategory: CompetitionJustification | null;
  readonly competitionReason: string | null;
  readonly overBudgetReason: string | null;
  /** CF-045 (ADR-099): the proposed bid answered an older tender revision, so the decision needs this acknowledgement. */
  readonly revisionAcknowledgementRequired?: boolean;
  readonly revisionAcknowledgementReason?: string | null;
}

export interface ApprovalAction {
  readonly id: string;
  readonly submissionNumber: number;
  readonly kind: ApprovalActionKind;
  readonly step: number | null;
  readonly actorName: string;
  readonly actorRoles: string;
  readonly comment: string | null;
  readonly actedAtUtc: string;
}

export interface ApprovalStep {
  readonly step: number;
  /** The role the approver must hold, or null for any approver. */
  readonly role: string | null;
  readonly approval: ApprovalAction | null;
}

export interface ApprovalRoute {
  readonly ruleName: string;
  readonly isDefault: boolean;
  readonly requiredApprovals: number;
  readonly steps: readonly ApprovalStep[];
  readonly allowSelfApproval: boolean;
}

export interface Disposition {
  readonly openingBidId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly disposition: BidDisposition;
  readonly reserveRank: number | null;
  readonly reason: string | null;
  readonly recommendedRank: number | null;
  readonly eligible: boolean;
}

export interface DecisionSubmission {
  readonly id: string;
  readonly number: number;
  readonly recommendationId: string;
  readonly recommendationNumber: number;
  readonly proposedOpeningBidId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidRevisionNumber: number;
  readonly round: number;
  readonly recommendedRank: number | null;
  readonly isOverride: boolean;
  readonly overrideReason: string | null;
  readonly awardValue: string;
  readonly currency: string;
  readonly leveledTotal: string;
  readonly submittedTotal: string;
  readonly valueReason: string | null;
  readonly rationale: string | null;
  readonly dispositions: readonly Disposition[];
  readonly route: ApprovalRoute;
  readonly submittedAtUtc: string;
  readonly submittedByName: string;
  readonly outcome: SubmissionOutcome | string;
  readonly actions: readonly ApprovalAction[];
  readonly limitedCompetition: boolean;
  readonly overBudget: boolean;
  readonly competitionCategory: CompetitionJustification | null;
  readonly competitionReason: string | null;
  readonly overBudgetReason: string | null;
  /** CF-040 (ADR-105): the criteria of the recommendation this version was submitted on. */
  readonly criteria?: RecommendationCriteria | null;
  readonly revisionAcknowledgementReason?: string | null;
}

export interface BaselineLine {
  readonly position: number;
  readonly description: string;
  readonly amount: string;
}

export interface AwardBaseline {
  readonly id: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly tenderRevisionInForce: number;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly workPackageCategory: string | null;
  readonly projectCode: string;
  readonly projectName: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly bidRevisionNumber: number;
  readonly bidRevisionKind: RevisionKind | string;
  readonly round: number;
  readonly answeredTenderRevision: number;
  readonly bidContentSha256: string;
  readonly awardValue: string;
  readonly currency: string;
  readonly submittedTotal: string;
  readonly leveledTotal: string;
  readonly valueReason: string | null;
  readonly scopeCompliance: string;
  readonly durationDays: number | null;
  readonly validityDays: number | null;
  readonly warrantyMonths: number | null;
  readonly paymentTerms: string | null;
  readonly mobilizationCommitment: string | null;
  readonly technicalApproach: string | null;
  readonly lines: readonly BaselineLine[];
  readonly exclusions: readonly string[];
  readonly commercialDeviations: readonly string[];
  readonly technicalDeviations: readonly string[];
  readonly awardedAtUtc: string;
  readonly submissionNumber: number;
  readonly recommendationNumber: number;
  readonly recommendedRank: number | null;
  readonly isOverride: boolean;
  readonly approvalRuleName: string;
  readonly baselineSha256: string;
  readonly fingerprintVerified: boolean;
  /** CF-040: from the recommendation the award was decided on (not part of the frozen fingerprint). */
  readonly criteria?: RecommendationCriteria | null;
  /**
   * Red-team G016/G048/G050 (B4): the governance context of the decision the award issued from — display only, never in the frozen
   * baseline or its fingerprint. Older awards carry false / null and show nothing extra.
   */
  readonly routeWithoutIndependentApproval?: boolean;
  readonly limitedCompetition?: boolean;
  readonly competitionCategory?: CompetitionJustification | null;
  readonly competitionReason?: string | null;
  readonly overBudget?: boolean;
  readonly overBudgetReason?: string | null;
  /** SubmissionDeadline or RevisionSubmission. */
  readonly validityBasis?: string | null;
  readonly validUntilUtc?: string | null;
  /** yyyy-MM-dd. */
  readonly validityExtendedUntil?: string | null;
  readonly validityExtensionChannel?: ValidityConfirmationChannel | null;
  readonly validityExtensionReference?: string | null;
  /** Red-team G073 (CF-057): the shortlist approvals the tender's invitations were issued on. */
  readonly shortlistBasis?: readonly ShortlistBasis[] | null;
}

/** Red-team G073 (CF-057 AC5): a shortlist approval behind the tender's invitations — whether it went through the small-value fast path. */
export interface ShortlistBasis {
  readonly approvalId: string;
  readonly round: number;
  readonly fastPath: boolean | null;
  readonly approvedByName: string;
  readonly approvedAtUtc: string;
}

export interface Award {
  readonly id: string;
  readonly awardedAtUtc: string;
  readonly awardedByName: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly awardValue: string;
  readonly currency: string;
  readonly submissionNumber: number;
  readonly baseline: AwardBaseline;
  readonly dispositions: readonly Disposition[];
  /** CF-046 (ADR-110, OD-18): the award's place on the tender, where it stands, its answer and withdrawals, and what the reader may do. */
  readonly sequence?: number;
  readonly state?: AwardState;
  readonly response?: AwardResponse | null;
  readonly withdrawals?: readonly AwardWithdrawal[] | null;
  readonly actions?: AwardActions | null;
  /** CF-047 / CF-131 (ADR-111): when "not selected" notices go out, and each firm's outcome notice (held, queued, sent, …). */
  readonly noticeTiming?: OutcomeNoticeTiming;
  readonly notices?: readonly AwardNotice[] | null;
}

export type OutcomeNoticeTiming = 'OnAcceptance' | 'AtAward';

export interface AwardNotice {
  readonly openingBidId: string;
  readonly subcontractorCode: string;
  readonly disposition: BidDisposition;
  readonly kind: string | null;
  readonly status: string | null;
}

export interface AwardNoticeChoice {
  /** Null keeps the company's setting. */
  readonly noticeTiming: OutcomeNoticeTiming | null;
  readonly notifyReserves: readonly string[];
}

export interface DecisionTimelineEntry {
  readonly kind: string;
  readonly atUtc: string;
  readonly actorName: string;
  readonly number: number | null;
  readonly step: number | null;
}

/** Presentation only; every action is authorized again by the server. */
export interface DecisionAccess {
  readonly compute: boolean;
  readonly prepare: boolean;
  readonly override: boolean;
  readonly submit: boolean;
  readonly approve: boolean;
  readonly issue: boolean;
  readonly managePolicy: boolean;
  readonly manageApprovalMatrix: boolean;
  readonly withdraw: boolean;
}

export interface DecisionStep {
  readonly state:
    'NoDecision' | 'Draft' | 'Returned' | 'Rejected' | 'AwaitingApproval' | 'Approved' | 'Awarded';
  readonly ownerRole: string | null;
  readonly stepNumber: number | null;
}

export interface DecisionWorkspace {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly currency: string;
  readonly readiness: DecisionReadiness;
  readonly recommendation: Recommendation | null;
  readonly recommendationHistory: readonly RecommendationSummary[];
  readonly policyOptions: readonly RecommendationPolicyOption[];
  readonly status: DecisionStatus | null;
  readonly decisionVersion: string | null;
  readonly draft: DecisionDraft | null;
  readonly routePreview: ApprovalRoute | null;
  readonly currentSubmission: DecisionSubmission | null;
  readonly submissions: readonly DecisionSubmission[];
  /** self_approval, role_required, recommendation_stale, already_approved — or null. */
  readonly approvalBlocker: string | null;
  readonly award: Award | null;
  readonly timeline: readonly DecisionTimelineEntry[];
  readonly access: DecisionAccess;
  readonly serverNowUtc: string;
  /** ADR-086: competition, standing, validity and budget facts, judged live on the server. */
  readonly controls: DecisionControls | null;
  /** CF-046 (ADR-110): earlier awards of the tender that were declined or withdrawn, latest first. */
  readonly previousAwards?: readonly PreviousAward[] | null;
  /** CF-008: where the decision stands and which role acts next. */
  readonly currentStep?: DecisionStep | null;
  /** Red-team G073 (CF-057): the shortlist approvals behind the tender's invitations (fast path or four-eyes). */
  readonly shortlistBasis?: readonly ShortlistBasis[] | null;
  /** Red-team G050: the tender's IANA time zone, in which validity dates are shown. */
  readonly timeZoneId?: string | null;
  /**
   * Red-team G076 (CF-046 AC3, ADR-172): after a declined or withdrawn award, the bid the form pre-selects — the first reserve the released
   * award kept (`reserve_rank_1`) or the best-ranked eligible bid that was not awarded before (`next_ranked`). A suggestion only.
   */
  readonly promotionSuggestion?: PromotionSuggestion | null;
}

export interface PromotionSuggestion {
  readonly openingBidId: string;
  readonly source: 'reserve_rank_1' | 'next_ranked' | string;
}

export type CompetitionJustification =
  'SoleCapableFirm' | 'Urgency' | 'OnlyResponsiveBid' | 'Other';
export const COMPETITION_JUSTIFICATIONS: readonly CompetitionJustification[] = [
  'SoleCapableFirm',
  'Urgency',
  'OnlyResponsiveBid',
  'Other',
];
export type BidValidityState = 'NotStated' | 'Valid' | 'LapsingSoon' | 'Lapsed';
export type ValidityConfirmationChannel = 'Letter' | 'Email' | 'Other';
export const VALIDITY_CHANNELS: readonly ValidityConfirmationChannel[] = [
  'Letter',
  'Email',
  'Other',
];
export const VALIDITY_REFERENCE_MAX = 200;

/** CF-044 / CF-039: one opened bid's live directory standing and derived validity. */
export interface CandidateControl {
  readonly openingBidId: string;
  readonly subcontractorCode: string;
  /** Active, Inactive or Blocked. */
  readonly standing: string;
  readonly validityDays: number | null;
  readonly validityBasis: string;
  readonly validFromUtc: string | null;
  readonly validUntilUtc: string | null;
  readonly validityState: BidValidityState;
  /** Leveled total against the estimate, in percent (same currency only). */
  readonly estimateVariancePercent: string | null;
  /** CF-056: required compliance documents for the package's trade today; award-blocking gaps stop the award. */
  readonly compliance?: readonly ComplianceItem[] | null;
}

export interface DecisionControls {
  readonly invited: number;
  readonly submitted: number;
  readonly eligible: number;
  readonly minimumCompliantBids: number | null;
  readonly limitedCompetition: boolean;
  readonly candidates: readonly CandidateControl[];
  /** The package estimate — only in the tender currency, only for readers who may see it. */
  readonly estimate: string | null;
  readonly estimateCurrency: string | null;
  readonly overBudgetTolerancePercent: string;
  /** Whether the saved award value exceeds the estimate beyond the tolerance (null: no estimate or no value). */
  readonly proposedOverBudget: boolean | null;
  readonly proposedVariancePercent: string | null;
  readonly estimateChangedAfterPublication: boolean;
  /** CF-028: the package has no category, so no performance history is used. */
  readonly historyCategoryMissing: boolean;
  /**
   * Red-team B7 (CF-037 AC3/AC4): the estimate in force when the tender was published, and whether the estimate compares with the bids
   * (false, reason "currency", when it is in another currency — then it is shown in its own currency with no variance).
   */
  readonly estimateAtPublication?: string | null;
  readonly estimateComparable?: boolean | null;
  readonly estimateNotComparableReason?: string | null;
}

export interface ValidityConfirmationInput {
  /** yyyy-MM-dd. */
  readonly extendedUntil: string;
  readonly channel: ValidityConfirmationChannel;
  readonly reference: string | null;
}

export interface DispositionInput {
  readonly openingBidId: string;
  readonly disposition: 'Reserve' | 'Reject';
  readonly reserveRank: number | null;
  readonly reason: string | null;
}

export interface DecisionInput {
  readonly recommendationId: string | null;
  readonly proposedOpeningBidId: string | null;
  readonly overrideReason: string | null;
  readonly awardValue: string | null;
  readonly valueReason: string | null;
  readonly rationale: string | null;
  readonly dispositions: readonly DispositionInput[];
  readonly competitionCategory: CompetitionJustification | null;
  readonly competitionReason: string | null;
  readonly overBudgetReason: string | null;
  readonly revisionAcknowledgementReason?: string | null;
}

// ------------------------------------------------------------------ approval matrix

export interface ApprovalRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  readonly active: boolean;
  readonly currency: string | null;
  /** Inclusive lower bound (decimal string in the rule's currency). */
  readonly minimumValue: string | null;
  /** Exclusive upper bound. */
  readonly maximumValue: string | null;
  readonly projectId: string | null;
  readonly category: string | null;
  readonly requiredApprovals: number;
  /** One per required approval: the role that approver must hold, or null for any approver. */
  readonly stepRoles: readonly (string | null)[];
  readonly allowSelfApproval: boolean;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** ADR-084: why the company accepts a route without an independent approval (0 steps or self-approval). */
  readonly weakeningReason?: string | null;
}

/** CF-136: an active rule as approvers and submitters read it. */
export interface ApprovalRuleRead {
  readonly name: string;
  readonly priority: number;
  readonly currency: string | null;
  readonly minimumValue: string | null;
  readonly maximumValue: string | null;
  readonly projectId: string | null;
  readonly category: string | null;
  readonly requiredApprovals: number;
  readonly stepRoles: readonly (string | null)[];
  readonly allowSelfApproval: boolean;
}

export interface ApprovalMatrixRead {
  readonly rules: readonly ApprovalRuleRead[];
  readonly defaultRoute: ApprovalRuleRead;
}

export interface ApprovalMatrix {
  readonly rules: readonly ApprovalRule[];
  readonly approverRoles: readonly string[];
  readonly maximumApprovals: number;
}

export interface ApprovalRuleInput {
  readonly name: string;
  readonly priority: number;
  readonly active: boolean;
  readonly currency: string | null;
  readonly minimumValue: string | null;
  readonly maximumValue: string | null;
  readonly projectId: string | null;
  readonly category: string | null;
  readonly requiredApprovals: number;
  readonly stepRoles: readonly (string | null)[];
  readonly allowSelfApproval: boolean;
  /** ADR-084: required for a rule with 0 approvals or self-approval. */
  readonly weakeningConfirmed?: boolean;
  readonly weakeningReason?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DecisionApi {
  private readonly http = inject(HttpClient);

  // ---------------------------------------------------------------- negotiation

  negotiation(tenderId: string): Observable<NegotiationWorkspace> {
    return this.http.get<NegotiationWorkspace>(`${this.tender(tenderId)}/negotiation`);
  }

  issueRound(
    tenderId: string,
    input: IssueRoundInput,
    requestKey: string,
  ): Observable<NegotiationWorkspace> {
    return this.http.post<NegotiationWorkspace>(`${this.tender(tenderId)}/negotiation/rounds`, {
      ...input,
      confirmed: true,
      requestKey,
    });
  }

  /** Before the deadline this is an early close and needs a reason; after it, only the confirmation. */
  closeRound(
    tenderId: string,
    roundId: string,
    reason: string | null,
    version: string,
  ): Observable<NegotiationWorkspace> {
    return this.http.post<NegotiationWorkspace>(`${this.round(tenderId, roundId)}/close`, {
      reason,
      confirmed: true,
      version,
    });
  }

  cancelRound(
    tenderId: string,
    roundId: string,
    reason: string,
    version: string,
  ): Observable<NegotiationWorkspace> {
    return this.http.post<NegotiationWorkspace>(`${this.round(tenderId, roundId)}/cancel`, {
      reason,
      version,
    });
  }

  withdrawParticipant(
    tenderId: string,
    roundId: string,
    participantId: string,
    reason: string,
    version: string,
  ): Observable<NegotiationWorkspace> {
    return this.http.post<NegotiationWorkspace>(
      `${this.round(tenderId, roundId)}/participants/${encodeURIComponent(participantId)}/withdraw`,
      { reason, version },
    );
  }

  replaceParticipantLink(
    tenderId: string,
    roundId: string,
    participantId: string,
    version: string,
  ): Observable<NegotiationWorkspace> {
    return this.http.post<NegotiationWorkspace>(
      `${this.round(tenderId, roundId)}/participants/${encodeURIComponent(participantId)}/replace-link`,
      { version },
    );
  }

  addNegotiationNote(
    tenderId: string,
    roundId: string | null,
    openingBidId: string | null,
    text: string,
  ): Observable<NegotiationNote> {
    return this.http.post<NegotiationNote>(`${this.tender(tenderId)}/negotiation/notes`, {
      roundId,
      openingBidId,
      text,
    });
  }

  comparison(tenderId: string): Observable<RevisionComparison> {
    return this.http.get<RevisionComparison>(`${this.tender(tenderId)}/negotiation/comparison`);
  }

  // ---------------------------------------------------------------- decision

  decision(tenderId: string): Observable<DecisionWorkspace> {
    return this.http.get<DecisionWorkspace>(`${this.tender(tenderId)}/decision`);
  }

  compute(
    tenderId: string,
    policyId: string,
    requestKey: string,
    deviationReason: string | null = null,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/decision/recommendations`, {
      policyId,
      requestKey,
      deviationReason,
    });
  }

  /** Creates the draft (no version yet) or saves it with the decision's version. */
  saveDecision(
    tenderId: string,
    input: DecisionInput,
    version: string | null,
  ): Observable<DecisionWorkspace> {
    return this.http.put<DecisionWorkspace>(`${this.tender(tenderId)}/decision`, {
      ...input,
      ...(version ? { version } : {}),
    });
  }

  submitDecision(
    tenderId: string,
    version: string,
    requestKey: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/decision/submit`, {
      confirmed: true,
      version,
      requestKey,
    });
  }

  act(
    tenderId: string,
    kind: 'Approve' | 'Return' | 'Reject',
    comment: string | null,
    version: string,
    requestKey: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/decision/approvals`, {
      kind,
      comment,
      version,
      requestKey,
    });
  }

  withdrawDecision(
    tenderId: string,
    reason: string,
    version: string,
    requestKey: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/decision/withdraw`, {
      reason,
      version,
      requestKey,
    });
  }

  /** Idempotent by request key: a retry after a lost answer finds the award already issued. */
  issueAward(
    tenderId: string,
    version: string,
    requestKey: string,
    validityConfirmation: ValidityConfirmationInput | null = null,
    notices: AwardNoticeChoice | null = null,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/award`, {
      confirmed: true,
      version,
      requestKey,
      ...(validityConfirmation ? { validityConfirmation } : {}),
      ...(notices?.noticeTiming ? { noticeTiming: notices.noticeTiming } : {}),
      ...(notices?.notifyReserves.length ? { notifyReserves: notices.notifyReserves } : {}),
    });
  }

  // ---------------------------------------------------------------- recommendation policies

  policies(): Observable<readonly RecommendationPolicySummary[]> {
    return this.http.get<readonly RecommendationPolicySummary[]>('/api/v1/recommendation-policies');
  }

  policy(id: string): Observable<RecommendationPolicy> {
    return this.http.get<RecommendationPolicy>(
      `/api/v1/recommendation-policies/${encodeURIComponent(id)}`,
    );
  }

  createPolicy(input: RecommendationPolicyInput): Observable<RecommendationPolicy> {
    return this.http.post<RecommendationPolicy>(
      '/api/v1/recommendation-policies',
      recommendationPolicyBody(input, null),
    );
  }

  updatePolicy(
    id: string,
    input: RecommendationPolicyInput,
    version: string,
  ): Observable<RecommendationPolicy> {
    return this.http.put<RecommendationPolicy>(
      `/api/v1/recommendation-policies/${encodeURIComponent(id)}`,
      recommendationPolicyBody(input, version),
    );
  }

  setPolicyStatus(
    id: string,
    status: RecommendationPolicyStatus,
    version: string,
  ): Observable<RecommendationPolicy> {
    return this.http.post<RecommendationPolicy>(
      `/api/v1/recommendation-policies/${encodeURIComponent(id)}/status`,
      { status, version },
    );
  }

  // ---------------------------------------------------------------- approval matrix

  approvalMatrix(): Observable<ApprovalMatrix> {
    return this.http.get<ApprovalMatrix>('/api/v1/approval-rules');
  }

  /** CF-136: the read-only matrix for approvers and submitters. */
  readApprovalMatrix(): Observable<ApprovalMatrixRead> {
    return this.http.get<ApprovalMatrixRead>('/api/v1/approval-rules/read');
  }

  createApprovalRule(input: ApprovalRuleInput): Observable<ApprovalMatrix> {
    return this.http.post<ApprovalMatrix>('/api/v1/approval-rules', input);
  }

  updateApprovalRule(
    id: string,
    input: ApprovalRuleInput,
    version: string,
  ): Observable<ApprovalMatrix> {
    return this.http.put<ApprovalMatrix>(`/api/v1/approval-rules/${encodeURIComponent(id)}`, {
      ...input,
      version,
    });
  }

  /** CF-046 (ADR-110): the subcontractor's answer to the award in force, recorded by the buyer. */
  recordAwardResponse(
    tenderId: string,
    input: AwardResponseInput,
    requestKey: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/award/response`, {
      ...input,
      requestKey,
    });
  }

  requestAwardWithdrawal(
    tenderId: string,
    reasonCategory: AwardWithdrawalReason,
    reason: string,
    requestKey: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/award/withdrawals`, {
      reasonCategory,
      reason,
      requestKey,
    });
  }

  decideAwardWithdrawal(
    tenderId: string,
    withdrawalId: string,
    approve: boolean,
    comment: string | null,
    version: string,
  ): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(
      `${this.tender(tenderId)}/award/withdrawals/${encodeURIComponent(withdrawalId)}/decision`,
      { approve, comment, version },
    );
  }

  /** CF-047 (ADR-111): sends the award's held "not selected" notices now, before the answer. */
  releaseAwardNotices(tenderId: string): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/award/notices/release`, {});
  }

  /** CF-131: tells each reserve of the award in force, once, that it was not selected. */
  releaseAwardReserves(tenderId: string): Observable<DecisionWorkspace> {
    return this.http.post<DecisionWorkspace>(`${this.tender(tenderId)}/award/reserves/release`, {});
  }

  /** CF-046: after a declined or withdrawn award, closes the tender so its work package can be tendered again. */
  closeForRetender(tenderId: string, reason: string): Observable<{ status: string }> {
    return this.http.get<{ version: string }>(this.tender(tenderId)).pipe(
      switchMap((tender) =>
        this.http.post<{ status: string }>(`${this.tender(tenderId)}/close-for-retender`, {
          reason,
          version: tender.version,
        }),
      ),
    );
  }

  /** CF-003 (ADR-109): the decision / award pack for printing (audited on the server). */
  pack(tenderId: string): Observable<DecisionPack> {
    return this.http.get<DecisionPack>(`${this.tender(tenderId)}/decision/pack`);
  }

  /** CF-003: the award summary CSV — a same-origin download link (the session cookie authorizes it). */
  awardSummaryUrl(tenderId: string): string {
    return `${this.tender(tenderId)}/decision/award/summary.csv`;
  }

  private tender(id: string): string {
    return `/api/v1/tenders/${encodeURIComponent(id)}`;
  }

  private round(tenderId: string, roundId: string): string {
    return `${this.tender(tenderId)}/negotiation/rounds/${encodeURIComponent(roundId)}`;
  }
}

function recommendationPolicyBody(
  input: RecommendationPolicyInput,
  version: string | null,
): unknown {
  const minimum = input.minimumTechnicalScore.trim();
  return {
    name: input.name,
    description: input.description,
    minimumTechnicalScore: minimum ? Number(minimum) : null,
    criteria: input.criteria.map((criterion) => ({
      kind: criterion.kind,
      weight: Number(criterion.weight),
    })),
    version,
    historyRule: input.historyRule ?? 'AllOrNothing',
    neutralHistoryScore:
      input.historyRule === 'Partial' && input.neutralHistoryScore?.trim()
        ? Number(input.neutralHistoryScore.trim())
        : null,
  };
}

/** A technical pass mark as typed: 0–100 with at most one decimal, or null when it is not one. */
export function parsePassMark(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(value)) return null;
  const tenths = Number(value.replace('.', '')) * (value.includes('.') ? 1 : 10);
  return tenths <= 1000 ? tenths / 10 : null;
}

/** The first characters of a fingerprint, for reading; the full value stays available as its title. */
export function shortFingerprint(value: string | null | undefined): string {
  return value ? value.slice(0, 12) : '—';
}

export function decisionProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}

/** CF-003 (ADR-109): the decision / award pack — the decision as the reader may see it, the bids opened, the state for the watermark. */
export type PackState =
  'NoDecision' | 'Draft' | 'Returned' | 'PendingApproval' | 'Approved' | 'Awarded';

export interface DecisionPack {
  readonly header: {
    readonly tenderReference: string;
    readonly tenderTitle: string;
    readonly tenderRevision: number;
    readonly companyName: string;
    readonly generatedByName: string;
    readonly generatedAtUtc: string;
    readonly decisionVersion: string | null;
    readonly openingFingerprint: string;
    readonly recommendationFingerprint: string | null;
    readonly baselineFingerprint: string | null;
  };
  readonly state: PackState;
  readonly decision: DecisionWorkspace;
  readonly openedBids: readonly {
    readonly position: number;
    readonly subcontractorCode: string;
    readonly subcontractorName: string;
    readonly bidReference: string;
    readonly revisionNumber: number;
    readonly currentRevisionNumber: number;
    readonly contentSha256: string;
    readonly withdrawnAfterOpening: boolean;
  }[];
}

/** CF-046 (ADR-110, OD-18): where an issued award stands. */
export type AwardState =
  'NotRecorded' | 'AwaitingResponse' | 'Accepted' | 'Declined' | 'WithdrawalPending' | 'Withdrawn';
export type AwardDeclineReason =
  'Price' | 'Capacity' | 'Terms' | 'Programme' | 'NoResponse' | 'Other';
export type AwardWithdrawalReason =
  'FailureToSign' | 'FailureToMobilize' | 'ClientRejection' | 'Other';

export const AWARD_DECLINE_REASONS: readonly AwardDeclineReason[] = [
  'Price',
  'Capacity',
  'Terms',
  'Programme',
  'NoResponse',
  'Other',
];
export const AWARD_WITHDRAWAL_REASONS: readonly AwardWithdrawalReason[] = [
  'FailureToSign',
  'FailureToMobilize',
  'ClientRejection',
  'Other',
];

export interface AwardResponse {
  readonly outcome: 'Accepted' | 'Declined';
  readonly respondedOn: string;
  readonly evidenceReference: string;
  readonly reasonCategory: AwardDeclineReason | null;
  readonly reason: string | null;
  readonly recordedByName: string;
  readonly recordedAtUtc: string;
}

export interface AwardWithdrawal {
  readonly id: string;
  readonly reasonCategory: AwardWithdrawalReason;
  readonly reason: string;
  readonly requestedByName: string;
  readonly requestedAtUtc: string;
  readonly status: 'Pending' | 'Approved' | 'Rejected';
  readonly decidedByName: string | null;
  readonly decidedAtUtc: string | null;
  readonly decisionComment: string | null;
  readonly version: string;
  readonly requestedByMe: boolean;
}

export interface AwardActions {
  readonly recordResponse: boolean;
  readonly recordDecline: boolean;
  readonly requestWithdrawal: boolean;
  readonly decideWithdrawal: boolean;
  readonly closeForRetender: boolean;
  readonly promoteNext: boolean;
  /** CF-047 / CF-131 (ADR-111). */
  readonly releaseNotices?: boolean;
  readonly releaseReserves?: boolean;
}

export interface PreviousAward {
  readonly id: string;
  readonly sequence: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly awardValue: string;
  readonly currency: string;
  readonly awardedAtUtc: string;
  readonly state: AwardState;
  readonly reason: string | null;
  readonly baselineSha256: string;
}

export interface AwardResponseInput {
  readonly outcome: 'Accepted' | 'Declined';
  readonly respondedOn: string;
  readonly evidenceReference: string;
  readonly reasonCategory: AwardDeclineReason | null;
  readonly reason: string | null;
}
