import { HttpErrorResponse } from '@angular/common/http';
import {
  bidFieldLabel,
  directoryFieldLabel,
  featureLabel,
  invitationStatusLabel,
  lifecycleStatusLabel,
  ltr,
  prequalificationResultLabel,
  questionsClosedLabel,
  quotaLabel,
  scheduleFieldLabel,
  sourcingFieldLabel,
  subcontractorStatusLabel,
  tenderFieldLabel,
  tenderFieldList,
} from './labels';
import { tenantRoleLabel } from '../auth/tenant-role-labels';

/** Additive ProblemDetails extensions for reviewed product outcomes. */
export interface ProductProblem {
  readonly code?: string;
  readonly parameters?: Readonly<Record<string, string | number>>;
  /** Reviewed English detail; shown only by the English build when no code is known. */
  readonly detail?: string;
}

type Parameters = Readonly<Record<string, string | number>>;
const text = (parameters: Parameters | undefined, key: string): string =>
  String(parameters?.[key] ?? '');
/** A byte limit shown in whole megabytes, e.g. 2097152 → 2. */
const megabytes = (parameters: Parameters | undefined, key: string): string =>
  String(Math.round(Number(parameters?.[key] ?? 0) / 1_048_576));
const status = (parameters: Parameters | undefined, key: string): string =>
  lifecycleStatusLabel(text(parameters, key));

/**
 * The only mapping from a stable code to user-facing text. Server text never becomes a message ID,
 * and parameters are rendered through the same label catalogues the rest of the UI uses.
 */
