import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { problemMessage } from '../../core/localization/product-problem';
import {
  InvitationStatus,
  TenderClosure,
  TenderClosureCounts,
  TenderClosureKind,
  TenderLocalTime,
  TenderStatus,
  BidPricingAnswer,
  BidTermsAnswer,
  TenderPricing,
  TenderTerms,
  ScheduleItemType,
} from '../tendering/tendering.api';

export const EVALUATION_PERMISSIONS = {
  view: 'Evaluation.View',
  openBids: 'Evaluation.OpenBids',
  viewTechnical: 'Evaluation.ViewTechnical',
  viewCommercial: 'Evaluation.ViewCommercial',
  score: 'Evaluation.TechnicalScore',
  level: 'Evaluation.CommercialLevel',
  managePolicy: 'Evaluation.ManagePolicy',
  complete: 'Evaluation.Complete',
} as const;

/** Evaluation opens and evaluates tender bids, so it needs tendering and everything tendering needs. */
export const EVALUATION_FEATURES: readonly string[] = [
  'evaluation',
  'tendering',
  'projects',
  'subcontractor_directory',
  'sourcing',
];

export const POLICY_SCALES: readonly number[] = [5, 10, 100];
export const CRITERION_CATEGORIES = [
  'Technical',
  'Methodology',
  'Schedule',
  'Resources',
  'Quality',
  'Hse',
  'Risk',
  'Other',
] as const;
export type CriterionCategory = (typeof CRITERION_CATEGORIES)[number];
export const ADJUSTMENT_CATEGORIES = [
  'MissingScope',
  'Exclusion',
  'Qualification',
  'Arithmetic',
  'ProvisionalSum',
  'Other',
  'VatBasis',
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];
export type AdjustmentKind = 'Line' | 'Scope';
export type OpenedFileClassification = 'Unclassified' | 'Technical' | 'Commercial';
export type OpeningState =
  'NotPublished' | 'Open' | 'Cancelled' | 'NoSubmissions' | 'Ready' | 'Opened';
export type EvaluationStage = 'NotOpened' | 'NotStarted' | 'InProgress' | 'Completed';
export type EvaluationStatus = 'InProgress' | 'Completed';
export type LevelingStatus = 'NotStarted' | 'InProgress' | 'Completed';
export type ScorecardStatus = 'Draft' | 'Submitted';
export type EvaluationSection = 'Technical' | 'Commercial';
export type NoteKind = 'Comment' | 'Concern' | 'Moderation';
export const CRITERIA_MAX = 30;
export const POLICY_NAME_MAX = 120;
export const POLICY_DESCRIPTION_MAX = 1000;
export const CRITERION_NAME_MAX = 160;
export const GUIDANCE_MAX = 1000;
export const COMMENT_MAX = 2000;
export const EVIDENCE_MAX = 500;
export const NOTE_MAX = 2000;

// ------------------------------------------------------------------ opening

export interface OpenedFile {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly requirementLabel: string | null;
  readonly classification: OpenedFileClassification;
  readonly classifiedByName: string | null;
  readonly classifiedAtUtc: string | null;
  readonly version: string;
  /** Part 10: null for a file of the opened revision; N for a file of a closed negotiation round's response. */
  readonly roundNumber?: number | null;
  /** CF-070: held while being scanned, withheld when the scanner flagged it; only a clean file can be downloaded. */
  readonly scanState?: FileScanState;
}

/** CF-070 (ADR-094): what the malware scanner has said about a bidder's file. */
export type FileScanState = 'Pending' | 'Clean' | 'Infected';

export interface OpenedBid {
  readonly id: string;
  readonly position: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly bidRevisionNumber: number;
  readonly answeredTenderRevision: number;
  readonly answeredOlderRevision: boolean;
  readonly submittedAtUtc: string;
  readonly contentSha256: string;
  readonly outstandingAcknowledgements: readonly number[];
  readonly files: readonly OpenedFile[];
  readonly withheldFileCount: number;
  /** CF-058 (ADR-102): the opened revision was recorded from a bid received outside the portal. */
  readonly outsidePortal?: boolean;
  /** CF-049 (ADR-100): the firm withdrew after opening, as recorded by the buyer (the opening record is unchanged). */
  readonly withdrawal?: {
    readonly stage: 'BeforeDeadline' | 'AfterOpening';
    readonly recordedAtUtc: string;
    readonly recordedByName: string;
    readonly revisionInForce: number;
    readonly reason: string | null;
    readonly evidenceReference: string | null;
  } | null;
}

