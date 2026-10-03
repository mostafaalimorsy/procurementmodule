import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { ltr } from '../../core/localization/labels';
import { knownProductProblem } from '../../core/localization/product-problem';
import {
  ApprovalActionKind,
  BidDisposition,
  BidValidityState,
  CompetitionJustification,
  DecisionStatus,
  DecisionStep,
  EvidenceStatus,
  LiveState,
  NegotiationParticipantStatus,
  NegotiationRound,
  NegotiationRoundType,
  NegotiationScope,
  RecommendationCriterionKind,
  RevisionKind,
  ValidityConfirmationChannel,
} from './decision.api';

// Every Part 10 label in one place. Counts in code are label-style ("Responses: 2 of 3"), so no language needs a plural
// rule here (templates use ICU plurals); identifiers and numbers are isolated left-to-right inside Arabic. Wording keeps the
// procurement distinctions exact: a recommendation rank is a policy result (never a "winner"), approval is not award,
// and a bidder's "rejected" disposition is not an approver rejecting the proposal.

export function roundTypeLabel(type: NegotiationRoundType | string): string {
  return type === 'Bafo'
    ? $localize`:@@negotiation.typeBafo:Best and final offer (BAFO)`
    : $localize`:@@negotiation.typeRevision:Revised offer`;
}

export function roundScopeLabel(scope: NegotiationScope | string): string {
  switch (scope) {
    case 'Commercial':
      return $localize`:@@negotiation.scopeCommercial:Commercial (prices and terms)`;
    case 'Technical':
      return $localize`:@@negotiation.scopeTechnical:Technical proposal`;
    default:
      return $localize`:@@negotiation.scopeBoth:Commercial and technical`;
  }
}

/** A round's state in words (never by colour alone), including whether an open round's deadline has passed. */
export function roundStatusLabel(round: NegotiationRound): string {
  if (round.status === 'Cancelled') return $localize`:@@negotiation.roundCancelled:Round cancelled`;
  if (round.status === 'Closed')
    return round.closureKind === 'Early'
      ? $localize`:@@negotiation.roundClosedEarly:Round closed early`
      : $localize`:@@negotiation.roundClosedAtDeadline:Round closed at its deadline`;
  return round.deadlinePassed
    ? $localize`:@@negotiation.statusDeadlinePassed:Deadline passed — close the round`
    : $localize`:@@negotiation.roundOpen:Round open for responses`;
}

export function participantStatusLabel(status: NegotiationParticipantStatus | string): string {
  return (
    (
      {
        Invited: $localize`:@@participantStatus.invited:Invited, not started`,
        Started: $localize`:@@participantStatus.started:Preparing a response`,
        Submitted: $localize`:@@participantStatus.submitted:Response submitted`,
        Declined: $localize`:@@participantStatus.declined:Declined to revise`,
        NoResponse: $localize`:@@participantStatus.noResponse:No response`,
        Withdrawn: $localize`:@@participantStatus.withdrawn:Removed from the round`,
      } as Record<string, string>
    )[status] ?? status
  );
}

export function revisionKindLabel(kind: RevisionKind | string, round: number): string {
  if (kind === 'Bafo' || kind === 'Revision') {
    const type =
      kind === 'Bafo' ? $localize`:@@comparison.bafoShort:BAFO` : roundTypeLabel('Revision');
    return $localize`:@@comparison.revisionRound:Round ${round}:round: — ${type}:type:`;
  }
  // CF-045 (ADR-099): the firm's own revision before the deadline.
  if (kind === 'Resubmission')
    return $localize`:@@comparison.revisionResubmission:Revised before the deadline`;
  if (kind === 'OutsidePortal')
    return $localize`:@@comparison.revisionOutsidePortal:Recorded outside the portal`;
  return $localize`:@@comparison.revisionOriginal:Original submission`;
}