const MESSAGES: Record<string, (p: Parameters | undefined) => string> = {
  'validation.required': () =>
    $localize`:@@problem.validationRequired:Complete the required fields.`,
  'project.status_unchanged': (p) =>
    $localize`:@@problem.projectStatusUnchanged:The project is already ${status(p, 'status')}:status:.`,
  'project.transition_not_allowed': (p) =>
    $localize`:@@problem.projectTransition:A project cannot move from ${status(p, 'from')}:from: to ${status(p, 'to')}:to:.`,
  'project.closure_blocked_by_live_scope': (p) =>
    $localize`:@@problem.projectLiveScope:This project still has active or on-hold work packages. Complete or cancel them before marking it ${status(p, 'status')}:status:.`,
  'project.closed_read_only': (p) =>
    $localize`:@@problem.projectReadOnly:A ${status(p, 'status')}:status: project can no longer be edited.`,
  'project.code_taken': (p) =>
    $localize`:@@problem.projectCodeTaken:Project code ${text(p, 'code')}:code: is already used in this company.`,
  'project.name_required': () => $localize`:@@projectForm.nameError:A project name is required.`,
  'project.code_invalid': (p) =>
    $localize`:@@problem.projectCodeInvalid:Use 2–${text(p, 'max')}:max: letters, digits, dash, underscore or slash for the project code.`,
  'project.currency_invalid': () =>
    $localize`:@@problem.currencyInvalid:Use a three-letter ISO currency code, for example EGP, USD or AED.`,
  'project.currency_required': () =>
    $localize`:@@problem.projectCurrencyRequired:Choose the project's currency.`,
  'project.currency_locked': (p) =>
    text(p, 'reason') === 'tenders'
      ? $localize`:@@problem.projectCurrencyLockedTenders:The currency cannot change: a tender of this project has asked bidders for prices in ${ltr(text(p, 'currency'))}:currency:.`
      : $localize`:@@problem.projectCurrencyLockedEstimates:The currency cannot change while work-package estimates are recorded in ${ltr(text(p, 'currency'))}:currency:. Remove the estimates first.`,
  'company.currency_invalid': () =>
    $localize`:@@problem.companyCurrencyInvalid:Choose a currency from the ISO 4217 list, for example QAR, SAR, EGP or USD.`,
  'company.logo_invalid': (p) =>
    $localize`:@@problem.companyLogoInvalid:Use a PNG or JPEG image of at most ${String(Math.round(Number(p?.['maxBytes'] ?? 0) / 1024))}:kilobytes: KB and ${text(p, 'maxPixels')}:pixels: pixels on each side.`,
  'bid.not_started': () => $localize`:@@problem.bidNotStarted:Start (or resume) your bid first.`,
  'bid.already_submitted': () =>
    $localize`:@@problem.bidAlreadySubmitted:This bid has already been submitted. Reload to see the submission; contact the buyer if you need to change it.`,
  'bid.draft_stale': () =>
    $localize`:@@problem.bidDraftStale:Your bid was changed in another tab or on another device. Reload to continue with the latest version.`,
  'bid.deadline_passed': () =>
    $localize`:@@problem.bidDeadlinePassed:The submission deadline has passed. Your saved draft is kept, but it can no longer be changed or submitted.`,
  'bid.amount_invalid': (p) =>
    $localize`:@@problem.bidAmountInvalid:${bidFieldLabel(text(p, 'field'))}:field: must be a positive amount in ${ltr(text(p, 'currency'))}:currency: with at most ${text(p, 'decimals')}:decimals: decimal places, below one trillion.`,
  'bid.field_invalid': (p) =>
    p?.['min'] !== undefined
      ? $localize`:@@problem.bidFieldRange:${bidFieldLabel(text(p, 'field'))}:field: must be between ${text(p, 'min')}:min: and ${text(p, 'max')}:max:.`
      : p?.['max'] !== undefined
        ? $localize`:@@problem.bidFieldTooLong:${bidFieldLabel(text(p, 'field'))}:field: is too long (at most ${text(p, 'max')}:max: characters) or contains characters that are not allowed.`
        : $localize`:@@problem.bidFieldInvalid:${bidFieldLabel(text(p, 'field'))}:field: is not valid.`,
  'bid.list_too_long': (p) =>
    $localize`:@@problem.bidListTooLong:${bidFieldLabel(text(p, 'field'))}:field: can hold at most ${text(p, 'max')}:max: entries.`,
  'bid.incomplete': () =>
    $localize`:@@problem.bidIncomplete:Complete the bid before submitting it. The review lists what is missing.`,
  'bid.confirmation_required': () =>
    $localize`:@@problem.bidConfirmation:Confirm that you want to submit the bid.`,
  'bid.attachment_limit': (p) =>
    $localize`:@@problem.bidAttachmentLimit:A bid can hold at most ${text(p, 'max')}:max: files. Remove one first.`,
  'bid.attachment_total_too_large': (p) =>
    $localize`:@@problem.bidAttachmentTotal:The bid's files would exceed ${megabytes(p, 'maxBytes')}:megabytes: MB in total.`,
  'bid.attachment_requirement_unknown': () =>
    $localize`:@@problem.bidAttachmentRequirement:Choose one of the documents the tender asks for, or "Other supporting file".`,
  'bid.acknowledgement_required': (p) =>
    $localize`:@@problem.bidAcknowledgementRequired:Acknowledge the tender's addenda before submitting your bid. Still to acknowledge: ${ltr(text(p, 'addenda').replaceAll(',', ', '))}:addenda:.`,
  'bid.tender_closed': () =>
    $localize`:@@problem.bidTenderClosed:The buyer closed this tender. Your saved work is kept, but nothing can be submitted or changed any more.`,
  'bid.tender_revision_changed': (p) =>
    $localize`:@@problem.bidTenderRevisionChanged:The tender was updated (now revision ${text(p, 'revision')}:revision:) while you were reviewing. Review the changes, then submit again.`,
  'clarification.questions_closed': (p) => questionsClosedLabel(text(p, 'reason')),
  'clarification.question_invalid': (p) =>
    $localize`:@@problem.clarificationQuestionInvalid:Write your question in at most ${text(p, 'max')}:max: characters, without special control characters.`,
  'clarification.question_limit': (p) =>
    $localize`:@@problem.clarificationQuestionLimit:No more questions can be asked through this invitation (at most ${text(p, 'max')}:max:). Contact the buyer directly.`,
  'clarification.answer_invalid': (p) =>
    $localize`:@@problem.clarificationAnswerInvalid:Write the answer in at most ${text(p, 'max')}:max: characters, without special control characters.`,
  'clarification.visibility_required': () =>
    $localize`:@@problem.clarificationVisibilityRequired:Choose whether the answer goes to this firm only or is published to all bidders.`,
  'clarification.already_answered': (p) =>
    $localize`:@@problem.clarificationAlreadyAnswered:${ltr(text(p, 'reference'))}:reference: has already been answered. An answer is final; issue an addendum to correct it.`,
  'clarification.not_answered': (p) =>
    $localize`:@@problem.clarificationNotAnswered:Answer ${ltr(text(p, 'reference'))}:reference: before publishing it.`,
  'clarification.already_published': (p) =>
    $localize`:@@problem.clarificationAlreadyPublished:${ltr(text(p, 'reference'))}:reference: is already published to all bidders.`,
  'addendum.draft_exists': () =>
    $localize`:@@problem.addendumDraftExists:An addendum is already being prepared for this tender. Continue it, or discard it first.`,
  'addendum.not_draft': () =>
    $localize`:@@problem.addendumNotDraft:This addendum has been issued (or discarded) and can no longer be changed. Issue another addendum to correct it.`,
  'addendum.incomplete': (p) =>
    $localize`:@@problem.addendumIncomplete:Complete the addendum before issuing it: ${tenderFieldList(text(p, 'fields'), $localize.locale ?? 'en')}:fields:.`,
  'addendum.deadline_required': (p) =>
    $localize`:@@problem.addendumDeadlineRequired:The submission deadline has passed or is less than ${text(p, 'hours')}:hours: hour(s) away. Set a new, later deadline in the addendum so bidders have time to act on it.`,
  'addendum.document_unknown': () =>
    $localize`:@@problem.addendumDocumentUnknown:Choose a document of the current tender revision to replace or withdraw (each at most once).`,
  'addendum.document_limit': (p) =>
    $localize`:@@problem.addendumDocumentLimit:An addendum or tender revision can hold at most ${text(p, 'max')}:max: documents.`,
  'tender.extension_not_later': () =>
    $localize`:@@problem.tenderExtensionNotLater:The new deadline must be later than the current deadline. A deadline is never moved earlier.`,
  'tender.extension_questions_invalid': () =>
    $localize`:@@problem.tenderExtensionQuestionsInvalid:The questions deadline must be in the future, before the submission deadline, and not earlier than the one bidders were given.`,
  // Part 9: tender close, bid opening and evaluation.
  'tender.already_closed': () =>
    $localize`:@@problem.tenderAlreadyClosed:This tender is already closed. Reload to see how and when it closed.`,
  'tender.close_confirmation_required': () =>
    $localize`:@@problem.tenderCloseConfirmationRequired:Confirm that you want to close the tender early.`,
  'tender.close_counts_changed': (p) =>
    $localize`:@@problem.tenderCloseCountsChanged:A firm's status changed while you were deciding: ${text(p, 'submitted')}:submitted: submitted and ${text(p, 'notSubmitted')}:notSubmitted: not submitted now. Review the numbers and confirm again.`,
  'tender.close_no_submissions': () =>
    $localize`:@@problem.tenderCloseNoSubmissions:No bid has been submitted, so the tender cannot be closed early. Cancel it instead if it should end now.`,
  'tender.closed_early': () =>
    $localize`:@@problem.tenderClosedEarly:The tender was closed early. It can no longer be changed or reopened.`,
  'tender.bids_opened': () =>
    $localize`:@@problem.tenderBidsOpened:The bids have been opened. The tender can no longer be changed.`,
  'opening.tender_not_closed': () =>
    $localize`:@@problem.openingTenderNotClosed:The tender is still open. Bids can be opened after its deadline, or after it is closed early.`,
  'opening.no_submissions': () =>
    $localize`:@@problem.openingNoSubmissions:No firm submitted a bid, so there is nothing to open.`,
  'opening.already_opened': () =>
    $localize`:@@problem.openingAlreadyOpened:The bids of this tender were already opened.`,
  'opening.confirmation_required': () =>
    $localize`:@@problem.openingConfirmationRequired:Confirm that you want to open the bids.`,
  'opening.not_opened': () =>
    $localize`:@@problem.openingNotOpened:The bids of this tender have not been opened yet.`,
  'opening.inconsistent': () =>
    $localize`:@@problem.openingInconsistent:The submitted bids do not match the tender's close, so nothing was opened. Contact support.`,
  'opening.classification_restricted': () =>
    $localize`:@@problem.openingClassificationRestricted:Choose technical or commercial for this file.`,
  'evaluation.policy_invalid': () =>
    $localize`:@@problem.evaluationPolicyInvalid:Check the policy: a scale of 5, 10 or 100 and 1–30 criteria with their own names and categories.`,
  'evaluation.policy_weights_invalid': (p) =>
    p?.['total'] !== undefined
      ? $localize`:@@problem.evaluationPolicyWeightsTotal:The weights must add up to exactly 100 (now ${ltr(text(p, 'total'))}:total:).`
      : $localize`:@@problem.evaluationPolicyWeightsInvalid:Each weight is a percentage above 0 with at most two decimals, and together they add up to 100.`,
  'evaluation.policy_name_taken': () =>
    $localize`:@@problem.evaluationPolicyNameTaken:Another policy already has this name.`,
  'evaluation.policy_inactive': () =>
    $localize`:@@problem.evaluationPolicyInactive:Choose an active policy.`,
  'evaluation.policy_locked': () =>
    $localize`:@@problem.evaluationPolicyLocked:Scoring has started against this policy version, so it can no longer change.`,
  'evaluation.not_started': () =>
    $localize`:@@problem.evaluationNotStarted:Choose the evaluation policy first.`,
  'evaluation.completed': () =>
    $localize`:@@problem.evaluationCompleted:The evaluation is complete. Reopen it (with a reason) to change it.`,
  'evaluation.not_completed': () =>
    $localize`:@@problem.evaluationNotCompleted:The evaluation is not complete.`,
  'evaluation.incomplete': (p) =>
    $localize`:@@problem.evaluationIncomplete:The evaluation is not complete yet (${text(p, 'count')}:count: open items). See what is still needed.`,
  'evaluation.tender_cancelled': () =>
    $localize`:@@problem.evaluationTenderCancelled:The tender was cancelled. Its evaluation is kept read-only.`,
  'evaluation.score_invalid': (p) =>
    p?.['max'] !== undefined
      ? $localize`:@@problem.evaluationScoreRange:A score is a number from 0 to ${text(p, 'max')}:max: with at most one decimal.`
      : $localize`:@@problem.evaluationScoreInvalid:Score each criterion of the evaluation's policy once.`,
  'evaluation.scorecard_incomplete': () =>
    $localize`:@@problem.evaluationScorecardIncomplete:Score every criterion and add the comments and evidence the policy requires before submitting.`,
  'evaluation.scorecard_submitted': () =>
    $localize`:@@problem.evaluationScorecardSubmitted:This scorecard was submitted. Reopen it to correct it; the submitted version is kept.`,
  'evaluation.scorecard_not_submitted': () =>
    $localize`:@@problem.evaluationScorecardNotSubmitted:This scorecard has not been submitted.`,
  'evaluation.blind_scoring_required': () =>
    $localize`:@@problem.evaluationBlindScoringRequired:This evaluation's policy requires technical scoring by evaluators who cannot see prices.`,
  'evaluation.text_invalid': (p) =>
    $localize`:@@problem.evaluationTextInvalid:Check the text: it is missing, longer than ${text(p, 'max')}:max: characters or contains characters that are not allowed.`,
  'evaluation.adjustment_invalid': (p) =>
    text(p, 'field') === 'linePosition'
      ? $localize`:@@problem.evaluationAdjustmentLine:Choose one of the bidder's lines that has no active adjustment (withdraw the existing one first).`
      : text(p, 'field') === 'total'
        ? $localize`:@@problem.evaluationAdjustmentTotal:The adjustment would make the leveled total negative or out of range.`
        : $localize`:@@problem.evaluationAdjustmentInvalid:Enter the amount as a plain number with the currency's decimal places, different from the submitted value.`,
  'evaluation.adjustment_withdrawn': () =>
    $localize`:@@problem.evaluationAdjustmentWithdrawn:This adjustment was already withdrawn.`,
  'evaluation.leveling_completed': () =>
    $localize`:@@problem.evaluationLevelingCompleted:Commercial leveling was marked complete. Reopen it to change it.`,
  'evaluation.leveling_not_completed': () =>
    $localize`:@@problem.evaluationLevelingNotCompleted:Commercial leveling is not complete.`,
  'evaluation.threshold_invalid': (p) =>
    $localize`:@@problem.evaluationThresholdInvalid:Thresholds are whole percentages from 1 to ${text(p, 'max')}:max:.`,
  // Part 10: negotiation / BAFO rounds, recommendation, decision, approval and award.
  'evaluation.round_current': () =>
    $localize`:@@problem.evaluationRoundCurrent:The evaluation already covers the latest closed round.`,
  'evaluation.negotiation_open': () =>
    $localize`:@@problem.evaluationNegotiationOpen:A negotiation round is still open. Its responses can be taken in once it is closed.`,
  'evaluation.tender_awarded': () =>
    $localize`:@@problem.evaluationTenderAwarded:The tender was awarded. Its evaluation evidence is frozen and read-only.`,
  'negotiation.not_ready': (p) =>
    text(p, 'reason') === 'evaluation_refresh_required'
      ? $localize`:@@problem.negotiationNotReadyRefresh:Take the last round's responses into the evaluation and complete it again before issuing another round.`
      : $localize`:@@problem.negotiationNotReady:Complete the evaluation first: a round is issued on completed evaluation evidence.`,
  'negotiation.round_open': () =>
    $localize`:@@problem.negotiationRoundOpen:A round is already open. Close or cancel it before issuing another.`,
  'negotiation.round_limit': () =>
    $localize`:@@problem.negotiationRoundLimit:This tender has reached the maximum number of negotiation rounds.`,
  'negotiation.participants_invalid': (p) =>
    p?.['code'] !== undefined
      ? $localize`:@@problem.negotiationParticipantRevoked:The invitation of ${ltr(text(p, 'code'))}:code: was revoked, so the firm cannot be included.`
      : $localize`:@@problem.negotiationParticipantsInvalid:Choose at least one firm whose bid was opened, each once.`,
  'negotiation.deadline_invalid': (p) =>
    $localize`:@@problem.negotiationDeadlineInvalid:Choose a response deadline in the tender's time zone within the allowed window (hours from now, at least: ${text(p, 'hours')}:hours:; days from now, at most: ${text(p, 'days')}:days:).`,
  'negotiation.confirmation_required': () =>
    $localize`:@@problem.negotiationConfirmationRequired:Confirm that you want to issue the round to the selected firms.`,
  'negotiation.round_not_open': () =>
    $localize`:@@problem.negotiationRoundNotOpen:This round is no longer open. Reload to see its current state.`,
  'negotiation.text_invalid': (p) =>
    $localize`:@@problem.negotiationTextInvalid:${negotiationFieldLabel(text(p, 'field'))}:field: is missing, longer than ${text(p, 'max')}:max: characters or contains characters that are not allowed.`,
  'negotiation.response_closed': (p) => {
    switch (text(p, 'reason')) {
      case 'deadline_passed':
        return $localize`:@@problem.negotiationClosedDeadline:The response deadline of this round has passed. Your saved work is kept, but it can no longer be changed or submitted.`;
      case 'cancelled':
        return $localize`:@@problem.negotiationClosedCancelled:The buyer cancelled this round. No response is needed.`;
      case 'withdrawn':
        return $localize`:@@problem.negotiationClosedWithdrawn:The buyer removed your firm from this round. Your earlier submission stays as it was.`;
      default:
        return $localize`:@@problem.negotiationClosed:This round no longer accepts responses.`;
    }
  },
  'negotiation.not_started': () =>
    $localize`:@@problem.negotiationNotStarted:Start your revised response first.`,
  'negotiation.already_submitted': () =>
    $localize`:@@problem.negotiationAlreadySubmitted:Your response to this round was already submitted. Reload to see the receipt.`,
  'negotiation.participant_withdrawn': () =>
    $localize`:@@problem.negotiationParticipantWithdrawn:This firm was already removed from the round.`,
  'recommendation.policy_invalid': (p) =>
    $localize`:@@problem.recommendationPolicyInvalid:Check the recommendation policy: ${policyFieldLabel(text(p, 'field'))}:field:.`,
  'recommendation.policy_weights_invalid': (p) =>
    p?.['total'] !== undefined
      ? $localize`:@@problem.recommendationWeightsTotal:The weights must add up to exactly 100 (now ${ltr(text(p, 'total'))}:total:).`
      : $localize`:@@problem.recommendationWeightsInvalid:Each weight is a percentage above 0 with at most two decimals.`,
  'recommendation.policy_name_taken': () =>
    $localize`:@@problem.recommendationPolicyNameTaken:Another recommendation policy already has this name.`,
  'recommendation.policy_inactive': () =>
    $localize`:@@problem.recommendationPolicyInactive:Choose an active recommendation policy.`,
  'recommendation.not_ready': (p) => {
    switch (text(p, 'reason')) {
      case 'NotOpened':
        return $localize`:@@problem.recommendationNotOpened:The bids have not been opened, so there is nothing to recommend yet.`;
      case 'RefreshRequired':
        return $localize`:@@problem.recommendationRefreshRequired:A closed round's responses are not in the evaluation yet. Take them in and complete the evaluation first.`;
      case 'NegotiationOpen':
        return $localize`:@@problem.recommendationNegotiationOpen:A negotiation round is open. Close or cancel it before computing a recommendation.`;
      case 'TenderCancelled':
        return $localize`:@@problem.recommendationTenderCancelled:The tender was cancelled. No recommendation is computed.`;
      case 'Awarded':
        return $localize`:@@problem.recommendationAwarded:The tender was already awarded.`;
      default:
        return $localize`:@@problem.recommendationMissingEvaluation:Complete the evaluation before computing a recommendation.`;
    }
  },
  'recommendation.stale': (p) =>
    $localize`:@@problem.recommendationStale:The recommendation is no longer current (${recommendationStaleText(text(p, 'reason'))}:reason:). Compute it again before continuing.`,
  'recommendation.not_computed': () =>
    $localize`:@@problem.recommendationNotComputed:Compute a recommendation first.`,
  'decision.invalid': (p) =>
    $localize`:@@problem.decisionInvalid:Check the decision: ${decisionFieldLabel(text(p, 'field'))}:field: is missing or not valid.`,
  'decision.override_reason_required': (p) =>
    $localize`:@@problem.decisionOverrideReasonRequired:You propose a firm that is not ranked first by the recommendation. Explain why (${text(p, 'min')}:min:–${text(p, 'max')}:max: characters).`,
  'decision.value_reason_required': (p) =>
    $localize`:@@problem.decisionValueReasonRequired:The award value differs from the proposed bid's leveled total. Explain why (${text(p, 'min')}:min:–${text(p, 'max')}:max: characters).`,
  'decision.bidder_not_eligible': (p) =>
    $localize`:@@problem.decisionBidderNotEligible:${ltr(text(p, 'code'))}:code: is not eligible under the recommendation's policy, so it cannot be proposed or kept in reserve.`,
  'decision.not_draft': () =>
    $localize`:@@problem.decisionNotDraft:The decision is no longer a draft. Reload to see where it stands.`,
  'decision.not_pending': () =>
    $localize`:@@problem.decisionNotPending:The decision is not awaiting approval. Reload to see where it stands.`,
  'decision.not_approved': () =>
    $localize`:@@problem.decisionNotApproved:The decision is not fully approved, so the award cannot be issued yet.`,
  'decision.self_approval_not_allowed': () =>
    $localize`:@@problem.decisionSelfApproval:You submitted this decision (or already approved a step of it). Another approver must act on it.`,
  'decision.withdraw_submitter_only': () =>
    $localize`:@@problem.decisionWithdrawSubmitterOnly:Only the person who submitted this decision, or an approval-matrix manager, can withdraw it.`,
  'decision.approver_role_required': (p) =>
    $localize`:@@problem.decisionApproverRole:Approval step ${ltr(text(p, 'step'))}:step: needs an approver with the role ${tenantRoleLabel(text(p, 'role'))}:role:.`,
  'decision.submitter_cannot_send_back': () =>
    $localize`:@@problem.decisionSubmitterSendBack:You submitted this decision. Withdraw it to change it; returning and rejecting are for approvers.`,
  'decision.no_director_available': (p) =>
    $localize`:@@problem.decisionNoDirector:No active member other than you holds the role ${tenantRoleLabel(text(p, 'role'))}:role: that this approval route needs. Ask your Company Admin to assign it.`,
  'decision.competition_reason_required': (p) =>
    text(p, 'field') === 'competitionCategory'
      ? $localize`:@@problem.decisionCompetitionCategory:Fewer compliant bids than your company requires: choose why the decision stands with limited competition.`
      : $localize`:@@problem.decisionCompetitionReason:Fewer compliant bids than your company requires: explain why the decision stands with limited competition (at least 3 characters).`,
  'decision.over_budget_reason_required': () =>
    $localize`:@@problem.decisionOverBudgetReason:The award value is above the package estimate beyond your company's tolerance. Explain why (at least 3 characters); an Approver/Director approves it.`,
  'decision.subcontractor_blocked': (p) =>
    $localize`:@@problem.decisionSubcontractorBlocked:${ltr(text(p, 'subcontractorCode'))}:code: is blocked in the directory and must not be engaged. It cannot be proposed or approved; withdraw the decision and compute the recommendation again.`,
  'award.subcontractor_blocked': (p) =>
    $localize`:@@problem.awardSubcontractorBlocked:${ltr(text(p, 'subcontractorCode'))}:code: is blocked in the directory and must not be engaged, so the award cannot be issued. Withdraw the decision and compute the recommendation again.`,
  'award.validity_confirmation_required': (p) =>
    text(p, 'field') === 'extendedUntil'
      ? $localize`:@@problem.awardValidityExtendedUntil:The extended validity must run until today or later.`
      : text(p, 'field') === 'channel'
        ? $localize`:@@problem.awardValidityChannel:Say how the bidder confirmed the extension.`
        : $localize`:@@problem.awardValidityRequired:The proposed bid's validity has lapsed. Record the bidder's written extension to issue the award.`,
  'approval_rule.weakening_unconfirmed': () =>
    $localize`:@@problem.approvalRuleWeakening:A rule without an independent approval needs your explicit confirmation and the reason your company accepts it.`,
  'decision.confirmation_required': () =>
    $localize`:@@problem.decisionConfirmationRequired:Confirm that you want to submit the decision for approval.`,
  'approval_rule.invalid': (p) =>
    $localize`:@@problem.approvalRuleInvalid:Check the approval rule: ${approvalRuleFieldLabel(text(p, 'field'))}:field: is missing or not valid.`,
  'approval_rule.name_taken': () =>
    $localize`:@@problem.approvalRuleNameTaken:Another approval rule already has this name.`,
  // Red-team Y: the name "default" is kept for the route used when no rule matches (parameter `name`, not shown).
  'approval_rule.name_reserved': () =>
    $localize`:@@problem.approvalRuleNameReserved:The name “default” is reserved for the route used when no rule matches.`,
  'award.already_awarded': () =>
    $localize`:@@problem.awardAlreadyAwarded:The award for this tender was already issued. Reload to see it.`,
  'award.confirmation_required': () =>
    $localize`:@@problem.awardConfirmationRequired:Confirm that you want to issue the award.`,
  'tender.awarded_read_only': () =>
    $localize`:@@problem.tenderAwardedReadOnly:The tender was awarded. It can no longer be changed.`,
  'performance.invalid': (p) =>
    $localize`:@@problem.performanceInvalid:Check the closeout: ${performanceFieldLabel(text(p, 'field'))}:field: is missing, out of range or not valid.`,
  'performance.reason_required': (p) =>
    $localize`:@@problem.performanceReasonRequired:Explain the correction (${text(p, 'min')}:min:–${text(p, 'max')}:max: characters).`,
  'performance.incomplete': () =>
    $localize`:@@problem.performanceIncomplete:The closeout is not complete yet. Record every required item before closing it.`,
  'performance.already_closed': () =>
    $localize`:@@problem.performanceAlreadyClosed:This closeout was already closed. Reload to see it.`,
  'performance.not_closed': () =>
    $localize`:@@problem.performanceNotClosed:Only a closed closeout can be reopened.`,
  'performance.closed_read_only': () =>
    $localize`:@@problem.performanceClosedReadOnly:This closeout is closed and can no longer be edited. Reopen it with a reason to correct it.`,
  'performance.section_stale': () =>
    $localize`:@@problem.performanceSectionStale:Someone saved this part of the closeout since you opened it. Reload, check their changes and save again.`,
  'performance.baseline_unverified': () =>
    $localize`:@@problem.performanceBaselineUnverified:The award baseline no longer matches its fingerprint, so this closeout cannot be closed. Contact support.`,
  'performance.confirmation_required': () =>
    $localize`:@@problem.performanceConfirmationRequired:Confirm the action before continuing.`,
  'project.expected_end_before_start': () =>
    $localize`:@@problem.expectedEndBeforeStart:The expected end date cannot be before the start date.`,
  'project.actual_end_before_start': () =>
    $localize`:@@problem.actualEndBeforeStart:The actual end date cannot be before the project start date.`,
  'project.actual_end_requires_closure': () =>
    $localize`:@@problem.actualEndRequiresClosure:An actual end date applies only once the project is completed or cancelled.`,
  'project.responsible_not_member': (p) =>
    text(p, 'field') === 'procurementOwner'
      ? $localize`:@@problem.ownerNotMember:The procurement owner must be an active member of this company.`
      : $localize`:@@problem.managerNotMember:The project manager must be an active member of this company.`,
  'work_package.status_unchanged': (p) =>
    $localize`:@@problem.packageStatusUnchanged:The work package is already ${status(p, 'status')}:status:.`,
  'work_package.transition_not_allowed': (p) =>
    $localize`:@@problem.packageTransition:A work package cannot move from ${status(p, 'from')}:from: to ${status(p, 'to')}:to:.`,
  'work_package.requires_live_project': (p) =>
    $localize`:@@problem.packageRequiresLiveProject:A work package cannot become ${status(p, 'status')}:status: while its project is ${status(p, 'projectStatus')}:projectStatus:. Activate the project first.`,
  'work_package.project_closed': (p) =>
    $localize`:@@problem.packageProjectClosed:Work packages cannot be added to a ${status(p, 'projectStatus')}:projectStatus: project.`,
  'work_package.closed_read_only': (p) =>
    $localize`:@@problem.packageReadOnly:A ${status(p, 'status')}:status: work package can no longer be edited.`,
  'work_package.project_read_only': (p) =>
    $localize`:@@problem.packageProjectReadOnly:Work packages in a ${status(p, 'projectStatus')}:projectStatus: project can no longer be edited.`,
  'work_package.code_taken': (p) =>
    $localize`:@@problem.packageCodeTaken:Work package code ${text(p, 'code')}:code: is already used in this project.`,
  'work_package.title_required': () => $localize`:@@packageForm.titleError:A title is required.`,
  'work_package.code_invalid': (p) =>
    $localize`:@@problem.packageCodeInvalid:Use 2–${text(p, 'max')}:max: letters, digits, dash, underscore or slash for the package code.`,
  'work_package.planned_end_before_start': () =>
    $localize`:@@problem.plannedEndBeforeStart:The planned end date cannot be before the planned start date.`,
  'work_package.value_negative': () =>
    $localize`:@@problem.valueNegative:An estimated value cannot be negative.`,
  'work_package.value_too_large': () =>
    $localize`:@@problem.valueTooLarge:The estimated value is larger than the system supports.`,
  'work_package.live_tender': (p) =>
    $localize`:@@problem.packageLiveTender:Tender ${ltr(text(p, 'reference'))}:reference: on this work package is still live. Cancel the tender first, then close the work package.`,
  'work_package.award_in_force': (p) =>
    $localize`:@@problem.packageAwardInForce:Tender ${ltr(text(p, 'reference'))}:reference: on this work package has an award in force. Withdraw the award first; the package can then be cancelled or tendered again.`,
  'sourcing.tender_past_invitation': (p) =>
    $localize`:@@problem.sourcingTenderPastInvitation:Tender ${ltr(text(p, 'reference'))}:reference: invited bidders from this shortlist and its invitations are closed, so the shortlist stays as the record of who was invited.`,
  'procurement.scope_closed': () =>
    $localize`:@@problem.scopeClosed:The work package was completed or cancelled, so it is no longer procured.`,
  'work_package.value_precision': (p) =>
    $localize`:@@problem.valuePrecision:Enter the estimated value as a plain number with at most ${text(p, 'decimals')}:decimals: decimal places.`,
  'evaluation.vat_basis_unresolved': () =>
    $localize`:@@problem.evaluationVatUnresolved:A bid is priced on another VAT basis. Record a VAT-basis adjustment for it before completing leveling.`,
  'award.response_invalid': (p) =>
    $localize`:@@problem.awardResponseInvalid:Check the answer: ${text(p, 'field')}:field: is missing or not allowed (the date must be on or after the award and not in the future).`,
  'award.outcome_already_recorded': () =>
    $localize`:@@problem.awardOutcomeRecorded:The award already has its answer, or its withdrawal is pending. The latest award is shown.`,
  'award.not_in_force': () =>
    $localize`:@@problem.awardNotInForce:That needs an award in force (an award issued before answers were recorded is withdrawn rather than declined).`,
  'award.withdrawal_decided': () =>
    $localize`:@@problem.awardWithdrawalDecided:This withdrawal was already decided, or one is already pending.`,
  'award.closeout_started': () =>
    $localize`:@@problem.awardCloseoutStarted:A closeout already started on this award, so it can no longer be declined or withdrawn.`,
  'award.notices_invalid': () =>
    $localize`:@@problem.awardNoticesInvalid:Only reserve bids of this award can be told they are held in reserve. Check the firms ticked.`,
  'award.reserves_need_acceptance': () =>
    $localize`:@@problem.awardReservesNeedAcceptance:Reserve bids are told they were not selected only once the award is accepted: until then they may still be called on.`,
  'decision.previous_awardee': () =>
    $localize`:@@problem.previousAwardee:This firm's award on this tender was declined or withdrawn. Propose another bid.`,
  'performance.award_not_accepted': () =>
    $localize`:@@problem.awardNotAccepted:A closeout starts once the subcontractor has accepted the award.`,
  'performance.timing_unconfirmed': () =>
    $localize`:@@problem.performanceTimingUnconfirmed:This closeout is finalized very soon after the award or ran far shorter than awarded. Confirm the timing to finalize it.`,
  'retrospective.incomplete': () =>
    $localize`:@@problem.retrospectiveIncomplete:Record every required item before confirming this past outcome.`,
  'retrospective.attestation_required': () =>
    $localize`:@@problem.retrospectiveAttestation:Confirm that the record transcribes its source documents.`,
  'retrospective.self_confirmation': () =>
    $localize`:@@problem.retrospectiveSelfConfirmation:Someone who recorded none of this past outcome must confirm it.`,
  'retrospective.already_confirmed': () =>
    $localize`:@@problem.retrospectiveAlreadyConfirmed:This past outcome is already confirmed.`,
  'retrospective.not_confirmed': () =>
    $localize`:@@problem.retrospectiveNotConfirmed:Only a confirmed past outcome can be corrected.`,
  'retrospective.confirmed_read_only': () =>
    $localize`:@@problem.retrospectiveReadOnly:This past outcome is confirmed. Start a correction to change it.`,
  'retrospective.trade_required': () =>
    $localize`:@@problem.retrospectiveTrade:Choose an active trade from the catalogue.`,
  'retrospective.import_unknown_firm': () =>
    $localize`:@@problem.retrospectiveUnknownFirm:No subcontractor in the directory has this code.`,
  'retrospective.import_value_invalid': () =>
    $localize`:@@problem.retrospectiveValueInvalid:This value cannot be read. Check the template's format.`,
  'retrospective.import_rows_invalid': () =>
    $localize`:@@problem.retrospectiveRowsInvalid:Correct the refused rows and check the file again. Nothing was imported.`,
  'performance.not_assigned_manager': () =>
    $localize`:@@problem.performanceNotAssignedManager:This project has another assigned Project Manager. Confirm that you are finalizing the closeout on their behalf.`,
  'recommendation.history_not_in_plan': () =>
    $localize`:@@problem.recommendationHistoryNotInPlan:Past performance is not in your plan, so a recommendation policy cannot weigh it. Remove that criterion.`,
  'negotiation.field_out_of_scope': (p) =>
    $localize`:@@problem.negotiationFieldOutOfScope:This round does not open that part of your offer (${bidFieldLabel(text(p, 'field'))}:field:). Keep it as in your offer in force.`,
  'evaluation.assignee_not_scorer': () =>
    $localize`:@@problem.evaluationAssigneeNotScorer:Only a member who scores technical evaluations can be added to the panel.`,
  'evaluation.assignment_removed': () =>
    $localize`:@@problem.evaluationAssignmentRemoved:This evaluator was already removed from the panel. The latest panel is shown.`,
  'evaluation.panel_invalid': (p) =>
    $localize`:@@problem.evaluationPanelInvalid:The panel minimum is 1 to ${text(p, 'max')}:max: scorecards per bid.`,
  'evaluation.adjustments_not_carried': (p) =>
    $localize`:@@problem.evaluationAdjustmentsNotCarried:${text(p, 'count')}:count: bid(s) have adjustments made on an earlier revision that wait for a review. Re-apply each one or confirm it no longer applies, then complete leveling.`,
  'evaluation.adjustment_carry_not_needed': () =>
    $localize`:@@problem.evaluationCarryNotNeeded:This adjustment needs no review any more: it applies to the revised response, was withdrawn or was already reviewed. The latest leveling is shown.`,
  'schedule.item_invalid': (p) => scheduleItemProblem(p),
  'bid.rate_invalid': (p) =>
    $localize`:@@problem.bidRateInvalid:Enter each rate as a plain number with at most ${text(p, 'decimals')}:decimals: decimal places.`,
  'tender.pricing_invalid': () =>
    $localize`:@@problem.tenderPricingInvalid:Check the pricing basis and requested terms: percentages are 0 to 100 with at most two decimal places.`,
  'tender.criteria_required': () =>
    $localize`:@@problem.tenderCriteriaRequired:Your company requires this tender to declare its technical scorecard policy and its recommendation policy before it is published.`,
  'tender.criteria_unavailable': (p) =>
    text(p, 'section') === 'recommendation'
      ? $localize`:@@problem.tenderCriteriaRecommendationUnavailable:The declared recommendation policy no longer exists or is inactive. Choose an active one.`
      : $localize`:@@problem.tenderCriteriaEvaluationUnavailable:The declared technical scorecard policy no longer exists or is inactive. Choose an active one.`,
  'tender.pricing_required': () =>
    $localize`:@@problem.tenderPricingRequired:Your company requires every tender to state its VAT basis before it is published.`,
  'bid.terms_invalid': () =>
    $localize`:@@problem.bidTermsInvalid:Enter percentages as plain numbers from 0 to 100 with at most two decimal places. They are never rounded.`,
  'work_package.category_uncontrolled': (p) =>
    text(p, 'reason') === 'trade_retired'
      ? $localize`:@@problem.categoryTradeRetired:That trade is retired. Choose an active trade from the company's catalogue.`
      : $localize`:@@problem.categoryUncontrolled:Choose the category from the company's trades. Free text is not accepted, so history is never split by spelling.`,
  'category_mapping.invalid': () =>
    $localize`:@@problem.categoryMappingInvalid:Choose the category text and the trade it belongs to.`,
  'sourcing.trade_required': (p) =>
    $localize`:@@problem.sourcingTradeRequired:Choose the trade of work package ${ltr(text(p, 'code'))}:code: before starting sourcing, so its history is kept in the right category.`,
  'work_package.estimate_not_permitted': () =>
    $localize`:@@problem.estimateNotPermitted:Only procurement leadership, Commercial/QS and approvers enter the estimate. Leave it empty; the recorded estimate is kept.`,
  'work_package.estimate_reason_required': () =>
    $localize`:@@problem.estimateReasonRequired:A tender of this work package was published. Explain why the estimate changes (3 to 1000 characters).`,
  // CF-105: the Company Admin is pointed to the provider, never to "your administrator" (themself); everyone else to their Company Admin.
  'entitlement.feature_not_entitled': () =>
    planAdministrator()
      ? $localize`:@@problem.featureNotEntitledAdmin:Your company plan does not include this capability. Ask your platform provider or account manager to add it.`
      : $localize`:@@problem.featureNotEntitledMember:Your company plan does not include this capability. Ask your Company Admin about adding it.`,
  'quota.exceeded': (p) => {
    switch (text(p, 'quota')) {
      case 'max_active_projects':
        return planAdministrator()
          ? $localize`:@@problem.quotaProjectsAdmin:Your plan has no active-project capacity left (limit ${text(p, 'limit')}:limit:). Complete or cancel an active project first, or ask your platform provider to change the plan.`
          : $localize`:@@problem.quotaProjectsMember:Your plan has no active-project capacity left (limit ${text(p, 'limit')}:limit:). Complete or cancel an active project first, or ask your Company Admin about changing the plan.`;
      case 'max_subcontractors':
        return $localize`:@@problem.quotaSubcontractors:Your plan has no subcontractor directory places left (limit ${text(p, 'limit')}:limit:). Every stored subcontractor counts, whatever its status. Ask your platform operator to change the plan.`;
      case 'max_active_tenders':
        return $localize`:@@problem.quotaTenders:Your plan has no active-tender capacity left (limit ${text(p, 'limit')}:limit:). A published tender stays active until it is finished or cancelled. Ask your platform operator to change the plan.`;
      case 'max_users':
        return $localize`:@@problem.quotaUsers:Your plan has no user seats left (limit ${text(p, 'limit')}:limit:). Suspend a user or ask your platform operator to change the plan.`;
      default:
        return $localize`:@@problem.quotaExceeded:Your plan has no ${quotaLabel(text(p, 'quota'))}:quota: capacity left (limit ${text(p, 'limit')}:limit:). Release capacity first, or ask your platform operator to change the plan.`;
    }
  },
  'concurrency.stale': () =>
    $localize`:@@problem.concurrencyStale:This record was changed by someone else. Reload to see the latest version before saving.`,
  'concurrency.retry': () =>
    $localize`:@@problem.concurrencyRetry:Another change happened at the same time. Try again.`,
  'conflict.duplicate': () =>
    $localize`:@@problem.duplicate:A record with the same code already exists. Reload before retrying.`,
  'access.denied': () =>
    $localize`:@@problem.accessDenied:You do not have permission to perform this action.`,
  // CF-092 (ADR-162): the codes every problem response carries by status when no reviewed rule applies. They read like the status
  // messages; knownProductProblem leaves them to problemMessage, so a page's own wording for a status (a missing project …) still wins.
  'request.invalid': () =>
    $localize`:@@problem.invalid:Some details are not valid. Review the form and try again.`,
  'request.invalid_body': () =>
    $localize`:@@problem.invalid:Some details are not valid. Review the form and try again.`,
  'validation.failed': () =>
    $localize`:@@problem.invalid:Some details are not valid. Review the form and try again.`,
  'session.required': () =>
    $localize`:@@problem.tenantSession:Your company session has expired. Sign in and try again.`,
  'resource.not_found': () =>
    $localize`:@@problem.notFound:That record no longer exists, or you do not have access to it.`,
  'request.throttled': () =>
    $localize`:@@problem.throttled:Too many requests. Wait a minute and try again.`,
  'contact.in_open_invitation': () =>
    $localize`:@@problem.contactInOpenInvitation:This contact receives an open tender's invitation. Change the invitation's recipient first, then erase the contact.`,
  'outside_bid.sealed': () =>
    $localize`:@@problem.outsideBidSealed:This bid is confirmed and sealed until the bid opening.`,
  'mfa.attempts_exhausted': () =>
    $localize`:@@problem.mfaExhausted:Too many codes were not accepted. Wait 15 minutes, then sign in again.`,
  'server.error': () =>
    $localize`:@@problem.generic:The operation could not be completed. Please try again.`,
  'token.invitation_invalid': () =>
    $localize`:@@problem.invitationInvalid:This invitation link is invalid or expired. Ask your Company Admin to resend it.`,
  'token.reset_invalid': () =>
    $localize`:@@problem.resetInvalid:This reset link is invalid or expired. Request a new password reset.`,
  'invitation.domain_not_allowed': () =>
    $localize`:@@problem.invitationDomain:This email domain is not allowed for this company.`,
  'invitation.unavailable': () =>
    $localize`:@@problem.invitationUnavailable:This account cannot be invited to this company.`,
  'delivery.unavailable': () =>
    $localize`:@@problem.deliveryUnavailable:Email delivery is unavailable. Try again later.`,
  'password.length': () =>
    $localize`:@@problem.passwordLength:Use a password of 12 to 128 characters.`,
  'user.reactivate_requires_suspended': () =>
    $localize`:@@problem.userReactivate:Only suspended users can be reactivated.`,
  'user.suspend_requires_active': () =>
    $localize`:@@problem.userSuspend:Only active users can be suspended.`,
  'user.resend_requires_invited': () =>
    $localize`:@@problem.userResend:Only invited users can receive another invitation.`,
  'user.email_not_allowed': () =>
    $localize`:@@problem.userEmailNotAllowed:This invited email is no longer allowed by company policy.`,
  'user.revoke_requires_invited': () =>
    $localize`:@@problem.userRevoke:Only a pending invitation can be revoked.`,
  'user.reset_requires_active': () =>
    $localize`:@@problem.userReset:Only active users can be asked to reset their password.`,
  'user.last_company_admin': () =>
    $localize`:@@problem.lastCompanyAdmin:A company must keep at least one active Company Admin.`,
  'user.roles_invalid': () =>
    $localize`:@@problem.userRolesInvalid:A person holds at most three roles, and Company Admin can only be their main role.`,
  'user.roles_conflict': (p) =>
    $localize`:@@problem.userRolesConflict:${tenantRoleLabel(text(p, 'first'))}:first: and ${tenantRoleLabel(text(p, 'second'))}:second: cannot be held by the same person: technical evaluation stays commercially blind.`,
  'company.governance_invalid': () =>
    $localize`:@@problem.governanceInvalid:Check the governance settings: 1 to 10 compliant bids, and a tolerance between 0 and 100 percent with at most two decimals.`,
  'user.self_change_forbidden': () =>
    $localize`:@@problem.selfChange:You cannot change your own role, status or reset requirement.`,
  'platform.package_requires_user': () =>
    $localize`:@@problem.packageRequiresUser:The package must allow at least one user.`,
  'platform.company_code_taken': () =>
    $localize`:@@problem.companyCodeTaken:This company code already exists.`,
  'platform.package_code_taken': () =>
    $localize`:@@problem.packageCodeTakenPlatform:This package code already exists.`,
  'platform.package_inactive': () =>
    $localize`:@@problem.packageInactive:Inactive packages cannot be assigned.`,
  'platform.revise_inactive_package': () =>
    $localize`:@@problem.reviseInactive:Reactivate the package before editing its terms.`,
  'platform.first_admin_resend_unavailable': () =>
    $localize`:@@problem.firstAdminResend:The company must be active and the first administrator’s email must still be allowed.`,
  'platform.first_admin_already_active': () =>
    $localize`:@@problem.firstAdminActive:The first Company Admin has already activated their account.`,
  'platform.first_admin_name_required': () =>
    $localize`:@@problem.firstAdminName:Enter the first Company Admin’s name (up to 160 characters).`,
  'platform.first_admin_domain_not_allowed': () =>
    $localize`:@@problem.firstAdminDomain:The first Company Admin’s email must use an allowed domain.`,
  'platform.unknown_feature': (p) =>
    $localize`:@@problem.unknownFeature:Unknown capability ${text(p, 'key')}:key:.`,
  'platform.unknown_limit': (p) =>
    $localize`:@@problem.unknownLimit:Unknown limit ${text(p, 'key')}:key:.`,
  // CF-132: a reserved capability (declared, not yet built) cannot be put in a package or a revision.
  'platform.feature_not_sellable': () =>
    $localize`:@@problem.featureNotSellable:This capability is reserved and cannot be sold yet.`,
  'platform.feature_requires_limit': (p) =>
    $localize`:@@problem.featureRequiresLimit:${featureLabel(text(p, 'feature'))}:feature: requires a ${quotaLabel(text(p, 'limit'))}:limit: limit of at least ${text(p, 'minimum')}:minimum:.`,
  'directory.field_required': (p) =>
    $localize`:@@problem.directoryFieldRequired:${directoryFieldLabel(text(p, 'field'))}:field: is required.`,
  'directory.field_too_long': (p) =>
    $localize`:@@problem.directoryFieldTooLong:${directoryFieldLabel(text(p, 'field'))}:field: can be at most ${text(p, 'max')}:max: characters.`,
  'directory.text_invalid': (p) =>
    $localize`:@@problem.directoryTextInvalid:${directoryFieldLabel(text(p, 'field'))}:field: contains characters that are not allowed.`,
  'subcontractor.code_invalid': (p) =>
    $localize`:@@problem.subcontractorCodeInvalid:Use 2–${text(p, 'max')}:max: letters, digits, dash, underscore or slash for the subcontractor code.`,
  'subcontractor.registration_invalid': (p) =>
    $localize`:@@problem.registrationInvalid:${directoryFieldLabel(text(p, 'field'))}:field: can contain up to ${text(p, 'max')}:max: letters, digits or slashes.`,
  'subcontractor.country_invalid': () =>
    $localize`:@@problem.countryInvalid:Use a two-letter ISO country code, for example EG, SA or AE.`,
  'subcontractor.contact_email_invalid': () =>
    $localize`:@@problem.contactEmailInvalid:Enter a valid contact email address.`,
  'subcontractor.contact_phone_invalid': () =>
    $localize`:@@problem.contactPhoneInvalid:Enter a valid contact phone number.`,
  'subcontractor.contact_primary_multiple': () =>
    $localize`:@@problem.contactPrimaryMultiple:Only one contact can be the primary contact.`,
  'subcontractor.contact_email_duplicate': () =>
    $localize`:@@problem.contactEmailDuplicate:Each contact email can appear only once.`,
  'subcontractor.contact_not_found': () =>
    $localize`:@@problem.contactNotFound:A contact being edited no longer belongs to this subcontractor. Reload and try again.`,
  'subcontractor.contacts_too_many': (p) =>
    $localize`:@@problem.contactsTooMany:A subcontractor can have at most ${text(p, 'max')}:max: contacts.`,
  'subcontractor.trades_too_many': (p) =>
    $localize`:@@problem.tradesTooMany:A subcontractor can have at most ${text(p, 'max')}:max: trades.`,
  'subcontractor.status_unchanged': (p) =>
    $localize`:@@problem.subcontractorStatusUnchanged:The subcontractor is already ${subcontractorStatusLabel(text(p, 'status'))}:status:.`,
  'subcontractor.transition_not_allowed': (p) =>
    $localize`:@@problem.subcontractorTransition:A subcontractor cannot move from ${subcontractorStatusLabel(text(p, 'from'))}:from: to ${subcontractorStatusLabel(text(p, 'to'))}:to:.`,
  'subcontractor.block_reason_required': () =>
    $localize`:@@problem.blockReasonRequired:Explain why this subcontractor is blocked.`,
  'subcontractor.code_taken': (p) =>
    $localize`:@@problem.subcontractorCodeTaken:Subcontractor code ${text(p, 'code')}:code: is already used in this company.`,
  'subcontractor.registration_taken': (p) =>
    $localize`:@@problem.registrationTaken:Another subcontractor in this company already has this ${directoryFieldLabel(text(p, 'field'))}:field:.`,
  'subcontractor.trade_unavailable': () =>
    $localize`:@@problem.tradeUnavailable:Choose active trades of this company. Retired trades cannot be newly assigned.`,
  'trade.code_taken': (p) =>
    $localize`:@@problem.tradeCodeTaken:Trade code ${text(p, 'code')}:code: is already used in this company.`,
  'trade.code_invalid': (p) =>
    $localize`:@@problem.tradeCodeInvalid:Use 2–${text(p, 'max')}:max: letters, digits, dash, underscore or slash for the trade code.`,
  'trade.status_unchanged': (p) =>
    text(p, 'active') === 'true'
      ? $localize`:@@problem.tradeAlreadyActive:The trade is already active.`
      : $localize`:@@problem.tradeAlreadyRetired:The trade is already retired.`,
  'import.file_missing': () => $localize`:@@problem.importFileMissing:Choose one file to import.`,
  'import.file_empty': () => $localize`:@@problem.importFileEmpty:The file is empty.`,
  'import.file_too_large': (p) =>
    $localize`:@@problem.importFileTooLarge:The file is larger than ${megabytes(p, 'max')}:size: MB.`,
  'import.format_unsupported': () =>
    $localize`:@@problem.importFormatUnsupported:This type of file cannot be imported. Use a CSV file saved as UTF-8 or an Excel .xlsx workbook.`,
  'import.encoding_invalid': () =>
    $localize`:@@problem.importEncodingInvalid:The file is not UTF-8 text. Save it as CSV UTF-8 and try again.`,
  'import.malformed': (p) =>
    $localize`:@@problem.importMalformed:The file is not valid CSV. Check the quotation marks on row ${text(p, 'row')}:row:.`,
  'import.header_missing': (p) =>
    $localize`:@@problem.importHeaderMissing:The header row must include the ${text(p, 'column')}:column: column.`,
  'import.header_duplicate': (p) =>
    $localize`:@@problem.importHeaderDuplicate:The ${text(p, 'column')}:column: column appears more than once in the header row.`,
  'import.columns_too_many': (p) =>
    $localize`:@@problem.importColumnsTooMany:A file can have at most ${text(p, 'max')}:max: columns.`,
  'import.cell_too_long': (p) =>
    $localize`:@@problem.importCellTooLong:A cell on row ${text(p, 'row')}:row: is longer than ${text(p, 'max')}:max: characters.`,
  'import.rows_too_many': (p) =>
    $localize`:@@problem.importRowsTooMany:A file can have at most ${text(p, 'max')}:max: rows.`,
  'import.no_rows': () =>
    $localize`:@@problem.importNoRows:The file has a header row but no subcontractors.`,
  'import.checksum_required': () =>
    $localize`:@@problem.importChecksumRequired:Preview the file before confirming the import.`,
  'import.file_changed': () =>
    $localize`:@@problem.importFileChanged:This is not the file that was previewed. Preview it again.`,
  'import.not_valid': () =>
    $localize`:@@problem.importNotValid:The directory changed after the preview and some rows can no longer be imported. Preview the file again.`,
  'import.nothing_to_create': () =>
    $localize`:@@problem.importNothingToCreate:No row in this file adds a new subcontractor.`,
  'import.column_unknown': (p) =>
    p?.['column'] != null
      ? $localize`:@@problem.importColumnUnknown:Column ${text(p, 'column')}:column: is not recognised and will be ignored.`
      : $localize`:@@problem.importColumnUnknownAt:Column ${text(p, 'position')}:position: is not recognised and will be ignored.`,
  'import.row_too_wide': (p) =>
    $localize`:@@problem.importRowTooWide:This row has more cells than the ${text(p, 'columns')}:columns: columns in the header row.`,
  'import.trade_unknown': (p) =>
    p?.['trade'] != null
      ? $localize`:@@problem.importTradeUnknown:Trade ${text(p, 'trade')}:trade: does not exist in this company.`
      : $localize`:@@problem.importTradeUnknownUnnamed:A trade in this row does not exist in this company.`,
  'import.trade_retired': (p) =>
    p?.['trade'] != null
      ? $localize`:@@problem.importTradeRetired:Trade ${text(p, 'trade')}:trade: is retired and cannot be assigned.`
      : $localize`:@@problem.importTradeRetiredUnnamed:A trade in this row is retired and cannot be assigned.`,
  'import.registration_taken': (p) =>
    $localize`:@@problem.importRegistrationTaken:Subcontractor ${text(p, 'code')}:code: already has this ${directoryFieldLabel(text(p, 'field'))}:field:.`,
  'import.duplicate_in_file': (p) =>
    $localize`:@@problem.importDuplicateInFile:The same value already appears on row ${text(p, 'row')}:row: of this file.`,
  'import.continuation_invalid': (p) =>
    $localize`:@@problem.importContinuationInvalid:This row adds a contact to the firm of row ${text(p, 'row')}:row:, which cannot be imported.`,
  'import.existing_skipped': (p) =>
    $localize`:@@problem.importExistingSkipped:The firm of row ${text(p, 'row')}:row: is already in the directory and is not updated, so this contact is not added.`,
  'import.formula_like': () =>
    $localize`:@@problem.importFormulaLike:This cell starts like a spreadsheet formula. It is saved as plain text — check it is meant to.`,
  'import.possible_duplicate': (p) =>
    p?.['code'] != null
      ? $localize`:@@problem.importPossibleDuplicate:Subcontractor ${text(p, 'code')}:code: has the same legal name. Check that this is not the same firm.`
      : $localize`:@@problem.importPossibleDuplicateRow:Row ${text(p, 'row')}:row: has the same legal name. Check that these are not the same firm.`,
  'import.xlsx_invalid': () =>
    $localize`:@@problem.importXlsxInvalid:The file is not a readable Excel workbook. Save it again as .xlsx and try again.`,
  'import.xlsx_unsafe': () =>
    $localize`:@@problem.importXlsxUnsafe:The workbook is too large or built in a way that cannot be read safely. Copy the data into a new workbook and try again.`,
  'import.xlsx_macros': () =>
    $localize`:@@problem.importXlsxMacros:The workbook contains macros. Save it as an .xlsx workbook without macros.`,
  'import.xlsx_external': () =>
    $localize`:@@problem.importXlsxExternal:The workbook links to other files or data sources. Save a copy without links.`,
  'import.formula_not_allowed': (p) =>
    p?.['cell']
      ? $localize`:@@problem.importFormulaAt:Cell ${text(p, 'cell')}:cell: contains a formula. Formulas are not imported: paste the values only and try again.`
      : $localize`:@@problem.importFormula:The workbook contains formulas. Formulas are not imported: paste the values only and try again.`,
  'import.existing_trade_ignored': (p) => {
    const named = p?.['trade'] != null;
    if (text(p, 'state') === 'unknown')
      return named
        ? $localize`:@@problem.importExistingTradeUnknown:Trade ${text(p, 'trade')}:trade: does not exist in this company. It is ignored: this code is already in your directory, and an import never changes existing subcontractors.`
        : $localize`:@@problem.importExistingTradeUnknownUnnamed:A trade in this row does not exist in this company. It is ignored: this code is already in your directory, and an import never changes existing subcontractors.`;
    return named
      ? $localize`:@@problem.importExistingTradeRetired:Trade ${text(p, 'trade')}:trade: is retired. It is ignored: this code is already in your directory, and an import never changes existing subcontractors.`
      : $localize`:@@problem.importExistingTradeRetiredUnnamed:A trade in this row is retired. It is ignored: this code is already in your directory, and an import never changes existing subcontractors.`;
  },
  'import.rows_before_header': (p) =>
    $localize`:@@problem.importRowsBeforeHeader:The column names were found on row ${text(p, 'row')}:row:. The rows above it were treated as a title and not imported.`,
  'sourcing.work_package_not_ready': () =>
    $localize`:@@problem.sourcingNotReady:Activate the work package before sourcing it.`,
  'sourcing.work_package_on_hold': () =>
    $localize`:@@problem.sourcingOnHold:The work package is on hold. Resume it to continue sourcing.`,
  'sourcing.work_package_closed': () =>
    $localize`:@@problem.sourcingClosed:The work package is closed. Its sourcing is kept as a read-only record.`,
  'sourcing.already_started': (p) =>
    $localize`:@@problem.sourcingAlreadyStarted:Sourcing has already started for work package ${ltr(text(p, 'code'))}:code:. Open it from the work package.`,
  'sourcing.shortlist_approved_read_only': () =>
    $localize`:@@problem.sourcingApprovedReadOnly:The shortlist is approved, so nothing can change. Reopen it to make changes.`,
  'sourcing.not_approved': () =>
    $localize`:@@problem.sourcingNotApproved:Only an approved shortlist can be reopened.`,
  'sourcing.candidate_exists': (p) =>
    $localize`:@@problem.sourcingCandidateExists:Subcontractor ${ltr(text(p, 'code'))}:code: is already a candidate.`,
  'sourcing.candidate_limit': (p) =>
    $localize`:@@problem.sourcingCandidateLimit:A work package can have at most ${text(p, 'max')}:max: candidates, including those no longer considered.`,
  'sourcing.candidate_removed': (p) =>
    $localize`:@@problem.sourcingCandidateRemoved:Subcontractor ${ltr(text(p, 'code'))}:code: was removed from consideration. Consider it again first.`,
  'sourcing.subcontractor_not_active': (p) =>
    $localize`:@@problem.sourcingSubcontractorNotActive:Subcontractor ${ltr(text(p, 'code'))}:code: is ${subcontractorStatusLabel(text(p, 'status'))}:status: in the directory. Only active subcontractors can be considered, qualified or shortlisted.`,
  'sourcing.rationale_required': (p) =>
    text(p, 'result') === 'NotQualified'
      ? $localize`:@@problem.sourcingRationaleNotQualified:Explain why this candidate does not qualify.`
      : $localize`:@@problem.sourcingRationaleOverride:Explain why this candidate qualifies although a criterion is not met.`,
  'sourcing.shortlist_requires_qualified': (p) =>
    $localize`:@@problem.sourcingShortlistRequiresQualified:Only a qualified candidate can be shortlisted. ${ltr(text(p, 'code'))}:code: is ${prequalificationResultLabel(text(p, 'result'))}:result:.`,
  'sourcing.shortlist_empty': () =>
    $localize`:@@problem.sourcingShortlistEmpty:Shortlist at least one qualified candidate before approving.`,
  'sourcing.shortlist_member_not_active': (p) =>
    $localize`:@@problem.sourcingMemberNotActive:These shortlisted subcontractors are no longer active in the directory: ${ltr(text(p, 'codes'))}:codes:. Take them off the shortlist, or reactivate them in the directory, before approving.`,
  'sourcing.reopen_reason_required': (p) =>
    $localize`:@@problem.sourcingReopenReason:Explain why the approved shortlist is being reopened (at least ${text(p, 'min')}:min: characters).`,
  'sourcing.trade_unavailable': () =>
    $localize`:@@problem.sourcingTradeUnavailable:Choose active trades of this company. Retired trades cannot be newly added.`,
  'sourcing.trades_too_many': (p) =>
    $localize`:@@problem.sourcingTradesTooMany:Sourcing can name at most ${text(p, 'max')}:max: trades.`,
  'sourcing.text_too_long': (p) =>
    $localize`:@@problem.sourcingTextTooLong:${sourcingFieldLabel(text(p, 'field'))}:field: can be at most ${text(p, 'max')}:max: characters.`,
  'sourcing.text_invalid': (p) =>
    $localize`:@@problem.sourcingTextInvalid:${sourcingFieldLabel(text(p, 'field'))}:field: contains characters that are not allowed.`,
  'tender.work_package_not_ready': () =>
    $localize`:@@problem.tenderNotReady:Activate the work package before creating or changing its tender.`,
  'tender.work_package_on_hold': () =>
    $localize`:@@problem.tenderOnHold:The work package is on hold. Resume it to continue with the tender.`,
  'tender.work_package_closed': () =>
    $localize`:@@problem.tenderClosed:The work package is closed. Its tender can only be viewed or cancelled.`,
  'tender.shortlist_not_approved': () =>
    $localize`:@@problem.tenderShortlistNotApproved:No shortlist is approved for this work package right now. Approve the shortlist in Sourcing first.`,
  'tender.already_exists': (p) =>
    $localize`:@@problem.tenderAlreadyExists:This work package already has tender ${ltr(text(p, 'reference'))}:reference:. Open it, or cancel it before starting another.`,
  'tender.published_read_only': () =>
    $localize`:@@problem.tenderPublishedReadOnly:The tender is published. What bidders were sent can no longer be changed.`,
  'tender.cancelled_read_only': () =>
    $localize`:@@problem.tenderCancelledReadOnly:The tender is cancelled and kept as a read-only record.`,
  'tender.not_published': () => $localize`:@@problem.tenderNotPublished:Publish the tender first.`,
  'tender.deadline_passed': () =>
    $localize`:@@problem.tenderDeadlinePassed:The submission deadline has passed. Invitations can no longer be sent or changed.`,
  'tender.deadline_too_soon': (p) =>
    $localize`:@@problem.tenderDeadlineTooSoon:The submission deadline must be at least ${text(p, 'hours')}:hours: hour(s) from now.`,
  'tender.questions_deadline_invalid': () =>
    $localize`:@@problem.tenderQuestionsDeadline:The questions deadline must be in the future and before the submission deadline.`,
  'tender.time_zone_invalid': () =>
    $localize`:@@problem.tenderTimeZone:Choose a valid time zone from the list.`,
  'tender.local_time_invalid': (p) =>
    $localize`:@@problem.tenderLocalTime:${tenderFieldLabel(text(p, 'field'))}:field: is not a valid date and time in the chosen time zone.`,
  'tender.incomplete': (p) =>
    $localize`:@@problem.tenderIncomplete:Complete the tender before publishing it: ${tenderFieldList(text(p, 'fields'), $localize.locale ?? 'en')}:fields:.`,
  'tender.invitee_not_approved': (p) =>
    $localize`:@@problem.tenderInviteeNotApproved:Only subcontractors on the approved shortlist in force can be invited. Not on it now: ${ltr(text(p, 'codes'))}:codes:.`,
  'tender.invitee_not_active': (p) =>
    $localize`:@@problem.tenderInviteeNotActive:${ltr(text(p, 'code'))}:code: is ${subcontractorStatusLabel(text(p, 'status'))}:status: in the directory and cannot be invited. Remove it from the invitees.`,
  'tender.invitee_exists': (p) =>
    $localize`:@@problem.tenderInviteeExists:${ltr(text(p, 'code'))}:code: is already invited.`,
  'tender.invitee_limit': (p) =>
    $localize`:@@problem.tenderInviteeLimit:A tender can invite at most ${text(p, 'max')}:max: subcontractors.`,
  'tender.contact_unavailable': (p) =>
    $localize`:@@problem.tenderContactUnavailable:Choose a contact of ${ltr(text(p, 'code'))}:code: that has an email address. Add one in the directory if needed.`,
  'tender.recipients_missing': (p) =>
    $localize`:@@problem.tenderRecipientsMissing:These invitees no longer have a contact with an email address: ${ltr(text(p, 'codes'))}:codes:. Choose another contact or update the directory.`,
  'tender.document_limit': (p) =>
    $localize`:@@problem.tenderDocumentLimit:A tender can hold at most ${text(p, 'max')}:max: documents.`,
  'tender.document_too_large': (p) =>
    $localize`:@@problem.tenderDocumentTooLarge:The file is larger than ${megabytes(p, 'maxBytes')}:max: MB.`,
  'tender.document_type_not_allowed': (p) =>
    $localize`:@@problem.tenderDocumentType:This file cannot be attached, or its content does not match its extension. Allowed: ${ltr(text(p, 'extensions'))}:extensions:.`,
  'tender.document_empty': () =>
    $localize`:@@problem.tenderDocumentEmpty:Choose one non-empty file.`,
  'tender.document_name_invalid': (p) =>
    $localize`:@@problem.tenderDocumentName:Use a file name of at most ${text(p, 'max')}:max: characters with an allowed extension: ${ltr(text(p, 'extensions'))}:extensions:.`,
  'tender.field_required': (p) =>
    $localize`:@@problem.tenderFieldRequired:${tenderFieldLabel(text(p, 'field'))}:field: is required.`,
  'tender.text_too_long': (p) =>
    $localize`:@@problem.tenderTextTooLong:${tenderFieldLabel(text(p, 'field'))}:field: can be at most ${text(p, 'max')}:max: characters.`,
  'tender.text_invalid': (p) =>
    $localize`:@@problem.tenderTextInvalid:${tenderFieldLabel(text(p, 'field'))}:field: contains characters that are not allowed.`,
  'tender.email_invalid': (p) =>
    $localize`:@@problem.tenderEmailInvalid:Enter a valid email address for ${tenderFieldLabel(text(p, 'field'))}:field:.`,
  'tender.currency_invalid': () =>
    $localize`:@@problem.tenderCurrency:Use a three-letter ISO currency code, for example EGP, SAR or USD.`,
  'tender.validity_invalid': (p) =>
    $localize`:@@problem.tenderValidity:Bid validity must be ${text(p, 'min')}:min:–${text(p, 'max')}:max: days.`,
  'tender.required_documents_invalid': (p) =>
    $localize`:@@problem.tenderRequiredDocuments:List at most ${text(p, 'max')}:max: required documents of up to ${text(p, 'maxLength')}:maxLength: characters each.`,
  'tender.reminder_days_invalid': (p) =>
    $localize`:@@problem.tenderReminderDays:Choose up to ${text(p, 'max')}:max: reminder days from the offered values.`,
  'reason.required': (p) =>
    $localize`:@@problem.tenderReasonRequired:Explain the reason (at least ${text(p, 'min')}:min: characters).`,
  'tender.invitation_not_active': (p) =>
    $localize`:@@problem.tenderInvitationNotActive:The invitation of ${ltr(text(p, 'code'))}:code: is ${invitationStatusLabel(text(p, 'status'))}:status:, so this action is not available.`,
  'tender.invitation_send_too_soon': (p) =>
    $localize`:@@problem.tenderSendTooSoon:An email for this invitation was requested moments ago. Wait ${text(p, 'minutes')}:minutes: minutes before sending another.`,
  'tender.invitation_not_sent_yet': () =>
    $localize`:@@problem.tenderNotSentYet:The invitation email has not been accepted by a mail server yet. Resend the invitation instead of a reminder.`,
  'bidder.view_only_link': () =>
    $localize`:@@problem.bidderViewOnlyLink:This link can only show the invitation. The invited firm answers and bids through the personal link in its invitation email.`,
  // CF-071 (ADR-134): data lifecycle.
  'directory.contact_primary_erase': () =>
    $localize`:@@problem.contactPrimaryErase:Make another contact primary before erasing this one.`,
  'user.erase_not_suspended': () =>
    $localize`:@@problem.userEraseNotSuspended:Suspend the user before erasing their personal data.`,
  'platform.purge_unavailable': () =>
    $localize`:@@problem.platformPurgeUnavailable:Company deletion needs the separate maintenance credential, which is not configured on this server.`,
  'platform.purge_not_due': () =>
    $localize`:@@problem.platformPurgeNotDue:The company's deletion is not due yet.`,
  'platform.purge_not_suspended': () =>
    $localize`:@@problem.platformPurgeNotSuspended:Only a suspended company can be scheduled for deletion, and a deleted company cannot be changed.`,
  'platform.purge_confirmation': () =>
    $localize`:@@problem.platformPurgeConfirmation:Type the company's code exactly to confirm its deletion.`,
  'platform.workflow_unopenable': () =>
    $localize`:@@problem.platformWorkflowUnopenable:A package with tendering must also include evaluation: otherwise its bids could never be opened.`,
  'platform.workflow_end_unacknowledged': () =>
    $localize`:@@problem.platformWorkflowEndUnacknowledged:This package's workflow stops before the full loop. Acknowledge where it ends to save it.`,
  'platform.workflow_incomplete_revision': () =>
    $localize`:@@problem.platformWorkflowIncompleteRevision:This revision's workflow cannot be finished, so it cannot be assigned. Save a new revision of the package first.`,
  'platform.recovery_same_operator': () =>
    $localize`:@@problem.platformRecoverySameOperator:A second operator has to approve this recovery.`,
  'platform.recovery_decided': () =>
    $localize`:@@problem.platformRecoveryDecided:This recovery was already approved or cancelled.`,
  'platform.recovery_pending': () =>
    $localize`:@@problem.platformRecoveryPending:A recovery for this company is already waiting for approval.`,
  'platform.recovery_email_not_allowed': () =>
    $localize`:@@problem.platformRecoveryEmailNotAllowed:The new Company Admin's email must belong to the company's allowed domains, and the company must be active.`,
  'platform.recovery_email_in_use': () =>
    $localize`:@@problem.platformRecoveryEmailInUse:A user with this email already exists in the company; its own Company Admin manages it.`,
  'platform.operator_setup_invalid': () =>
    $localize`:@@problem.platformOperatorSetupInvalid:This setup link is invalid or has expired. Ask another operator for a new one.`,
  'platform.operator_totp_enrolled': () =>
    $localize`:@@problem.platformOperatorTotpEnrolled:This operator's authenticator is already set up.`,
  'platform.operator_email_taken': () =>
    $localize`:@@problem.platformOperatorEmailTaken:An operator with this email already exists.`,
  'platform.operator_self_change': () =>
    $localize`:@@problem.platformOperatorSelfChange:Another operator has to change your own access.`,
  'platform.operator_last_active': () =>
    $localize`:@@problem.platformOperatorLastActive:The platform keeps at least one active operator.`,
  'platform.residency_region_mismatch': () =>
    $localize`:@@problem.platformResidencyRegionMismatch:This deployment does not keep data in that policy's region, so the policy cannot be assigned here.`,
  'platform.residency_override_not_permitted': () =>
    $localize`:@@problem.platformResidencyOverrideNotPermitted:The policy recommended for this country does not permit placing the company under another one.`,
  'platform.residency_override_reason_required': () =>
    $localize`:@@problem.platformResidencyOverrideReasonRequired:Explain why this company is not placed under the policy recommended for its country.`,
  'platform.residency_policy_code_taken': () =>
    $localize`:@@problem.platformResidencyPolicyCodeTaken:A residency policy with this code already exists.`,
  'platform.residency_policy_in_use': () =>
    $localize`:@@problem.platformResidencyPolicyInUse:Companies are placed under this policy, so its code and region stay as they are. Create another policy instead.`,
  'platform.residency_policy_inactive': () =>
    $localize`:@@problem.platformResidencyPolicyInactive:This residency policy is inactive and cannot be assigned.`,
  'platform.purge_before_retention': () =>
    $localize`:@@problem.platformPurgeBeforeRetention:The company's residency policy keeps its data longer: schedule the deletion no earlier than its minimum retention.`,
  'platform.commercial_end_required': () =>
    $localize`:@@problem.platformCommercialEndRequired:A pilot needs an end date after its start date.`,
  'tender.close_without_award_not_allowed': () =>
    $localize`:@@problem.tenderCloseWithoutAwardNotAllowed:Only an opened tender whose evaluation is complete can be closed without an award.`,
  'platform.reuse_legal_basis_required': () =>
    $localize`:@@problem.platformReuseLegalBasisRequired:Record the legal basis — the agreement and its clause — before allowing any reuse of this company's data.`,
  // CF-061 (ADR-133): company access states.
  'company.read_only': () =>
    $localize`:@@problem.companyReadOnly:Your company is read-only while its account winds down: you can view and export everything, but nothing can be created, changed or sent.`,
  'platform.company_not_active': () =>
    $localize`:@@problem.platformCompanyNotActive:Only an active company can start a read-only grace.`,
  'platform.company_not_in_grace': () =>
    $localize`:@@problem.platformCompanyNotInGrace:This company is not in a read-only grace.`,
  'platform.company_in_grace': () =>
    $localize`:@@problem.platformCompanyInGrace:This company is in a read-only grace: end the grace before changing its plan.`,
  'platform.in_flight_unconfirmed': () =>
    $localize`:@@problem.platformInFlightUnconfirmed:This change would freeze work in progress. Review the counts and confirm it explicitly.`,
  'bidder.tender_paused': (p) =>
    $localize`:@@problem.bidderTenderPaused:The buyer has paused tender ${text(p, 'reference')}:reference:. You cannot respond or submit while it is paused; contact the buyer.`,
  'bidder.link_invalid': () =>
    $localize`:@@problem.bidderLinkInvalid:This invitation link is invalid or has expired. Ask the buyer to send you a new one.`,
  'bidder.response_closed': () =>
    $localize`:@@problem.bidderResponseClosed:This tender no longer accepts responses.`,
  'bidder.decline_reason_required': () =>
    $localize`:@@problem.bidderDeclineReason:Choose why you are declining. For "Other reason", add a short comment.`,
  'bidder.buyer_preview': () =>
    $localize`:@@problem.bidderBuyerPreview:You are signed in to the buyer's workspace, so this is a preview. Only the invited firm can answer.`,
  'bidder.comment_too_long': (p) =>
    $localize`:@@problem.bidderCommentTooLong:The comment can be at most ${text(p, 'max')}:max: characters.`,
  'email.field_required': (p) =>
    $localize`:@@problem.emailFieldRequired:${tenderFieldLabel(text(p, 'field'))}:field: is required.`,
  'email.field_invalid': (p) =>
    $localize`:@@problem.emailFieldInvalid:${tenderFieldLabel(text(p, 'field'))}:field: is not valid.`,
  'email.credentials_required': () =>
    $localize`:@@problem.emailCredentialsRequired:Set the mail server password first (and turn on authentication if the server needs it).`,
  'email.server_not_configured': () =>
    $localize`:@@problem.emailServerNotConfigured:Configure the mail server and pass a test before enabling it.`,
  'email.test_too_soon': (p) =>
    $localize`:@@problem.emailTestTooSoon:Wait ${text(p, 'seconds')}:seconds: seconds before testing again.`,
  'email.template_unknown': () =>
    $localize`:@@problem.emailTemplateUnknown:This email template does not exist.`,
  'email.template_placeholder_unknown': (p) =>
    $localize`:@@problem.emailPlaceholderUnknown:${ltr('{{' + text(p, 'placeholder') + '}}')}:placeholder: cannot be used in the ${tenderFieldLabel(text(p, 'field') || 'body')}:field:.`,
  'email.template_placeholder_required': (p) =>
    $localize`:@@problem.emailPlaceholderRequired:The body must include ${ltr('{{' + text(p, 'placeholder') + '}}')}:placeholder:.`,
  'email.template_syntax_invalid': (p) =>
    $localize`:@@problem.emailTemplateSyntax:A placeholder in the ${tenderFieldLabel(text(p, 'field'))}:field: is not written as ${ltr('{{Name}}')}:example:.`,
  'email.template_too_long': (p) =>
    $localize`:@@problem.emailTemplateTooLong:The ${tenderFieldLabel(text(p, 'field'))}:field: must have 1–${text(p, 'max')}:max: characters.`,
  'secrets.unavailable': () =>
    $localize`:@@problem.secretsUnavailable:Secure storage for passwords and invitation links is not configured on this server. Ask your platform operator.`,
  'storage.unavailable': () =>
    $localize`:@@problem.storageUnavailable:Document storage is not configured on this server. Ask your platform operator.`,
  'compliance.type_invalid': (p) =>
    text(p, 'field') === 'tradeIds'
      ? $localize`:@@problem.complianceTypeTrades:Choose the trades this document is required for, or make it required for every trade.`
      : $localize`:@@problem.complianceTypeInvalid:Check the document type's details.`,
  'compliance.type_duplicate': () =>
    $localize`:@@problem.complianceTypeDuplicate:Your company already has a document type with this name.`,
  'compliance.type_inactive': () =>
    $localize`:@@problem.complianceTypeInactive:This document type is switched off. Switch it on again to record documents of it.`,
  'compliance.document_invalid': (p) => {
    switch (text(p, 'field')) {
      case 'number':
        return $localize`:@@problem.complianceNumberRequired:This document type needs its number.`;
      case 'issuer':
        return $localize`:@@problem.complianceIssuerRequired:This document type needs its issuer.`;
      case 'expiresOn':
        return $localize`:@@problem.complianceExpiryInvalid:Enter the expiry date (on or after the issue date).`;
      default:
        return $localize`:@@problem.complianceDocumentInvalid:Choose the document type and complete the document.`;
    }
  },
  'compliance.vendor_status_invalid': (p) =>
    text(p, 'field') === 'reason'
      ? $localize`:@@problem.vendorReasonRequired:Give the reason for this approved-vendor status.`
      : $localize`:@@problem.vendorStatusInvalid:Choose one of the firm's trades and a status.`,
  'sourcing.approval_not_independent': () =>
    $localize`:@@problem.sourcingApprovalNotIndependent:Your company requires the shortlist to be approved by someone other than who prepared or last changed it.`,
  'tender.publish_not_independent': () =>
    $localize`:@@problem.tenderPublishNotIndependent:Your company requires the tender to be published by someone other than who prepared or last changed it.`,
  'award.compliance_blocked': (p) =>
    $localize`:@@problem.awardComplianceBlocked:The award is stopped: ${ltr(text(p, 'subcontractorCode'))}:code: lacks a valid ${text(p, 'documents')}:documents:. Record the current document, then issue the award.`,
  'tender_template.inactive': () =>
    $localize`:@@problem.tenderTemplateInactive:This template is no longer offered. Choose another template or ask for it to be offered again.`,
  'tender_template.duplicate': () =>
    $localize`:@@problem.tenderTemplateDuplicate:A template with this name already exists. Choose another name, or save as a new version of that template.`,
  'sourcing.fast_path_unavailable': (p) => {
    switch (text(p, 'reason')) {
      case 'four_eyes':
        return $localize`:@@problem.fastPathFourEyes:The fast path is not available while your company requires an independent shortlist approver.`;
      case 'value':
        return $localize`:@@problem.fastPathValue:The fast path is only for work packages whose estimate is within your company's fast-path limit, in its currency.`;
      default:
        return $localize`:@@problem.fastPathOff:Your company has not turned on the fast path.`;
    }
  },
  'sourcing.fast_path_firm_not_approved': (p) =>
    $localize`:@@problem.fastPathFirmNotApproved:The fast path is only for approved vendors in this package's trades. Not approved: ${ltr(text(p, 'codes'))}:codes:.`,
  'bid.not_amending': () =>
    $localize`:@@problem.bidNotAmending:Start revising your submitted bid first, then submit the revised bid.`,
  'bid.resubmission_not_allowed': () =>
    $localize`:@@problem.bidResubmissionNotAllowed:This buyer does not accept revised bids: your submission is final. Contact the buyer if you need to correct it.`,
  'bid.resubmission_limit': (p) =>
    $localize`:@@problem.bidResubmissionLimit:You have revised this bid as many times as the buyer allows (${text(p, 'max')}:max:). Contact the buyer if you need to correct it.`,
  'decision.revision_acknowledgement_required': () =>
    $localize`:@@problem.decisionRevisionAcknowledgement:The proposed bid answered an earlier tender revision. Say why the decision stands on it before submitting.`,
  'bid.not_withdrawable': () =>
    $localize`:@@problem.bidNotWithdrawable:Only a submitted bid can be withdrawn.`,
  'bid.withdrawal_invalid': (p) =>
    text(p, 'field') === 'reason'
      ? $localize`:@@problem.bidWithdrawalReason:Give the reason the firm gave for withdrawing (at least 3 characters, at most 1000).`
      : $localize`:@@problem.bidWithdrawalReference:Give the reference of the firm's withdrawal (its letter or email).`,
  'bid.withdrawal_confirmation_required': () =>
    $localize`:@@problem.bidWithdrawalConfirmation:Confirm that you want to withdraw your bid.`,
  'decision.bid_withdrawn': (p) =>
    $localize`:@@problem.decisionBidWithdrawn:${ltr(text(p, 'subcontractorCode'))}:code: withdrew its bid after opening, so it cannot be awarded. Recompute the recommendation and decide again.`,
  'outside_bid.invalid': (p) =>
    $localize`:@@problem.outsideBidInvalid:Complete the record of the bid received outside the portal (${text(p, 'field')}:field:): the firm, how and when it arrived (after publication, not in the future), an attestation of at least 10 characters, the transcription and the original files.`,
  'outside_bid.self_confirmation': () =>
    $localize`:@@problem.outsideBidSelfConfirmation:Another user must confirm the transcription of a bid you recorded.`,
  'opening.outside_bid_unconfirmed': (p) =>
    $localize`:@@problem.openingOutsideBidUnconfirmed:${text(p, 'count')}:count: bid(s) recorded outside the portal still need a second user's confirmation before the bids can be opened.`,
  'file.infected': () =>
    $localize`:@@problem.fileInfected:The malware scanner flagged this file, so it was not added. Upload a clean copy.`,
  'file.scan_pending': () =>
    $localize`:@@problem.fileScanPending:This file is still being scanned for malware. It can be opened once the scanner has found it clean.`,
  'file.withheld': () =>
    $localize`:@@problem.fileWithheld:The malware scanner flagged this file. It is kept as evidence and is never served.`,
  'platform.feature_requires_feature': (p) =>
    $localize`:@@problem.featureRequiresFeature:${featureLabel(text(p, 'feature'))}:feature: can only be included together with ${featureLabel(text(p, 'required'))}:required:.`,
  'platform.access_policy_invalid': () =>
    $localize`:@@problem.accessPolicyInvalid:The access policy is not valid. Check the allowed domains, IP/CIDR rules and locations.`,
  // ADR-176.
  'platform.access_policy_country_unknown': (p) =>
    $localize`:@@problem.accessPolicyCountryUnknown:“${text(p, 'country')}:country:” is not an ISO 3166-1 two-letter country code. Use codes such as EG (Egypt) or AE (United Arab Emirates).`,
  'platform.access_policy_ip_unavailable': () =>
    $localize`:@@problem.accessPolicyIpUnavailable:IP rules cannot be enforced in this deployment: the API cannot see the client’s original address, so every user of the company would be denied. Remove the IP rules.`,
  'platform.access_policy_location_unavailable': () =>
    $localize`:@@problem.accessPolicyLocationUnavailable:Country rules cannot be enforced in this deployment: it cannot determine where a request comes from, so every user of the company would be denied. Remove the country rules.`,
  'request.antiforgery_invalid': () =>
    $localize`:@@problem.antiforgeryInvalid:Your page’s security token is out of date (for example after signing in elsewhere in this browser). Reload the page and try again.`,
};