export interface OpeningAbsentee {
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly finalStatus: InvitationStatus;
  readonly hadDraft: boolean;
}

export interface OpeningRecord {
  readonly id: string;
  readonly openedAtUtc: string;
  readonly openedByName: string;
  readonly closureKind: TenderClosureKind;
  readonly closedAt: TenderLocalTime;
  readonly scheduledDeadline: TenderLocalTime;
  readonly tenderRevision: number;
  readonly currency: string;
  readonly invitedCount: number;
  readonly submittedCount: number;
  readonly bids: readonly OpenedBid[];
  readonly absentees: readonly OpeningAbsentee[];
}

export interface TenderOpening {
  readonly tenderId: string;
  readonly reference: string;
  readonly title: string;
  readonly status: TenderStatus;
  readonly state: OpeningState;
  readonly closure: TenderClosure | null;
  readonly counts: TenderClosureCounts;
  readonly currentTenderRevision: number;
  /** CF-058 (ADR-102): outside-portal bids awaiting a second user's confirmation (the opening waits for them). */
  readonly unconfirmedOutsideBids?: number;
  readonly submittedAnsweringOlderRevision: number;
  readonly canOpen: boolean;
  readonly canClassifyFiles: boolean;
  readonly opening: OpeningRecord | null;
  readonly serverTimeUtc: string;
  readonly timeZoneId: string;
}

// ------------------------------------------------------------------ evaluation

export interface EvaluationAccess {
  readonly viewTechnical: boolean;
  readonly viewCommercial: boolean;
  readonly score: boolean;
  readonly level: boolean;
  readonly managePolicy: boolean;
  readonly complete: boolean;
  readonly openBids: boolean;
}

export interface EvaluationState {
  readonly id: string;
  readonly status: EvaluationStatus;
  readonly policyId: string;
  readonly policyName: string;
  readonly policyVersionNumber: number;
  readonly scaleMaximum: number;
  readonly blindTechnicalScoring: boolean;
  readonly levelingStatus: LevelingStatus;
  readonly levelingCompletedAtUtc: string | null;
  readonly levelingCompletedByName: string | null;
  readonly priceOutlierPercent: number;
  readonly durationOutlierPercent: number;
  readonly completedAtUtc: string | null;
  readonly completedByName: string | null;
  readonly excludedDraftCount: number;
  readonly reopenedAtUtc: string | null;
  readonly reopenedByName: string | null;
  readonly reopenReason: string | null;
  readonly startedByName: string;
  readonly startedAtUtc: string;
  readonly version: string;
  /** Part 10: the latest negotiation round whose responses this evaluation covers (0 = the opened bids). */
  readonly round: number;
  readonly roundRefreshedAtUtc: string | null;
  readonly roundRefreshedByName: string | null;
  /** CF-040 (ADR-105): the declared policy in use, another one (with the reason), or none declared. */
  readonly criteriaDeclaration?: 'declared' | 'deviated' | 'notDeclared';
  readonly declaredPolicyName?: string | null;
  readonly declaredPolicyVersionNumber?: number | null;
  readonly policyDeviationReason?: string | null;
}

export interface EvaluationFlag {
  readonly key: string;
  readonly section: 'general' | 'technical' | 'commercial';
  readonly severity: 'warning' | 'info';
  readonly parameters: Readonly<Record<string, string>>;
}

/** A missing item: subjectId is the opened bid for a completion gap, the criterion for a scorecard gap. */
export interface EvaluationGap {
  readonly key: string;
  readonly subjectId: string | null;
}