export function comparisonFieldLabel(field: string): string {
  return (
    (
      {
        scopeCompliance: $localize`:@@comparisonField.scopeCompliance:Scope compliance`,
        technicalApproach: $localize`:@@comparisonField.technicalApproach:Technical approach`,
        technicalNotes: $localize`:@@comparisonField.technicalNotes:Technical notes`,
        technicalDeviations: $localize`:@@comparisonField.technicalDeviations:Technical deviations`,
        totalAmount: $localize`:@@comparisonField.totalAmount:Total amount`,
        validityDays: $localize`:@@comparisonField.validityDays:Validity (days)`,
        paymentTerms: $localize`:@@comparisonField.paymentTerms:Payment terms`,
        durationDays: $localize`:@@comparisonField.durationDays:Duration (days)`,
        warrantyMonths: $localize`:@@comparisonField.warrantyMonths:Warranty (months)`,
        commercialNotes: $localize`:@@comparisonField.commercialNotes:Commercial notes`,
        exclusions: $localize`:@@comparisonField.exclusions:Exclusions`,
        commercialDeviations: $localize`:@@comparisonField.commercialDeviations:Commercial deviations`,
      } as Record<string, string>
    )[field] ?? field
  );
}

/** A comparison value in words where it is a stored code (scope compliance), otherwise as given. */
export function comparisonValue(field: string, value: string | null): string {
  if (value === null) return '—';
  if (field === 'scopeCompliance')
    return value === 'Full'
      ? $localize`:@@comparison.scopeFull:Full scope`
      : value === 'WithDeviations'
        ? $localize`:@@comparison.scopeDeviations:With deviations`
        : value;
  return value;
}

export function lineChangeLabel(change: string): string {
  return (
    (
      {
        unchanged: $localize`:@@lineChange.unchanged:Unchanged`,
        changed: $localize`:@@lineChange.changed:Changed`,
        added: $localize`:@@lineChange.added:Added`,
        removed: $localize`:@@lineChange.removed:Removed`,
      } as Record<string, string>
    )[change] ?? change
  );
}

export function criterionKindLabel(kind: RecommendationCriterionKind | string): string {
  return (
    (
      {
        Commercial: $localize`:@@criterionKind.commercial:Commercial (leveled price)`,
        Technical: $localize`:@@criterionKind.technical:Technical score`,
        Schedule: $localize`:@@criterionKind.schedule:Schedule (proposed duration)`,
        Risk: $localize`:@@criterionKind.risk:Risk (exclusions and deviations)`,
        PastPerformance: $localize`:@@criterionKind.pastPerformance:Past performance (history)`,
      } as Record<string, string>
    )[kind] ?? kind
  );
}

/** How each criterion is scored, stated so a reader can check the arithmetic. */
export function criterionKindRule(kind: RecommendationCriterionKind | string): string {
  switch (kind) {
    case 'Commercial':
      return $localize`:@@criterionRule.commercial:The lowest eligible leveled total scores 100; others score lowest ÷ theirs × 100.`;
    case 'Technical':
      return $localize`:@@criterionRule.technical:The mean of the current submitted technical scorecard totals, each out of 100.`;
    case 'Schedule':
      return $localize`:@@criterionRule.schedule:The shortest eligible duration scores 100; others score shortest ÷ theirs × 100. No duration scores 0.`;
    case 'Risk':
      return $localize`:@@criterionRule.risk:The fewest stated exclusions and deviations score 100, the most score 0, linearly between.`;
    default:
      return $localize`:@@criterionRule.pastPerformance:Your company's own record of completed work. Not applied until every eligible firm has history.`;
  }
}

export function evidenceStatusLabel(status: EvidenceStatus | string): string {
  switch (status) {
    case 'Available':
      return $localize`:@@evidenceStatus.available:Evidence available`;
    case 'Missing':
      return $localize`:@@evidenceStatus.missing:Missing — not stated in the bid, scored 0`;
    case 'Unavailable':
      return $localize`:@@evidenceStatus.unavailable:Unavailable — weight not applied`;
    default:
      return $localize`:@@evidenceStatus.notScored:Not scored (not eligible)`;
  }
}