/** Part 10 refusal parameters name fields by key; these say which field in the reader's language. */
function negotiationFieldLabel(field: string): string {
  return (
    (
      {
        instructions: $localize`:@@problemField.instructions:The instructions to firms`,
        text: $localize`:@@problemField.noteText:The note`,
        comment: $localize`:@@problemField.declineComment:The comment`,
        purpose: $localize`:@@problemField.purpose:The internal purpose`,
      } as Record<string, string>
    )[field] ?? $localize`:@@problemField.text:The text`
  );
}

function policyFieldLabel(field: string): string {
  switch (field) {
    case 'name':
      return $localize`:@@problemField.policyName:a name of at most 120 characters is required`;
    case 'description':
      return $localize`:@@problemField.policyDescription:the description is too long`;
    case 'minimumTechnicalScore':
      return $localize`:@@problemField.passMark:the technical pass mark is from 0 to 100 with at most one decimal`;
    case 'criteria.kind':
      return $localize`:@@problemField.criteriaKind:each criterion is used at most once, and at least one criterion uses current evidence`;
    default:
      return $localize`:@@problemField.criteria:choose the criteria the recommendation uses`;
  }
}

function recommendationStaleText(reason: string): string {
  switch (reason) {
    case 'superseded':
      return $localize`:@@problemStale.superseded:a newer recommendation exists`;
    case 'policy_changed':
      return $localize`:@@problemStale.policyChanged:the policy changed`;
    case 'tender_cancelled':
      return $localize`:@@problemStale.cancelled:the tender was cancelled`;
    case 'evaluation_not_completed':
      return $localize`:@@problemStale.notCompleted:the evaluation is not complete`;
    default:
      return $localize`:@@problemStale.evidenceChanged:the evaluation evidence changed`;
  }
}