export interface BidProgress {
  readonly openingBidId: string;
  readonly position: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly bidRevisionNumber: number;
  readonly answeredTenderRevision: number;
  readonly answeredOlderRevision: boolean;
  readonly outstandingAcknowledgements: readonly number[];
  readonly submittedAtUtc: string;
  readonly submittedScorecards: number;
  readonly draftScorecards: number;
  readonly myScorecardStatus: ScorecardStatus | null;
  readonly flags: readonly EvaluationFlag[];
  /** Part 10: the response in force (revision and the round it came from; 0 = the opened bid). */
  readonly currentRevisionNumber: number;
  readonly currentRound: number;
  /** CF-043 (ADR-106): for a reader who sees every scorecard, the spread of evaluator totals (never an average) and its moderation. */
  readonly scoreSpread?: string | null;
  readonly divergent?: boolean;
  readonly moderated?: boolean;
}

export interface PolicyOption {
  readonly policyId: string;
  readonly name: string;
  readonly currentVersionNumber: number;
  readonly criteriaCount: number;
  readonly scaleMaximum: number;
  readonly blindTechnicalScoring: boolean;
  /** CF-040 (ADR-105): the policy the tender declared, evaluated with its declared version. */
  readonly declared?: boolean;
  readonly declaredVersionNumber?: number | null;
}

export interface EvaluationOverview {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly tenderCancelled: boolean;
  readonly stage: EvaluationStage;
  readonly openedAtUtc: string | null;
  readonly openedByName: string | null;
  readonly closureKind: TenderClosureKind | null;
  readonly closedAtUtc: string | null;
  readonly tenderRevision: number;
  readonly invitedCount: number;
  readonly evaluation: EvaluationState | null;
  readonly bids: readonly BidProgress[];
  readonly completionGaps: readonly EvaluationGap[];
  readonly access: EvaluationAccess;
  readonly policyOptions: readonly PolicyOption[];
  /** Part 10: the latest closed negotiation round (the evaluation must cover it). */
  readonly latestClosedRound: number;
  readonly negotiationOpen: boolean;
  readonly tenderAwarded: boolean;
  /** The caller may take the latest closed round's responses into the evaluation now. */
  readonly canRefresh: boolean;
  /** CF-043 (ADR-106): the evaluation panel. */
  readonly panel?: EvaluationPanel | null;
}

export interface EvaluationPanel {
  readonly minimum: number;
  readonly divergenceThresholdPoints: number;
  readonly moderationRequired: boolean;
  readonly assignments: readonly EvaluatorAssignment[];
  readonly candidates: readonly EvaluatorCandidate[];
  readonly canAssign: boolean;
  readonly assignedToMe: boolean;
}

export type EvaluatorBidState = 'NotStarted' | 'Draft' | 'Submitted' | 'RescoreRequired';

export interface EvaluatorAssignment {
  readonly id: string;
  readonly memberName: string;
  readonly assignedAtUtc: string;
  readonly assignedByName: string;
  readonly isMe: boolean;
  readonly bids: readonly { openingBidId: string; status: EvaluatorBidState }[];
  readonly submittedCount: number;
  readonly version: string;
}

export interface EvaluatorCandidate {
  readonly memberId: string;
  readonly name: string;
  readonly seesCommercial: boolean;
}

export interface OpenedFileRef {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly requirementLabel: string | null;
  readonly classification: OpenedFileClassification;
}

export interface EvaluationNote {
  readonly id: string;
  readonly openingBidId: string;
  readonly section: EvaluationSection;
  readonly kind: NoteKind;
  readonly text: string;
  readonly authorName: string;
  readonly writtenAtUtc: string;
}

export interface ScoreEntry {
  readonly criterionId: string;
  readonly score: number | null;
  readonly comment: string | null;
  readonly evidence: string | null;
}

export interface Scorecard {
  readonly id: string;
  readonly openingBidId: string;
  readonly status: ScorecardStatus;
  readonly submissionCount: number;
  readonly submittedAtUtc: string | null;
  readonly entries: readonly ScoreEntry[];
  readonly weightedTotal: number | null;
  readonly gaps: readonly EvaluationGap[];
  readonly updatedAtUtc: string;
  readonly version: string;
  /** Part 10: the revision the scorecard scores, and whether that is still the response in force. */
  readonly revisionNumber: number;
  readonly scoresCurrentResponse: boolean;
}