/** The recommendation's live state. A stale recommendation is never called ready. */
export function liveStateLabel(state: LiveState | string, reason: string | null = null): string {
  switch (state) {
    case 'Ready':
      return $localize`:@@recommendationState.current:Recommendation ready`;
    case 'InsufficientHistory':
      return $localize`:@@recommendationState.insufficientHistory:Insufficient history`;
    case 'MissingEvaluation':
      return $localize`:@@recommendationState.missingEvaluation:Missing evaluation`;
    default:
      return $localize`:@@recommendationState.recomputeRequired:Recompute required (${staleReasonLabel(reason)}:reason:)`;
  }
}

export function staleReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'policy_changed':
      return $localize`:@@staleReason.policyChanged:the policy changed`;
    case 'evidence_changed':
      return $localize`:@@staleReason.evidenceChanged:the evaluation evidence changed`;
    case 'tender_cancelled':
      return $localize`:@@staleReason.tenderCancelled:the tender was cancelled`;
    case 'superseded':
      return $localize`:@@staleReason.superseded:a newer recommendation exists`;
    case 'subcontractor_blocked':
      return $localize`:@@staleReason.subcontractorBlocked:a firm it ranks was blocked in the directory`;
    case 'bid_withdrawn':
      return $localize`:@@staleReason.bidWithdrawn:a firm it ranks withdrew its bid`;
    case 'evaluation_not_completed':
      return $localize`:@@staleReason.evaluationNotCompleted:the evaluation is not complete`;
    default:
      return $localize`:@@staleReason.unknown:the evidence is no longer current`;
  }
}

export function readinessLabel(state: string): string {
  switch (state) {
    case 'Ready':
      return $localize`:@@readiness.ready:Ready for a recommendation`;
    case 'NotOpened':
      return $localize`:@@readiness.notOpened:Bids not opened yet`;
    case 'MissingEvaluation':
      return $localize`:@@readiness.missingEvaluation:Evaluation not complete`;
    case 'RefreshRequired':
      return $localize`:@@readiness.refreshRequired:Round responses not yet taken into the evaluation`;
    case 'NegotiationOpen':
      return $localize`:@@readiness.negotiationOpen:A negotiation round is open`;
    case 'TenderCancelled':
      return $localize`:@@readiness.tenderCancelled:Tender cancelled`;
    case 'Awarded':
      return $localize`:@@readiness.awarded:Awarded`;
    default:
      return state;
  }
}

export function readinessGapLabel(gap: string): string {
  switch (gap) {
    case 'evaluation_not_started':
      return $localize`:@@readinessGap.notStarted:The evaluation has not started.`;
    case 'evaluation_not_completed':
      return $localize`:@@readinessGap.notCompleted:The evaluation is not marked complete.`;
    case 'negotiation_open':
      return $localize`:@@readinessGap.negotiationOpen:A negotiation round is still open. Close or cancel it first.`;
    case 'negotiation_deadline_passed':
      return $localize`:@@readinessGap.negotiationDeadlinePassed:A negotiation round is past its response deadline and still open. Close it to take its responses in.`;
    case 'evaluation_refresh_required':
      return $localize`:@@readinessGap.refreshRequired:A closed round's responses must be taken into the evaluation (and the evaluation completed again).`;
    default:
      return gap;
  }
}

export function decisionStatusLabel(status: DecisionStatus | null): string {
  switch (status) {
    case 'Draft':
      return $localize`:@@decisionStatus.draft:Draft — not submitted`;
    case 'PendingApproval':
      return $localize`:@@decisionStatus.pending:Awaiting approval`;
    case 'Approved':
      return $localize`:@@decisionStatus.approved:Approved — award not issued yet`;
    case 'Awarded':
      return $localize`:@@decisionStatus.awarded:Awarded`;
    default:
      return $localize`:@@decisionStatus.none:No decision prepared`;
  }
}

export function outcomeLabel(outcome: string): string {
  return (
    (
      {
        Pending: $localize`:@@submissionOutcome.pending:Awaiting approval`,
        Approved: $localize`:@@submissionOutcome.approved:Approved`,
        Returned: $localize`:@@submissionOutcome.returned:Returned for changes`,
        Rejected: $localize`:@@submissionOutcome.rejected:Proposal rejected by an approver`,
        Withdrawn: $localize`:@@submissionOutcome.withdrawn:Withdrawn by the submitter`,
        Awarded: $localize`:@@submissionOutcome.awarded:Awarded`,
        Superseded: $localize`:@@submissionOutcome.superseded:Superseded`,
      } as Record<string, string>
    )[outcome] ?? outcome
  );
}