function decisionFieldLabel(field: string): string {
  return (
    (
      {
        recommendationId: $localize`:@@problemField.recommendation:the recommendation`,
        proposedOpeningBidId: $localize`:@@problemField.proposed:the proposed firm`,
        awardValue: $localize`:@@problemField.awardValue:the award value`,
        overrideReason: $localize`:@@problemField.overrideReason:the override reason`,
        valueReason: $localize`:@@problemField.valueReason:the value reason`,
        rationale: $localize`:@@problemField.rationale:the rationale`,
        dispositions: $localize`:@@problemField.dispositions:the choice for every other firm (reserve order or not selected)`,
        'dispositions.reason': $localize`:@@problemField.dispositionReason:a reason for a firm not selected`,
        kind: $localize`:@@problemField.kind:the approval action`,
        comment: $localize`:@@problemField.comment:the comment`,
      } as Record<string, string>
    )[field] ?? field
  );
}

function performanceFieldLabel(field: string): string {
  return (
    (
      {
        actualFinalCost: $localize`:@@problemField.actualFinalCost:the actual final cost`,
        variationValue: $localize`:@@problemField.variationValue:the variation value (only with at least one variation)`,
        claimedValue: $localize`:@@problemField.claimedValue:the claimed value (only with at least one claim)`,
        variationCount: $localize`:@@problemField.variationCount:the number of variations`,
        claimCount: $localize`:@@problemField.claimCount:the number of claims`,
        disputeCount: $localize`:@@problemField.disputeCount:the number of disputes`,
        unresolvedClaimCount: $localize`:@@problemField.unresolvedClaims:the unresolved claims (never more than the claims)`,
        unresolvedDisputeCount: $localize`:@@problemField.unresolvedDisputes:the unresolved disputes (never more than the disputes)`,
        actualStartDate: $localize`:@@problemField.actualStart:the actual start date (not in the future)`,
        actualCompletionDate: $localize`:@@problemField.actualCompletion:the actual completion date (not before the start, not in the future)`,
        qualityRating: $localize`:@@problemField.qualityRating:the quality rating (1–5)`,
        hseRating: $localize`:@@problemField.hseRating:the HSE rating (1–5)`,
        wouldWorkAgain: $localize`:@@problemField.wouldWorkAgain:the would-work-again decision`,
        mobilization: $localize`:@@problemField.mobilization:the mobilization outcome`,
        variationCause: $localize`:@@problemField.variationCause:the main cause of variations`,
      } as Record<string, string>
    )[field] ??
    $localize`:@@problemField.closeoutText:a text field (too long or with characters that are not allowed)`
  );
}