export interface SubmittedCriterionScore {
  readonly criterionId: string;
  readonly name: string;
  readonly category: CriterionCategory;
  readonly weight: number;
  readonly score: number;
  readonly weightedScore: number;
  readonly comment: string | null;
  readonly evidence: string | null;
}

export interface SubmittedScorecard {
  readonly id: string;
  readonly openingBidId: string;
  readonly number: number;
  readonly evaluatorName: string;
  readonly mine: boolean;
  readonly submittedAtUtc: string;
  readonly weightedTotal: number;
  readonly scaleMaximum: number;
  readonly scores: readonly SubmittedCriterionScore[];
  readonly revisionNumber: number;
  readonly scoresCurrentResponse: boolean;
}

export interface TechnicalBid {
  readonly openingBidId: string;
  readonly position: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly bidRevisionNumber: number;
  readonly answeredTenderRevision: number;
  readonly answeredOlderRevision: boolean;
  readonly outstandingAcknowledgements: readonly number[];
  readonly submittedAtUtc: string;
  readonly scopeCompliance: 'Full' | 'WithDeviations';
  readonly technicalApproach: string | null;
  readonly technicalDeviations: readonly string[];
  readonly technicalNotes: string | null;
  readonly files: readonly OpenedFileRef[];
  readonly withheldFileCount: number;
  readonly myScorecard: Scorecard | null;
  readonly submittedScorecards: readonly SubmittedScorecard[];
  readonly submittedScorecardCount: number;
  readonly notes: readonly EvaluationNote[];
  readonly flags: readonly EvaluationFlag[];
  readonly currentRevisionNumber: number;
  readonly currentRound: number;
  readonly technicalChangedSinceOpening: boolean;
  /** A revised response changed the technical answers: earlier scorecards no longer count. */
  readonly rescoreRequired: boolean;
}

export interface Criterion {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly category: CriterionCategory;
  readonly weight: number;
  readonly guidance: string | null;
  readonly commentRequired: boolean;
  readonly evidenceRequired: boolean;
}

export interface PolicyVersion {
  readonly id: string;
  readonly number: number;
  readonly scaleMaximum: number;
  readonly blindTechnicalScoring: boolean;
  readonly createdAtUtc: string;
  readonly createdByName: string;
  readonly lockedAtUtc: string | null;
  readonly criteria: readonly Criterion[];
}

export interface TechnicalWorkspace {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly technicalProposalRequired: boolean;
  readonly evaluation: EvaluationState | null;
  readonly policy: PolicyVersion | null;
  readonly bids: readonly TechnicalBid[];
  readonly canScore: boolean;
  readonly scoreBlockedReason: string | null;
  readonly seesAllScorecards: boolean;
  readonly access: EvaluationAccess;
}

export interface CommercialLine {
  readonly position: number;
  readonly description: string;
  readonly submittedAmount: string;
  readonly leveledAmount: string | null;
  readonly adjustmentId: string | null;
  readonly alignmentKey: string | null;
}

export interface Adjustment {
  readonly id: string;
  readonly openingBidId: string;
  readonly kind: AdjustmentKind;
  readonly linePosition: number | null;
  readonly originalAmount: string | null;
  readonly leveledAmount: string | null;
  readonly delta: string;
  readonly category: AdjustmentCategory;
  readonly reason: string;
  readonly createdByName: string;
  readonly recordedAtUtc: string;
  readonly active: boolean;
  readonly withdrawnAtUtc: string | null;
  readonly withdrawnByName: string | null;
  readonly withdrawalReason: string | null;
  readonly version: string;
  /** Part 10: the revision the adjustment was recorded on, and whether it still applies to the response in force. */
  readonly revisionNumber: number;
  readonly appliesToCurrentResponse: boolean;
  /** CF-090 (ADR-104): an adjustment the revised response no longer matches waits for a review; the review that settled it, if any. */
  readonly carryReviewRequired?: boolean;
  readonly carry?: AdjustmentCarry | null;
  readonly carriedFromAdjustmentId?: string | null;
}