/** A bidder's disposition in the decision. "Not selected" is never an approver's rejection of the proposal. */
export function dispositionLabel(
  disposition: BidDisposition | string,
  rank: number | null,
): string {
  switch (disposition) {
    case 'Award':
      return $localize`:@@disposition.award:Proposed for award`;
    case 'Reserve':
      return rank === null
        ? $localize`:@@disposition.reserve:Reserve`
        : $localize`:@@disposition.reserveRanked:Reserve, order ${rank}:rank:`;
    default:
      return $localize`:@@disposition.reject:Not selected (bid rejected)`;
  }
}

export function approvalActionLabel(kind: ApprovalActionKind | string): string {
  switch (kind) {
    case 'Approve':
      return $localize`:@@approvalAction.approve:Approved`;
    case 'Return':
      return $localize`:@@approvalAction.return:Returned for changes`;
    case 'Reject':
      return $localize`:@@approvalAction.reject:Rejected the proposal`;
    default:
      return $localize`:@@approvalAction.withdraw:Withdrawn by the submitter`;
  }
}

export function approvalBlockerLabel(blocker: string | null): string {
  switch (blocker) {
    case 'self_approval':
      return $localize`:@@approvalBlocker.self:You submitted this decision, and the approval rule does not allow self-approval. Another approver must act on it.`;
    case 'role_required':
      return $localize`:@@approvalBlocker.role:The next approval step needs an approver with a different role.`;
    case 'recommendation_stale':
      return $localize`:@@approvalBlocker.stale:The recommendation behind this decision is no longer current. It cannot be approved; return or reject it so it can be prepared again.`;
    case 'already_approved':
      return $localize`:@@approvalBlocker.already:You already approved a step of this decision. Each approval must come from a different person.`;
    default:
      return '';
  }
}

/** CF-008: where the decision stands and who acts next, in the same words as its status chip. */
export function decisionStepLabel(step: DecisionStep): string {
  const role = approverRoleLabel(step.ownerRole);
  const number = step.stepNumber ?? 1;
  switch (step.state) {
    case 'NoDecision':
      return $localize`:@@decisionStep.none:No decision prepared yet — owner: ${role}:role:`;
    case 'Draft':
      return $localize`:@@decisionStep.draft:Decision draft — owner: ${role}:role:`;
    case 'Returned':
      return $localize`:@@decisionStep.returned:Returned for changes — revise it (owner: ${role}:role:)`;
    case 'Rejected':
      return $localize`:@@decisionStep.rejected:Proposal rejected — prepare it again (owner: ${role}:role:)`;
    case 'AwaitingApproval':
      return $localize`:@@decisionStep.awaiting:Waiting for approval step ${number}:step: — role: ${role}:role:`;
    case 'Approved':
      return $localize`:@@decisionStep.approved:Approved — the award is to be issued (owner: ${role}:role:)`;
    default:
      return $localize`:@@decisionStep.awarded:Awarded`;
  }
}

export function approverRoleLabel(role: string | null): string {
  return role ? tenantRoleLabel(role) : $localize`:@@approvalStep.anyApprover:Any approver`;
}

export function ineligibleReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'currency_mismatch':
      return $localize`:@@ineligible.currency:Priced in another currency; never converted.`;
    case 'technical_evaluation_missing':
      return $localize`:@@ineligible.technical:No current submitted technical scorecard.`;
    case 'below_technical_threshold':
      return $localize`:@@ineligible.threshold:Technical score below the policy's pass mark.`;
    case 'subcontractor_blocked':
      return $localize`:@@ineligible.blocked:Blocked in the directory: must not be engaged. Its price sets no baseline.`;
    case 'withdrawn_after_opening':
      return $localize`:@@ineligible.withdrawn:The firm withdrew this bid after opening. Its price sets no baseline.`;
    default:
      return $localize`:@@ineligible.other:Not eligible under this policy.`;
  }
}