function approvalRuleFieldLabel(field: string): string {
  return (
    (
      {
        name: $localize`:@@problemField.ruleName:the name`,
        currency: $localize`:@@problemField.ruleCurrency:the currency (required with a value range)`,
        minimumValue: $localize`:@@problemField.ruleMinimum:the minimum value`,
        maximumValue: $localize`:@@problemField.ruleMaximum:the maximum value (above the minimum)`,
        stepRoles: $localize`:@@problemField.ruleSteps:the approver role of each step`,
        category: $localize`:@@problemField.ruleCategory:the category`,
        requiredApprovals: $localize`:@@problemField.ruleApprovals:the number of approvals`,
      } as Record<string, string>
    )[field] ?? field
  );
}

/** Every code the frontend can explain. Kept in step with the backend's ProblemCodes catalogue. */
export const KNOWN_PROBLEM_CODES: readonly string[] = Object.keys(MESSAGES);

/** Only explicit known codes select a translation. Never turn server text into a message ID. */
let planAdministrator: () => boolean = () => false;

/** CF-105 (ADR-122): the session tells the plan-denial copy whether the reader manages the company (and so asks the provider, not themself). */
export function registerPlanAudience(reader: () => boolean): void {
  planAdministrator = reader;
}

/** CF-092 (ADR-162): status defaults, explained by the status path of problemMessage rather than as reviewed rules. */
const STATUS_CODES: ReadonlySet<string> = new Set([
  'request.invalid',
  'request.invalid_body',
  'session.required',
  'resource.not_found',
  'server.error',
]);