export type CarryOutcome = 'Reapplied' | 'NotApplicable';

export interface AdjustmentCarry {
  readonly outcome: CarryOutcome;
  readonly reason: string | null;
  readonly newAdjustmentId: string | null;
  readonly reviewedByName: string;
  readonly reviewedAtUtc: string;
}

export interface CommercialBid {
  readonly openingBidId: string;
  readonly position: number;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly bidRevisionNumber: number;
  readonly answeredTenderRevision: number;
  readonly answeredOlderRevision: boolean;
  readonly submittedAtUtc: string;
  readonly currency: string;
  readonly currencyMismatch: boolean;
  readonly submittedTotal: string;
  readonly leveledTotal: string;
  readonly adjustmentTotal: string;
  readonly lines: readonly CommercialLine[];
  readonly validityDays: number | null;
  readonly paymentTerms: string | null;
  readonly durationDays: number | null;
  readonly warrantyMonths: number | null;
  readonly exclusions: readonly string[];
  readonly commercialDeviations: readonly string[];
  readonly commercialNotes: string | null;
  readonly technicalDeviations: readonly string[];
  readonly scopeCompliance: 'Full' | 'WithDeviations' | null;
  readonly files: readonly OpenedFileRef[];
  readonly adjustments: readonly Adjustment[];
  readonly notes: readonly EvaluationNote[];
  readonly flags: readonly EvaluationFlag[];
  readonly currentRevisionNumber: number;
  readonly currentRound: number;
  readonly commercialChangedSinceOpening: boolean;
  /** CF-055 (ADR-092): the bid's answers; false while it departs from the VAT basis without an adjustment. */
  readonly pricing: BidPricingAnswer | null;
  readonly terms: BidTermsAnswer | null;
  readonly vatComparable: boolean;
  /** CF-090: adjustments made on an earlier revision that wait for a review, and what they added to the earlier total. */
  readonly notCarriedCount?: number;
  readonly notCarriedTotal?: string | null;
  /**
   * Red-team B7 (CF-037 AC4, CF-039 AC1): the leveled total against the estimate (signed percent; only for estimate readers and only in
   * the same currency — never converted), and the bid's derived validity: valid-until, the company basis it runs from, its state now.
   */
  readonly estimateVariancePercent?: string | null;
  readonly validUntilUtc?: string | null;
  /** SubmissionDeadline or RevisionSubmission. */
  readonly validityBasis?: string | null;
  readonly validityState?: 'NotStated' | 'Valid' | 'LapsingSoon' | 'Lapsed';
}

export interface AlignedLine {
  readonly key: string;
  readonly description: string;
  readonly submittedAmounts: readonly (string | null)[];
  readonly leveledAmounts: readonly (string | null)[];
}

/**
 * CF-004 (ADR-093): one schedule item across the bids, aligned by its key. `inForce` is false for an item an addendum removed that an
 * older-revision bid still priced. Cells follow the bids' position order.
 */
export interface ScheduleLevelingRow {
  readonly key: string;
  readonly section: string | null;
  readonly description: string;
  readonly unit: string | null;
  readonly quantity: string | null;
  readonly type: ScheduleItemType;
  readonly inForce: boolean;
  readonly bids: readonly ScheduleLevelingCell[];
}

export interface ScheduleLevelingCell {
  readonly state: 'priced' | 'notPriced' | 'provisional' | 'missing';
  readonly quantity: string | null;
  readonly rate: string | null;
  readonly amount: string | null;
  readonly quantityDiffers: boolean;
}

export interface ScopeMatrixRow {
  readonly kind: 'exclusion' | 'commercialDeviation' | 'technicalDeviation';
  readonly text: string;
  readonly statedBy: readonly boolean[];
}

export interface CommercialComparison {
  readonly comparableBids: number;
  readonly medianLeveledTotal: string | null;
  readonly medianDurationDays: number | null;
  readonly minimumBidsForOutliers: number;
}