export function candidateFlagLabel(flag: string): string {
  return (
    (
      {
        tied: $localize`:@@candidateFlag.tied:Tied with another firm on the total score`,
        revised_in_round: $localize`:@@candidateFlag.revised:Scored on a revised response from a negotiation round`,
        normalized: $localize`:@@candidateFlag.normalized:Leveled by the buyer (adjustments applied)`,
        older_tender_revision: $localize`:@@candidateFlag.olderRevision:Answered an older tender revision`,
        outstanding_acknowledgements: $localize`:@@candidateFlag.acknowledgements:Required addenda not acknowledged`,
        outside_portal: $localize`:@@candidateFlag.outsidePortal:Recorded from a bid received outside the portal`,
        duration_missing: $localize`:@@candidateFlag.durationMissing:No duration stated (schedule scored 0)`,
        exclusions_or_deviations: $localize`:@@candidateFlag.exclusions:States exclusions or deviations`,
        no_history: $localize`:@@candidateFlag.noHistory:No recorded performance history`,
        history_below_minimum: $localize`:@@candidateFlag.belowMinimum:1 finalized closeout — below the minimum of 2, not a history yet`,
        history_neutral: $localize`:@@candidateFlag.neutral:Not enough history — the policy's neutral value was used`,
        subcontractor_inactive: $localize`:@@candidateFlag.inactive:Inactive in the directory`,
      } as Record<string, string>
    )[flag] ?? flag
  );
}

/** CF-021 / CF-022 (ADR-127): the history rule a recommendation was computed with, in words. */
export function historyRuleLabel(
  rule: string | undefined,
  neutral: number | null | undefined,
): string {
  switch (rule) {
    case 'partial-v2':
      return $localize`:@@historyRule.partial:History rule: partial (v2) — firms with at least 2 finalized closeouts are weighed on score rule v3; the others receive the neutral value ${String(neutral ?? 50)}:neutral:.`;
    case 'all-or-nothing-v1.1':
      return $localize`:@@historyRule.allOrNothing:History rule: all or nothing (v1.1) — history counts only when every eligible firm has at least 2 finalized closeouts.`;
    default:
      return $localize`:@@historyRule.legacy:History rule: all or nothing (v1) — computed before the minimum of 2 finalized closeouts applied.`;
  }
}

export function timelineLabel(kind: string, number: number | null, step: number | null): string {
  const n = String(number ?? '');
  switch (kind) {
    case 'recommendation_computed':
      return $localize`:@@timeline.computed:Recommendation ${ltr(n)}:number: computed`;
    case 'decision_submitted':
      return $localize`:@@timeline.submitted:Decision version ${ltr(n)}:number: submitted for approval`;
    case 'approved':
      return $localize`:@@timeline.approved:Version ${ltr(n)}:number: approved (step ${ltr(String(step ?? ''))}:step:)`;
    case 'returned':
      return $localize`:@@timeline.returned:Version ${ltr(n)}:number: returned for changes`;
    case 'rejected':
      return $localize`:@@timeline.rejected:Version ${ltr(n)}:number: rejected by an approver`;
    case 'withdrawn':
      return $localize`:@@timeline.withdrawn:Version ${ltr(n)}:number: withdrawn`;
    case 'awarded':
      return $localize`:@@timeline.awarded:Award issued (version ${ltr(n)}:number:)`;
    default:
      return kind;
  }
}

/** Why a round cannot be issued now: the problem code the server would answer, in words. */
export function issueBlockerLabel(code: string | null, reason: string | null): string {
  if (!code) return '';
  return (
    knownProductProblem({ code, parameters: reason ? { reason } : undefined }) ??
    $localize`:@@negotiation.blockedGeneric:A round cannot be issued now.`
  );
}

export function candidateBlockerLabel(blocker: string | null): string {
  return blocker === 'invitation_revoked'
    ? $localize`:@@negotiation.candidateRevoked:The firm's invitation was revoked; it cannot be asked to revise.`
    : $localize`:@@negotiation.candidateBlocked:Cannot be included in a round.`;
}