export function knownProductProblem(problem: ProductProblem | null | undefined): string | null {
  const code = problem?.code;
  if (!code || STATUS_CODES.has(code) || !Object.hasOwn(MESSAGES, code)) return null;
  return MESSAGES[code](problem?.parameters);
}

/** Refusals caused by the value of one form field, keyed by code: the field's control name. */
const FIELD_PROBLEMS: Readonly<Record<string, string>> = {
  'project.code_taken': 'code',
  'work_package.code_taken': 'code',
  'subcontractor.code_taken': 'code',
  'trade.code_taken': 'code',
};

/** The form field whose value a refusal is about, so editing it makes the refusal stale. */
export function problemField(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const code = (typeof error.error === 'object' && error.error?.code) || '';
  return Object.hasOwn(FIELD_PROBLEMS, code) ? FIELD_PROBLEMS[code] : null;
}

/**
 * Red-team B-092-6 (CF-092 AC6): the fields a `validation.failed` refusal lists, keyed by the request's field name, each with the
 * localised message of its own code. The answer names fields and codes only (never a value); a code's parameters are not part of it,
 * so the form passes what it knows per field (`{ code: { max: '32' } }`). A field with a status-default code (`request.invalid`, e.g. a
 * text over its length) or an unknown code reads as a generic "not valid". Empty for any other refusal.
 */