export interface CommercialWorkspace {
  readonly tenderId: string;
  readonly tenderReference: string;
  readonly currency: string;
  readonly requestedValidityDays: number | null;
  readonly evaluation: EvaluationState | null;
  readonly bids: readonly CommercialBid[];
  readonly alignedLines: readonly AlignedLine[];
  readonly scopeMatrix: readonly ScopeMatrixRow[];
  readonly comparison: CommercialComparison;
  readonly canLevel: boolean;
  readonly access: EvaluationAccess;
  /** CF-055: what the tender stated. */
  readonly pricing: TenderPricing | null;
  readonly requestedTerms: TenderTerms | null;
  /** CF-004: the price schedule levelled by item key (absent or null for a lump-sum tender). */
  readonly schedule?: readonly ScheduleLevelingRow[] | null;
  /**
   * Red-team B7 (CF-037 AC3/AC4): the package estimate, only for readers of the estimate (price-blind readers never get these): its
   * current value and currency, the value in force at publication, whether it changed after publication, and whether it compares with
   * the bids at all (false, reason "currency", when it is in another currency; nothing is converted).
   */
  readonly estimate?: string | null;
  readonly estimateCurrency?: string | null;
  readonly estimateAtPublication?: string | null;
  readonly estimateChangedAfterPublication?: boolean;
  readonly estimateComparable?: boolean | null;
  readonly estimateNotComparableReason?: string | null;
  /** Red-team G050: the tender's IANA time zone, in which validity dates are shown. */
  readonly timeZoneId?: string | null;
}

export interface AdjustmentInput {
  readonly kind: AdjustmentKind;
  readonly linePosition: number | null;
  readonly leveledAmount: string | null;
  readonly direction: 'Add' | 'Deduct' | null;
  readonly amount: string | null;
  readonly category: AdjustmentCategory;
  readonly reason: string;
}

// ------------------------------------------------------------------ policies