/** CF-038: why a decision stands with fewer compliant bids than the company requires. */
export function competitionJustificationLabel(
  category: CompetitionJustification | string | null,
): string {
  switch (category) {
    case 'SoleCapableFirm':
      return $localize`:@@competition.soleCapable:Only these firms can do the work`;
    case 'Urgency':
      return $localize`:@@competition.urgency:Urgency does not allow re-tendering`;
    case 'OnlyResponsiveBid':
      return $localize`:@@competition.onlyResponsive:Other invited firms did not respond or were not compliant`;
    default:
      return $localize`:@@competition.other:Another reason (explained below)`;
  }
}

/** CF-039: where a bid's validity stands now. Words and a mark, never colour alone. */
export function validityStateLabel(state: BidValidityState | string): string {
  switch (state) {
    case 'Valid':
      return $localize`:@@validity.valid:Valid`;
    case 'LapsingSoon':
      return $localize`:@@validity.lapsingSoon:Lapses within 7 days`;
    case 'Lapsed':
      return $localize`:@@validity.lapsed:Lapsed`;
    default:
      return $localize`:@@validity.notStated:No validity stated`;
  }
}

export function validityBasisLabel(basis: string): string {
  return basis === 'RevisionSubmission'
    ? $localize`:@@validity.basisRevision:from the submission of the revision in force`
    : $localize`:@@validity.basisDeadline:from the submission deadline (or the round's response deadline)`;
}

export function validityChannelLabel(channel: ValidityConfirmationChannel | string): string {
  switch (channel) {
    case 'Letter':
      return $localize`:@@validityChannel.letter:Signed letter`;
    case 'Email':
      return $localize`:@@validityChannel.email:Email from the bidder`;
    default:
      return $localize`:@@validityChannel.other:Other written confirmation`;
  }
}

/** CF-044: the firm's directory standing now. */
export function standingLabel(standing: string): string {
  switch (standing) {
    case 'Active':
      return $localize`:@@standing.active:Active`;
    case 'Blocked':
      return $localize`:@@standing.blocked:Blocked — must not be engaged`;
    default:
      return $localize`:@@standing.inactive:Inactive`;
  }
}

/** CF-046 (ADR-110): where an award stands. */
export function awardStateLabel(state: string | undefined): string {
  switch (state) {
    case 'AwaitingResponse':
      return $localize`:@@awardState.awaiting:Awaiting the subcontractor's answer`;
    case 'Accepted':
      return $localize`:@@awardState.accepted:Accepted by the subcontractor`;
    case 'Declined':
      return $localize`:@@awardState.declined:Declined by the subcontractor`;
    case 'WithdrawalPending':
      return $localize`:@@awardState.withdrawalPending:Withdrawal awaiting approval`;
    case 'Withdrawn':
      return $localize`:@@awardState.withdrawn:Withdrawn`;
    default:
      return $localize`:@@awardState.notRecorded:Issued (answer not recorded)`;
  }
}

export function declineReasonLabel(reason: string | null): string {
  return (
    (
      {
        Price: $localize`:@@declineReason.price:Price`,
        Capacity: $localize`:@@declineReason.capacity:Capacity`,
        Terms: $localize`:@@declineReason.terms:Contract terms`,
        Programme: $localize`:@@declineReason.programme:Programme`,
        NoResponse: $localize`:@@declineReason.noResponse:No response within the time given`,
        Other: $localize`:@@declineReason.other:Other`,
      } as Record<string, string>
    )[reason ?? ''] ?? '—'
  );
}

export function withdrawalReasonLabel(reason: string | null): string {
  return (
    (
      {
        FailureToSign: $localize`:@@withdrawalReason.sign:Did not sign the contract`,
        FailureToMobilize: $localize`:@@withdrawalReason.mobilize:Did not mobilize`,
        ClientRejection: $localize`:@@withdrawalReason.client:Rejected by the client`,
        Other: $localize`:@@withdrawalReason.other:Other`,
      } as Record<string, string>
    )[reason ?? ''] ?? '—'
  );
}