export function problemFieldErrors(
  error: unknown,
  parameters: Readonly<Record<string, Parameters>> = {},
): Readonly<Record<string, string>> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return {};
  const body = (typeof error.error === 'object' && error.error) || {};
  if (body.code !== 'validation.failed') return {};
  const listed: { field: string; code: string }[] = Array.isArray(body.errors)
    ? body.errors.filter(
        (entry: unknown): entry is { field: string; code: string } =>
          typeof (entry as { field?: unknown })?.field === 'string' &&
          typeof (entry as { code?: unknown })?.code === 'string',
      )
    : String(body.parameters?.fields ?? '')
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
        .map((field) => ({ field, code: '' }));
  const errors: Record<string, string> = {};
  for (const { field, code } of listed)
    errors[field] =
      knownProductProblem({ code, parameters: parameters[field] }) ??
      $localize`:@@problem.fieldInvalid:This value is not valid.`;
  return errors;
}

export interface ProblemContext {
  /** Which plane the caller is on; decides the sign-in wording for 401. */
  readonly plane?: 'tenant' | 'platform';
  /** The record a 404 refers to. */
  readonly subject?: 'project' | 'workPackage' | 'record';
}

/**
 * One resolution order for every screen: a known code wins; the English build may show a reviewed
 * server detail; everything else becomes a localized, safe message chosen by HTTP status.
 */