export interface PolicySummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: 'Active' | 'Inactive';
  readonly currentVersionNumber: number;
  readonly criteriaCount: number;
  readonly scaleMaximum: number;
  readonly blindTechnicalScoring: boolean;
  readonly currentVersionLocked: boolean;
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface Policy {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: 'Active' | 'Inactive';
  readonly currentVersionNumber: number;
  readonly current: PolicyVersion;
  readonly versions: readonly PolicyVersion[];
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface CriterionInput {
  name: string;
  category: CriterionCategory;
  /** Percentage as typed, e.g. "35.5"; sent as a number with at most two decimals. */
  weight: string;
  guidance: string;
  commentRequired: boolean;
  evidenceRequired: boolean;
}

export interface PolicyInput {
  readonly name: string;
  readonly description: string;
  readonly scaleMaximum: number;
  readonly blindTechnicalScoring: boolean;
  readonly criteria: readonly CriterionInput[];
  /** Re-audit R-14: a new policy saved Inactive (the example scorecard); ignored on an update. */
  readonly initialStatus?: 'Inactive';
}

@Injectable({ providedIn: 'root' })
export class EvaluationApi {
  private readonly http = inject(HttpClient);

  opening(tenderId: string): Observable<TenderOpening> {
    return this.http.get<TenderOpening>(`${this.tender(tenderId)}/opening`);
  }

  open(tenderId: string, requestKey: string): Observable<TenderOpening> {
    return this.http.post<TenderOpening>(`${this.tender(tenderId)}/opening`, {
      confirmed: true,
      requestKey,
    });
  }

  classify(
    tenderId: string,
    fileId: string,
    classification: OpenedFileClassification,
    version: string,
  ): Observable<TenderOpening> {
    return this.http.post<TenderOpening>(
      `${this.tender(tenderId)}/opening/files/${encodeURIComponent(fileId)}/classification`,
      { classification, version },
    );
  }

  /** CF-049 (ADR-100): records a firm's withdrawal after opening, with a reason and the reference of its evidence. */
  recordWithdrawal(
    tenderId: string,
    openingBidId: string,
    reason: string,
    evidenceReference: string,
    requestKey: string,
  ): Observable<TenderOpening> {
    return this.http.post<TenderOpening>(
      `${this.tender(tenderId)}/opening/bids/${encodeURIComponent(openingBidId)}/withdrawal`,
      { reason, evidenceReference, requestKey },
    );
  }

  fileUrl(tenderId: string, fileId: string): string {
    return `${this.tender(tenderId)}/opening/files/${encodeURIComponent(fileId)}/content`;
  }

  overview(tenderId: string): Observable<EvaluationOverview> {
    return this.http.get<EvaluationOverview>(`${this.tender(tenderId)}/evaluation`);
  }

  start(
    tenderId: string,
    policyId: string,
    version: string | null,
    deviationReason: string | null = null,
    panelMinimum: number | null = null,
  ): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(`${this.tender(tenderId)}/evaluation`, {
      policyId,
      version,
      deviationReason,
      panelMinimum,
    });
  }

  /** CF-043 (ADR-106): names a member to the evaluation panel. */
  assign(tenderId: string, memberId: string): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(`${this.tender(tenderId)}/evaluation/assignments`, {
      memberId,
    });
  }

  unassign(
    tenderId: string,
    assignmentId: string,
    version: string,
  ): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(
      `${this.tender(tenderId)}/evaluation/assignments/${encodeURIComponent(assignmentId)}/remove`,
      { version },
    );
  }

  complete(
    tenderId: string,
    excludeDraftScorecards: boolean,
    version: string,
  ): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(`${this.tender(tenderId)}/evaluation/complete`, {
      excludeDraftScorecards,
      version,
    });
  }

  reopen(tenderId: string, reason: string, version: string): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(`${this.tender(tenderId)}/evaluation/reopen`, {
      reason,
      version,
    });
  }

  /** Part 10: takes the latest closed negotiation round's responses into the evaluation. */
  refresh(tenderId: string, version: string): Observable<EvaluationOverview> {
    return this.http.post<EvaluationOverview>(`${this.tender(tenderId)}/evaluation/refresh`, {
      version,
    });
  }

  technical(tenderId: string): Observable<TechnicalWorkspace> {
    return this.http.get<TechnicalWorkspace>(`${this.tender(tenderId)}/evaluation/technical`);
  }

  saveScorecard(
    tenderId: string,
    bidId: string,
    entries: readonly ScoreEntry[],
    version: string | null,
  ): Observable<Scorecard> {
    return this.http.put<Scorecard>(this.scorecard(tenderId, bidId), { entries, version });
  }

  submitScorecard(tenderId: string, bidId: string, version: string): Observable<Scorecard> {
    return this.http.post<Scorecard>(`${this.scorecard(tenderId, bidId)}/submit`, { version });
  }

  reopenScorecard(tenderId: string, bidId: string, version: string): Observable<Scorecard> {
    return this.http.post<Scorecard>(`${this.scorecard(tenderId, bidId)}/reopen`, { version });
  }

  commercial(tenderId: string): Observable<CommercialWorkspace> {
    return this.http.get<CommercialWorkspace>(`${this.tender(tenderId)}/evaluation/commercial`);
  }

  thresholds(
    tenderId: string,
    priceOutlierPercent: number,
    durationOutlierPercent: number,
    version: string,
  ): Observable<CommercialWorkspace> {
    return this.http.put<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/thresholds`,
      {
        priceOutlierPercent,
        durationOutlierPercent,
        version,
      },
    );
  }

  adjust(
    tenderId: string,
    bidId: string,
    input: AdjustmentInput,
    requestKey: string,
  ): Observable<CommercialWorkspace> {
    return this.http.post<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/${encodeURIComponent(bidId)}/adjustments`,
      { ...input, requestKey },
    );
  }

  withdraw(
    tenderId: string,
    adjustmentId: string,
    reason: string,
    version: string,
  ): Observable<CommercialWorkspace> {
    return this.http.post<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/adjustments/${encodeURIComponent(adjustmentId)}/withdraw`,
      { reason, version },
    );
  }

  /** CF-003 (ADR-109): the leveling workbook — a same-origin download link (commercial field class only, audited). */
  levelingExportUrl(tenderId: string): string {
    return `${this.tender(tenderId)}/evaluation/commercial/export.xlsx`;
  }

  /** CF-090 (ADR-104): re-applies an earlier revision's adjustment to the response in force, or confirms it no longer applies. */
  carry(
    tenderId: string,
    adjustmentId: string,
    outcome: CarryOutcome,
    reason: string | null,
    requestKey: string,
  ): Observable<CommercialWorkspace> {
    return this.http.post<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/adjustments/${encodeURIComponent(adjustmentId)}/carry`,
      { outcome, reason, requestKey },
    );
  }

  completeLeveling(tenderId: string, version: string): Observable<CommercialWorkspace> {
    return this.http.post<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/complete`,
      {
        version,
      },
    );
  }

  reopenLeveling(tenderId: string, version: string): Observable<CommercialWorkspace> {
    return this.http.post<CommercialWorkspace>(
      `${this.tender(tenderId)}/evaluation/commercial/reopen`,
      {
        version,
      },
    );
  }

  addNote(
    tenderId: string,
    openingBidId: string,
    section: EvaluationSection,
    kind: NoteKind,
    text: string,
  ): Observable<EvaluationNote> {
    return this.http.post<EvaluationNote>(`${this.tender(tenderId)}/evaluation/notes`, {
      openingBidId,
      section,
      kind,
      text,
    });
  }

  policies(): Observable<readonly PolicySummary[]> {
    return this.http.get<readonly PolicySummary[]>('/api/v1/evaluation-policies');
  }

  policy(id: string): Observable<Policy> {
    return this.http.get<Policy>(`/api/v1/evaluation-policies/${encodeURIComponent(id)}`);
  }

  createPolicy(input: PolicyInput): Observable<Policy> {
    return this.http.post<Policy>('/api/v1/evaluation-policies', policyBody(input, null));
  }

  updatePolicy(id: string, input: PolicyInput, version: string): Observable<Policy> {
    return this.http.put<Policy>(
      `/api/v1/evaluation-policies/${encodeURIComponent(id)}`,
      policyBody(input, version),
    );
  }

  setPolicyStatus(id: string, status: 'Active' | 'Inactive', version: string): Observable<Policy> {
    return this.http.post<Policy>(`/api/v1/evaluation-policies/${encodeURIComponent(id)}/status`, {
      status,
      version,
    });
  }

  private tender(id: string): string {
    return `/api/v1/tenders/${encodeURIComponent(id)}`;
  }

  private scorecard(tenderId: string, bidId: string): string {
    return `${this.tender(tenderId)}/evaluation/technical/${encodeURIComponent(bidId)}/scorecard`;
  }
}

function policyBody(input: PolicyInput, version: string | null): unknown {
  return {
    name: input.name,
    description: input.description,
    scaleMaximum: input.scaleMaximum,
    blindTechnicalScoring: input.blindTechnicalScoring,
    criteria: input.criteria.map((criterion) => ({
      name: criterion.name,
      category: criterion.category,
      weight: Number(criterion.weight),
      guidance: criterion.guidance,
      commentRequired: criterion.commentRequired,
      evidenceRequired: criterion.evidenceRequired,
    })),
    version,
    ...(input.initialStatus && version === null ? { initialStatus: input.initialStatus } : {}),
  };
}

/**
 * A weight as typed ("35.5", "40") in hundredths, or null when it is not a percentage with at most two decimals. The weight
 * total is summed in whole hundredths so the screen never shows a floating-point artefact such as 99.99999.
 */
export function weightHundredths(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Hundredths shown as a percentage with Latin digits: 10000 → "100", 3550 → "35.5". */
export function hundredthsText(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const fraction = Math.abs(hundredths % 100);
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** A score as typed: a number from 0 to the scale with at most one decimal, or null when it is not one. */
export function parseScore(text: string, scale: number): number | null {
  const value = text.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(value)) return null;
  const tenths = Number(value.replace('.', '')) * (value.includes('.') ? 1 : 10);
  return tenths <= scale * 10 ? tenths / 10 : null;
}

export function evaluationProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}