export function problemMessage(error: unknown, context: ProblemContext = {}): string {
  if (!(error instanceof HttpErrorResponse)) return genericFailure();
  const body = (typeof error.error === 'object' && error.error) || {};
  const known = knownProductProblem(body as ProductProblem);
  if (known) return known;
  if (error.status === 0)
    return $localize`:@@problem.network:Cannot reach the server. Check your connection and try again.`;
  if (error.status === 401)
    return context.plane === 'platform'
      ? $localize`:@@problem.platformSession:Platform access denied. Sign in again with an authorized operator account.`
      : $localize`:@@problem.tenantSession:Your company session has expired. Sign in and try again.`;
  if (error.status === 403) return MESSAGES['access.denied'](undefined);
  if (error.status === 404) {
    if (context.subject === 'project')
      return $localize`:@@problem.projectNotFound:That project no longer exists, or you do not have access to it.`;
    if (context.subject === 'workPackage')
      return $localize`:@@problem.packageNotFound:That work package no longer exists, or you do not have access to it.`;
    return $localize`:@@problem.notFound:That record no longer exists, or you do not have access to it.`;
  }
  // A reviewed English detail is only ever shown by the English build; Arabic never mixes it in.
  const detail = (body as ProductProblem).detail;
  const englishBuild = !$localize.locale || $localize.locale.startsWith('en');
  if (englishBuild && typeof detail === 'string' && detail && error.status < 500) return detail;
  if (error.status === 400)
    return $localize`:@@problem.invalid:Some details are not valid. Review the form and try again.`;
  if (error.status === 409)
    return $localize`:@@problem.conflict:This change conflicts with the current state. Reload and try again.`;
  if (error.status === 503) return MESSAGES['delivery.unavailable'](undefined);
  return genericFailure();
}

function genericFailure(): string {
  return $localize`:@@problem.generic:The operation could not be completed. Please try again.`;
}

/**
 * CF-004 (ADR-093): a refused price-schedule item, from the field and the stable reason the server gives (the item number is the index + 1;
 * an import row is reported by the import screen itself).
 */
function scheduleItemProblem(p: Parameters | undefined): string {
  const field = scheduleFieldLabel(text(p, 'field'));
  const index = p?.['index'];
  const item = index !== undefined && /^\d+$/.test(String(index)) ? String(Number(index) + 1) : '';
  let reason: string;
  switch (text(p, 'reason')) {
    case 'required':
      reason = $localize`:@@scheduleProblem.required:${field}:field: is required`;
      break;
    case 'duplicate':
      reason = $localize`:@@scheduleProblem.duplicate:${field}:field: repeats another item's code (codes are unique, ignoring case)`;
      break;
    case 'number':
      reason = $localize`:@@scheduleProblem.number:${field}:field: must be a plain number with at most ${text(p, 'decimals')}:decimals: decimal places — it is never rounded`;
      break;
    case 'not_allowed':
      reason = $localize`:@@scheduleProblem.notAllowed:${field}:field: does not apply to this item type`;
      break;
    case 'too_long':
      reason = $localize`:@@scheduleProblem.tooLong:${field}:field: is longer than ${text(p, 'max')}:max: characters`;
      break;
    case 'text':
      reason = $localize`:@@scheduleProblem.text:${field}:field: contains characters that are not allowed`;
      break;
    case 'unknown':
      reason = $localize`:@@scheduleProblem.unknownType:${field}:field: must be measured, provisional sum, optional or rate only`;
      break;
    case 'currency_decimals':
      reason = $localize`:@@scheduleProblem.currencyDecimals:${field}:field: has more decimal places than ${text(p, 'currency')}:currency: allows (${text(p, 'decimals')}:decimals:)`;
      break;
    case 'too_many':
      return $localize`:@@scheduleProblem.tooMany:A price schedule has at most ${text(p, 'max')}:max: items.`;
    default:
      reason = $localize`:@@scheduleProblem.other:${field}:field: is not valid`;
  }
  return item
    ? $localize`:@@scheduleProblem.item:Price schedule item ${item}:item:: ${reason}:reason:.`
    : $localize`:@@scheduleProblem.general:Price schedule: ${reason}:reason:.`;
}
