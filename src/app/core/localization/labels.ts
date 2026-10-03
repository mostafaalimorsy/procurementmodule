import { tenantRoleLabel } from '../auth/tenant-role-labels';
/**
 * Localized labels for the stable identifiers the API returns. The API keeps enum names and keys;
 * only the presentation is translated, and an unknown identifier falls back to itself rather than
 * pretending to know what it means.
 */
export type LifecycleStatus = 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';

// Every catalogue is built on each call rather than at module load. A production bundle has its
// translations compiled in, but the unit-test runner shares modules between spec files, so a table
// built once by an English spec would otherwise stay English for a later Arabic one.

const lifecycleLabels = (): Record<LifecycleStatus, string> => ({
  Draft: $localize`:@@status.draft:Draft`,
  Active: $localize`:@@status.active:Active`,
  OnHold: $localize`:@@status.onHold:On hold`,
  Completed: $localize`:@@status.completed:Completed`,
  Cancelled: $localize`:@@status.cancelled:Cancelled`,
});

export function lifecycleStatusLabel(status: string): string {
  return lifecycleLabels()[status as LifecycleStatus] ?? status;
}

const quotaLabels = (): Record<string, string> => ({
  max_users: $localize`:@@quota.maxUsers:Users`,
  max_active_projects: $localize`:@@quota.maxActiveProjects:Active projects`,
  max_subcontractors: $localize`:@@quota.maxSubcontractors:Subcontractors`,
  max_active_tenders: $localize`:@@quota.maxActiveTenders:Active tenders`,
});

const featureLabels = (): Record<string, string> => ({
  projects: $localize`:@@feature.projects:Projects`,
  subcontractor_directory: $localize`:@@feature.subcontractorDirectory:Subcontractor directory`,
  sourcing: $localize`:@@feature.sourcing:Sourcing`,
  tendering: $localize`:@@feature.tendering:Tendering`,
  bidder_portal: $localize`:@@feature.bidderPortal:Bidder portal`,
  evaluation: $localize`:@@feature.evaluation:Evaluation`,
  award: $localize`:@@feature.award:Negotiation, recommendation and award`,
  performance: $localize`:@@feature.performance:Performance`,
  intelligence: $localize`:@@feature.intelligence:Intelligence`,
  advanced_reporting: $localize`:@@feature.advancedReporting:Advanced reporting`,
  custom_smtp: $localize`:@@feature.customSmtp:Company mail server`,
});

export type SubcontractorStatus = 'Active' | 'Inactive' | 'Blocked';

const subcontractorStatusLabels = (): Record<SubcontractorStatus, string> => ({
  Active: $localize`:@@subcontractorStatus.active:Active`,
  Inactive: $localize`:@@subcontractorStatus.inactive:Inactive`,
  Blocked: $localize`:@@subcontractorStatus.blocked:Blocked`,
});

export function subcontractorStatusLabel(status: string): string {
  return subcontractorStatusLabels()[status as SubcontractorStatus] ?? status;
}

export type SourcingStatus = 'Open' | 'ShortlistApproved';

const sourcingStatusLabels = (): Record<SourcingStatus, string> => ({
  Open: $localize`:@@sourcingStatus.open:In progress`,
  ShortlistApproved: $localize`:@@sourcingStatus.approved:Shortlist approved`,
});

export function sourcingStatusLabel(status: string): string {
  return sourcingStatusLabels()[status as SourcingStatus] ?? status;
}

export type PrequalificationResult = 'Pending' | 'Qualified' | 'NotQualified';

const prequalificationResultLabels = (): Record<PrequalificationResult, string> => ({
  Pending: $localize`:@@prequalResult.pending:Not yet decided`,
  Qualified: $localize`:@@prequalResult.qualified:Qualified`,
  NotQualified: $localize`:@@prequalResult.notQualified:Not qualified`,
});

export function prequalificationResultLabel(result: string): string {
  return prequalificationResultLabels()[result as PrequalificationResult] ?? result;
}

export type CriterionOutcome = 'NotAssessed' | 'Met' | 'NotMet';

const criterionOutcomeLabels = (): Record<CriterionOutcome, string> => ({
  NotAssessed: $localize`:@@criterionOutcome.notAssessed:Not assessed`,
  Met: $localize`:@@criterionOutcome.met:Met`,
  NotMet: $localize`:@@criterionOutcome.notMet:Not met`,
});

export function criterionOutcomeLabel(outcome: string): string {
  return criterionOutcomeLabels()[outcome as CriterionOutcome] ?? outcome;
}

/** The fixed prequalification checklist, keyed as the API names each criterion. */
export type CriterionKey =
  | 'tradeFit'
  | 'geographicCoverage'
  | 'capacity'
  | 'experience'
  | 'compliance'
  | 'risk'
  | 'pastPerformance';

const criterionLabels = (): Record<CriterionKey, string> => ({
  tradeFit: $localize`:@@criterion.tradeFit:Trade and category fit`,
  geographicCoverage: $localize`:@@criterion.geographicCoverage:Geographic coverage`,
  capacity: $localize`:@@criterion.capacity:Capacity`,
  experience: $localize`:@@criterion.experience:Similar-project experience`,
  compliance: $localize`:@@criterion.compliance:Financial, safety and compliance evidence`,
  risk: $localize`:@@criterion.risk:Risk`,
  pastPerformance: $localize`:@@criterion.pastPerformance:Internal history and past performance`,
});

export function criterionLabel(key: string): string {
  return criterionLabels()[key as CriterionKey] ?? key;
}

/** Sourcing input field keys, as ProblemDetails parameters name them. */
const sourcingFieldLabels = (): Record<string, string> => ({
  rationale: $localize`:@@sourcingField.rationale:Rationale`,
  reason: $localize`:@@sourcingField.reason:Reason`,
});

export function sourcingFieldLabel(key: string): string {
  return sourcingFieldLabels()[key] ?? key;
}

/** The directory's stable field keys, as ProblemDetails parameters name them. */
const directoryFieldLabels = (): Record<string, string> => ({
  code: $localize`:@@directoryField.code:Code`,
  legalName: $localize`:@@directoryField.legalName:Legal name`,
  tradingName: $localize`:@@directoryField.tradingName:Trading name`,
  commercialRegistration: $localize`:@@directoryField.commercialRegistration:Commercial registration no.`,
  taxRegistration: $localize`:@@directoryField.taxRegistration:Tax registration no.`,
  country: $localize`:@@directoryField.country:Country`,
  city: $localize`:@@directoryField.city:City`,
  notes: $localize`:@@directoryField.notes:Notes`,
  statusReason: $localize`:@@directoryField.statusReason:Reason`,
  contactName: $localize`:@@directoryField.contactName:Contact name`,
  contactJobTitle: $localize`:@@directoryField.contactJobTitle:Job title`,
  contactEmail: $localize`:@@directoryField.contactEmail:Contact email`,
  contactPhone: $localize`:@@directoryField.contactPhone:Contact phone`,
  tradeName: $localize`:@@directoryField.tradeName:Trade name`,
  trades: $localize`:@@directoryField.trades:Trades`,
  contact: $localize`:@@directoryField.contact:Primary contact`,
  contacts: $localize`:@@directoryField.contacts:Contacts`,
});

export function directoryFieldLabel(key: string): string {
  return directoryFieldLabels()[key] ?? key;
}

export function quotaLabel(key: string): string {
  return quotaLabels()[key] ?? key;
}

export function featureLabel(key: string): string {
  return featureLabels()[key] ?? key;
}

const userStatusLabels = (): Record<string, string> => ({
  Invited: $localize`:@@userStatus.invited:Invited`,
  Active: $localize`:@@userStatus.active:Active`,
  Suspended: $localize`:@@userStatus.suspended:Suspended`,
  ResetRequired: $localize`:@@userStatus.resetRequired:Reset required`,
});

export function userStatusLabelFor(status: string, passwordResetRequired = false): string {
  return passwordResetRequired
    ? userStatusLabels()['ResetRequired']
    : (userStatusLabels()[status] ?? status);
}

const firstAdminStateLabels = (): Record<string, string> => ({
  PendingInvitation: $localize`:@@firstAdmin.pending:Invitation pending`,
  InvitationIssued: $localize`:@@firstAdmin.issued:Invitation issued`,
});

export function firstAdminStateLabel(state: string): string {
  return firstAdminStateLabels()[state] ?? state;
}

export type TenderType = 'Rfq' | 'Rfp';
export type TenderStatus = 'Draft' | 'Published' | 'Cancelled' | 'ClosedWithoutActiveAward';
export type TenderDeadlineState = 'Open' | 'ClosingSoon' | 'Closed' | 'Extended' | 'Cancelled';
export type InvitationStatus =
  | 'Prepared'
  | 'Invited'
  | 'IntendsToBid'
  | 'Declined'
  | 'Revoked'
  | 'BidStarted'
  | 'BidSubmitted'
  // CF-049 (ADR-100): the firm withdrew its submitted bid before the deadline.
  | 'Withdrawn';
export type InvitationDeliveryStatus = 'NotSent' | 'Queued' | 'Sending' | 'Sent' | 'Failed';
export type DeclineReason =
  | 'NotInterested'
  | 'InsufficientCapacity'
  | 'TimelineTooShort'
  | 'OutsideScope'
  | 'LocationNotCovered'
  | 'CommercialTerms'
  | 'Other';
export type DeliveryKind =
  | 'Invitation'
  | 'Resend'
  | 'Reminder'
  | 'AutomaticReminder'
  | 'ClarificationAnswered'
  | 'ClarificationPublished'
  | 'AddendumIssued'
  | 'DeadlineExtended'
  | 'TenderClosedEarly'
  | 'NegotiationInvitation'
  | 'AwardSelected'
  | 'AwardNotSelected'
  | 'AwardReserveHeld'
  | 'BidSubmitted'
  | 'TenderCancelled'
  | 'NegotiationRoundClosed'
  | 'NegotiationRoundCancelled';
export type DeliveryAttemptStatus = 'Queued' | 'Sending' | 'Sent' | 'Failed' | 'Cancelled' | 'Held';
export type ReminderStatus = 'Scheduled' | 'Processed' | 'Skipped' | 'Cancelled';
export type InvitationEventType =
  | 'Invited'
  | 'ResendRequested'
  | 'ReminderRequested'
  | 'AutomaticReminderQueued'
  | 'EmailSent'
  | 'EmailFailed'
  | 'Opened'
  | 'IntendsToBid'
  | 'Declined'
  | 'LinkRegenerated'
  | 'LinkCopied'
  | 'RecipientChanged'
  | 'Revoked'
  | 'BidStarted'
  | 'BidSubmitted'
  | 'NoticeQueued'
  | 'QuestionAsked'
  | 'AddendumAcknowledged'
  | 'BidResubmitted'
  | 'BidWithdrawn';
export type ClarificationStatus = 'Open' | 'Answered';
export type ClarificationVisibility = 'Private' | 'AllBidders';
export type AddendumStatus = 'Draft' | 'Issued' | 'Discarded';

const tenderTypeLabels = (): Record<TenderType, string> => ({
  Rfq: $localize`:@@tenderType.rfq:Request for quotation (RFQ)`,
  Rfp: $localize`:@@tenderType.rfp:Request for proposal (RFP)`,
});

export function tenderTypeLabel(type: string): string {
  return tenderTypeLabels()[type as TenderType] ?? type;
}

const tenderStatusLabels = (): Record<TenderStatus, string> => ({
  Draft: $localize`:@@tenderStatus.draft:Draft`,
  Published: $localize`:@@tenderStatus.published:Published`,
  Cancelled: $localize`:@@tenderStatus.cancelled:Cancelled`,
  // CF-046 (ADR-110): its award was declined or withdrawn and it was closed to re-tender.
  ClosedWithoutActiveAward: $localize`:@@tenderStatus.closedWithoutAward:Closed without an award`,
});

export function tenderStatusLabel(status: string): string {
  return tenderStatusLabels()[status as TenderStatus] ?? status;
}

const deadlineStateLabels = (): Record<TenderDeadlineState, string> => ({
  Open: $localize`:@@deadlineState.biddingOpen:Bidding open`,
  ClosingSoon: $localize`:@@deadlineState.biddingClosesSoon:Bidding closes soon`,
  Closed: $localize`:@@deadlineState.biddingClosed:Bidding closed`,
  Extended: $localize`:@@deadlineState.deadlineExtended:Deadline extended`,
  Cancelled: $localize`:@@deadlineState.tenderCancelled:Tender cancelled`,
});

export function deadlineStateLabel(state: string): string {
  return deadlineStateLabels()[state as TenderDeadlineState] ?? state;
}

const invitationStatusLabels = (): Record<InvitationStatus, string> => ({
  Prepared: $localize`:@@invitationStatus.prepared:Not yet sent`,
  Invited: $localize`:@@invitationStatus.invited:No response yet`,
  IntendsToBid: $localize`:@@invitationStatus.intendsToBid:Intends to bid`,
  Declined: $localize`:@@invitationStatus.declined:Declined`,
  Revoked: $localize`:@@invitationStatus.revoked:Revoked`,
  BidStarted: $localize`:@@invitationStatus.bidStarted:Bid started`,
  BidSubmitted: $localize`:@@invitationStatus.bidSubmitted:Bid submitted`,
  Withdrawn: $localize`:@@invitationStatus.withdrawn:Bid withdrawn`,
});

export function invitationStatusLabel(status: string): string {
  return invitationStatusLabels()[status as InvitationStatus] ?? status;
}

const deliveryStatusLabels = (): Record<InvitationDeliveryStatus, string> => ({
  NotSent: $localize`:@@deliveryStatus.notSent:Not sent`,
  Queued: $localize`:@@deliveryStatus.queued:Queued`,
  Sending: $localize`:@@deliveryStatus.sending:Sending`,
  Sent: $localize`:@@deliveryStatus.sent:Accepted by mail server`,
  Failed: $localize`:@@deliveryStatus.failed:Failed`,
});

export function deliveryStatusLabel(status: string): string {
  return deliveryStatusLabels()[status as InvitationDeliveryStatus] ?? status;
}

const attemptStatusLabels = (): Record<DeliveryAttemptStatus, string> => ({
  Queued: $localize`:@@attemptStatus.queued:Queued`,
  Sending: $localize`:@@attemptStatus.sending:Sending`,
  Sent: $localize`:@@attemptStatus.sent:Accepted by mail server`,
  Failed: $localize`:@@attemptStatus.failed:Failed`,
  Cancelled: $localize`:@@attemptStatus.cancelled:Withdrawn before sending`,
  Held: $localize`:@@attemptStatus.held:Held until the award is accepted`,
});

export function attemptStatusLabel(status: string): string {
  return attemptStatusLabels()[status as DeliveryAttemptStatus] ?? status;
}

const deliveryKindLabels = (): Record<DeliveryKind, string> => ({
  Invitation: $localize`:@@deliveryKind.invitation:Invitation`,
  Resend: $localize`:@@deliveryKind.resend:Invitation (resent)`,
  Reminder: $localize`:@@deliveryKind.reminder:Reminder`,
  AutomaticReminder: $localize`:@@deliveryKind.automaticReminder:Automatic reminder`,
  ClarificationAnswered: $localize`:@@deliveryKind.clarificationAnswered:Answer to the firm's question`,
  ClarificationPublished: $localize`:@@deliveryKind.clarificationPublished:Published clarification`,
  AddendumIssued: $localize`:@@deliveryKind.addendumIssued:Addendum issued`,
  DeadlineExtended: $localize`:@@deliveryKind.deadlineExtended:Deadline extended`,
  TenderClosedEarly: $localize`:@@deliveryKind.tenderClosedEarly:Tender closed early`,
  NegotiationInvitation: $localize`:@@deliveryKind.negotiationInvitation:Negotiation round request`,
  AwardSelected: $localize`:@@deliveryKind.awardSelected:Tender outcome (selected for award)`,
  AwardNotSelected: $localize`:@@deliveryKind.awardNotSelected:Tender outcome (not selected)`,
  AwardReserveHeld: $localize`:@@deliveryKind.awardReserveHeld:Bid held in reserve`,
  BidSubmitted: $localize`:@@deliveryKind.bidSubmitted:Bid receipt`,
  TenderCancelled: $localize`:@@deliveryKind.tenderCancelled:Cancellation notice`,
  NegotiationRoundClosed: $localize`:@@deliveryKind.roundClosed:Round closed notice`,
  NegotiationRoundCancelled: $localize`:@@deliveryKind.roundCancelled:Round cancelled notice`,
});

export function deliveryKindLabel(kind: string): string {
  return deliveryKindLabels()[kind as DeliveryKind] ?? kind;
}

const declineReasonLabels = (): Record<DeclineReason, string> => ({
  NotInterested: $localize`:@@declineReason.notInterested:Not interested in this tender`,
  InsufficientCapacity: $localize`:@@declineReason.insufficientCapacity:Not enough capacity`,
  TimelineTooShort: $localize`:@@declineReason.timelineTooShort:Timeline too short`,
  OutsideScope: $localize`:@@declineReason.outsideScope:Outside our scope or trade`,
  LocationNotCovered: $localize`:@@declineReason.locationNotCovered:Location not covered`,
  CommercialTerms: $localize`:@@declineReason.commercialTerms:Commercial terms not acceptable`,
  Other: $localize`:@@declineReason.other:Other reason`,
});

export function declineReasonLabel(reason: string): string {
  return declineReasonLabels()[reason as DeclineReason] ?? reason;
}

const reminderStatusLabels = (): Record<ReminderStatus, string> => ({
  Scheduled: $localize`:@@reminderStatus.scheduled:Scheduled`,
  Processed: $localize`:@@reminderStatus.processed:Emails queued`,
  Skipped: $localize`:@@reminderStatus.skipped:Skipped`,
  Cancelled: $localize`:@@reminderStatus.cancelled:Cancelled`,
});

const reminderSkipLabels = (): Record<string, string> => ({
  tender_not_published: $localize`:@@reminderSkip.notPublished:the tender was not published`,
  deadline_passed: $localize`:@@reminderSkip.deadlinePassed:the deadline had passed`,
  work_package_closed: $localize`:@@reminderSkip.workPackageClosed:the work package is closed`,
  company_not_entitled: $localize`:@@reminderSkip.companyNotEntitled:the company's plan did not allow sending`,
  closed_early: $localize`:@@reminderSkip.closedEarly:the tender was closed early`,
  bids_opened: $localize`:@@reminderSkip.bidsOpened:the bids were opened`,
});

export function reminderSkipLabel(reason: string): string {
  return reminderSkipLabels()[reason] ?? $localize`:@@reminderSkip.other:not applicable`;
}

export function reminderStatusLabel(status: string): string {
  return reminderStatusLabels()[status as ReminderStatus] ?? status;
}

const invitationEventLabels = (): Record<InvitationEventType, string> => ({
  Invited: $localize`:@@invitationEvent.invited:Invitation issued`,
  ResendRequested: $localize`:@@invitationEvent.resendRequested:Resend requested`,
  ReminderRequested: $localize`:@@invitationEvent.reminderRequested:Reminder requested`,
  AutomaticReminderQueued: $localize`:@@invitationEvent.automaticReminderQueued:Automatic reminder queued`,
  EmailSent: $localize`:@@invitationEvent.emailSent:Email accepted by the mail server`,
  EmailFailed: $localize`:@@invitationEvent.emailFailed:Email failed`,
  Opened: $localize`:@@invitationEvent.opened:Link opened for the first time`,
  IntendsToBid: $localize`:@@invitationEvent.intendsToBid:Said they intend to bid`,
  Declined: $localize`:@@invitationEvent.declined:Declined`,
  LinkRegenerated: $localize`:@@invitationEvent.linkRegenerated:Link replaced`,
  LinkCopied: $localize`:@@invitationEvent.linkCopied:Link copied`,
  RecipientChanged: $localize`:@@invitationEvent.recipientChanged:Recipient changed`,
  Revoked: $localize`:@@invitationEvent.revoked:Invitation revoked`,
  BidStarted: $localize`:@@invitationEvent.bidStarted:Bid started`,
  BidSubmitted: $localize`:@@invitationEvent.bidSubmitted:Bid submitted`,
  NoticeQueued: $localize`:@@invitationEvent.noticeQueued:Tender update email queued`,
  QuestionAsked: $localize`:@@invitationEvent.questionAsked:Asked a question`,
  AddendumAcknowledged: $localize`:@@invitationEvent.addendumAcknowledged:Acknowledged an addendum`,
  BidResubmitted: $localize`:@@invitationEvent.bidResubmitted:Submitted a revised bid`,
  BidWithdrawn: $localize`:@@invitationEvent.bidWithdrawn:Bid withdrawn`,
});

export function invitationEventLabel(type: string): string {
  return invitationEventLabels()[type as InvitationEventType] ?? type;
}

const clarificationStatusLabels = (): Record<ClarificationStatus, string> => ({
  Open: $localize`:@@clarificationStatus.open:Awaiting answer`,
  Answered: $localize`:@@clarificationStatus.answered:Answered`,
});

export function clarificationStatusLabel(status: string): string {
  return clarificationStatusLabels()[status as ClarificationStatus] ?? status;
}

const clarificationVisibilityLabels = (): Record<ClarificationVisibility, string> => ({
  Private: $localize`:@@clarificationVisibility.private:Private`,
  AllBidders: $localize`:@@clarificationVisibility.allBidders:Published to all bidders`,
});

export function clarificationVisibilityLabel(visibility: string): string {
  return clarificationVisibilityLabels()[visibility as ClarificationVisibility] ?? visibility;
}

/** Why a bidder cannot ask a question now, as the API reports it. */
const questionsClosedLabels = (): Record<string, string> => ({
  deadline_passed: $localize`:@@questionsClosed.deadlinePassed:The submission deadline has passed, so questions are closed.`,
  questions_deadline_passed: $localize`:@@questionsClosed.questionsDeadlinePassed:The questions deadline has passed.`,
  cancelled: $localize`:@@questionsClosed.cancelled:The tender is cancelled.`,
  closed_early: $localize`:@@questionsClosed.closedEarly:The buyer closed the tender early, so questions are closed.`,
  not_published: $localize`:@@questionsClosed.notPublished:The tender is not published.`,
  view_only: $localize`:@@questionsClosed.viewOnly:Only the invited firm can ask questions, through the personal link in its invitation email.`,
});

export function questionsClosedLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  return questionsClosedLabels()[reason] ?? questionsClosedLabels()['deadline_passed'];
}

/** Sanitized mail failure categories, as the API reports them. */
const mailFailureLabels = (): Record<string, string> => ({
  not_configured: $localize`:@@mailFailure.notConfigured:No mail server is configured`,
  company_server_unavailable: $localize`:@@mailFailure.companyServerUnavailable:The company requires its own mail server, which is not ready`,
  host_not_permitted: $localize`:@@mailFailure.hostNotPermitted:This mail server address or port is not allowed`,
  connection_failed: $localize`:@@mailFailure.connectionFailed:Could not connect to the mail server`,
  tls_failed: $localize`:@@mailFailure.tlsFailed:The secure (TLS) connection failed`,
  authentication_failed: $localize`:@@mailFailure.authenticationFailed:The mail server refused the user name or password`,
  sender_rejected: $localize`:@@mailFailure.senderRejected:The mail server refused the sender address`,
  recipient_rejected: $localize`:@@mailFailure.recipientRejected:The mail server refused the recipient address`,
  message_rejected: $localize`:@@mailFailure.messageRejected:The mail server refused the message`,
  protocol_error: $localize`:@@mailFailure.protocolError:The mail server answered unexpectedly`,
  secret_unavailable: $localize`:@@mailFailure.secretUnavailable:The stored password cannot be read on this server`,
  interrupted: $localize`:@@mailFailure.interrupted:Sending was interrupted; it is unknown whether the email left`,
  encryption_required: $localize`:@@mailFailure.encryptionRequired:This server is outside a private network, so the connection must use STARTTLS or TLS`,
  unknown: $localize`:@@mailFailure.unknown:The email could not be sent`,
});

export function mailFailureLabel(category: string | null | undefined): string {
  if (!category) return '';
  return mailFailureLabels()[category] ?? mailFailureLabels()['unknown'];
}

/** CF-009: where a tender is — its stage, or for decision readers the finer step (the server's TenderLifecycle). Never "Published". */
const tenderLifecycleLabels = (): Record<string, string> => ({
  Draft: $localize`:@@lifecycle.draft:Draft`,
  OpenForBids: $localize`:@@lifecycle.openForBids:Open for bids`,
  AwaitingOpening: $localize`:@@lifecycle.awaitingOpening:Bidding closed — bids to open`,
  Opened: $localize`:@@lifecycle.opened:Bids opened`,
  InEvaluation: $localize`:@@lifecycle.inEvaluation:In evaluation`,
  InNegotiation: $localize`:@@lifecycle.inNegotiation:Negotiation round open`,
  EvaluationRefresh: $localize`:@@lifecycle.evaluationRefresh:Round closed — evaluation to update`,
  ReadyForDecision: $localize`:@@lifecycle.readyForDecision:Ready for a decision`,
  AwaitingApproval: $localize`:@@lifecycle.awaitingApproval:Decision awaiting approval`,
  ApprovedAwaitingAward: $localize`:@@lifecycle.approvedAwaitingAward:Approved — award to issue`,
  Awarded: $localize`:@@lifecycle.awarded:Awarded`,
  AwaitingAnswer: $localize`:@@lifecycle.awaitingAnswer:Awarded — awaiting the firm's answer`,
  WithdrawalPending: $localize`:@@lifecycle.withdrawalPending:Award withdrawal awaiting approval`,
  CloseoutInProgress: $localize`:@@lifecycle.closeoutInProgress:Closeout in progress`,
  CloseoutFinalized: $localize`:@@lifecycle.closeoutFinalized:Closeout finalized`,
  Cancelled: $localize`:@@lifecycle.cancelled:Cancelled`,
  ClosedForRetender: $localize`:@@lifecycle.closedForRetender:Closed for re-tender`,
});

export function tenderLifecycleLabel(step: string | null | undefined): string {
  return step ? (tenderLifecycleLabels()[step] ?? step) : '';
}

/** CF-078 (ADR-112): an invitation or reset email's delivery state, as the API reports it (never its recipient or link). */
export interface IdentityMailState {
  readonly status: 'Queued' | 'Sending' | 'Sent' | 'Failed' | 'Superseded';
  readonly failureCategory: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly queuedAtUtc: string;
  readonly nextAttemptAtUtc: string | null;
  readonly sentAtUtc: string | null;
}

export function identityMailLabel(state: IdentityMailState): string {
  const attempt = state.attempts;
  const max = state.maxAttempts;
  const reason = mailFailureLabel(state.failureCategory);
  switch (state.status) {
    case 'Sent':
      return $localize`:@@identityMail.sent:Invitation email accepted by the mail server`;
    case 'Failed':
      return $localize`:@@identityMail.failed:Invitation email not sent: ${reason}:reason:. Fix the mail server, then resend.`;
    case 'Sending':
      return $localize`:@@identityMail.sending:Invitation email being sent`;
    default:
      return attempt === 0
        ? $localize`:@@identityMail.queued:Invitation email queued`
        : $localize`:@@identityMail.retrying:Invitation email not sent yet (${reason}:reason:); retrying, attempt ${attempt}:attempt: of ${max}:max:`;
  }
}

/** Tender and email field keys, as ProblemDetails parameters name them. */
const tenderFieldLabels = (): Record<string, string> => ({
  title: $localize`:@@tenderField.title:Title`,
  scopeInstructions: $localize`:@@tenderField.scope:Scope and instructions`,
  currency: $localize`:@@tenderField.currency:Bid currency`,
  submissionDeadline: $localize`:@@tenderField.deadline:Submission deadline`,
  questionsDeadline: $localize`:@@tenderField.questionsDeadline:Questions deadline`,
  submissionInstructions: $localize`:@@tenderField.submissionInstructions:Submission instructions`,
  requiredDocuments: $localize`:@@tenderField.requiredDocuments:Required documents`,
  contactName: $localize`:@@tenderField.contactName:Procurement contact`,
  contactEmail: $localize`:@@tenderField.contactEmail:Contact email`,
  contactPhone: $localize`:@@tenderField.contactPhone:Contact phone`,
  timeZone: $localize`:@@tenderField.timeZone:Time zone`,
  emailLocale: $localize`:@@tenderField.emailLocale:Email language`,
  invitees: $localize`:@@tenderField.invitees:Invitees`,
  reason: $localize`:@@tenderField.reason:Reason`,
  recipientName: $localize`:@@tenderField.recipientName:Recipient name`,
  recipientEmail: $localize`:@@tenderField.recipientEmail:Recipient email`,
  comment: $localize`:@@tenderField.comment:Comment`,
  summary: $localize`:@@tenderField.addendumSummary:What changes and why`,
  newSubmissionDeadline: $localize`:@@tenderField.newDeadline:New submission deadline`,
  newDeadline: $localize`:@@tenderField.newDeadline:New submission deadline`,
  newQuestionsDeadline: $localize`:@@tenderField.newQuestionsDeadline:New questions deadline`,
  host: $localize`:@@mailField.host:Server host`,
  port: $localize`:@@mailField.port:Port`,
  security: $localize`:@@mailField.security:Connection security`,
  username: $localize`:@@mailField.username:User name`,
  password: $localize`:@@mailField.password:Password`,
  fromName: $localize`:@@mailField.fromName:Sender name`,
  fromAddress: $localize`:@@mailField.fromAddress:Sender address`,
  replyToAddress: $localize`:@@mailField.replyTo:Reply-to address`,
  recipient: $localize`:@@mailField.recipient:Test recipient`,
  subject: $localize`:@@templateField.subject:Subject`,
  body: $localize`:@@templateField.body:Body`,
});

export function tenderFieldLabel(key: string): string {
  return tenderFieldLabels()[key] ?? key;
}

/** A list of field keys ("a,b,c") as a localized, readable list. */
export function tenderFieldList(keys: string, locale: string): string {
  const labels = keys
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map(tenderFieldLabel);
  return formatList(labels, locale);
}

/**
 * A localized list ("a, b and c" / "a or b"), the one place list joins are formatted (CF-098). An engine without Intl.ListFormat
 * for the locale falls back to a comma-separated list.
 */
export function formatList(
  items: readonly string[],
  locale: string,
  type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction',
): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** S-ROLES (CF-101, CF-013): role names from the permission matrix, as one readable "A or B" list. */
export function roleList(roles: readonly string[], locale: string): string {
  return formatList(roles.map(tenantRoleLabel), locale, 'disjunction');
}

/**
 * Isolates a technical token (email, code, domain) inside a translated sentence so it keeps its own
 * left-to-right order in an Arabic paragraph: the text equivalent of `<bdi dir="ltr">`.
 */
export function ltr(value: string): string {
  return `\u2066${value}\u2069`;
}

/** Bid response field keys, as ProblemDetails parameters and the review list name them (Part 7). */
const bidFieldLabels = (): Record<string, string> => ({
  totalAmount: $localize`:@@bidField.totalAmount:Total bid amount`,
  lines: $localize`:@@bidField.lines:Price breakdown`,
  'lines.description': $localize`:@@bidField.lineDescription:Breakdown item`,
  'lines.amount': $localize`:@@bidField.lineAmount:Breakdown amount`,
  validityDays: $localize`:@@bidField.validityDays:Bid validity`,
  paymentTerms: $localize`:@@bidField.paymentTerms:Payment terms`,
  durationDays: $localize`:@@bidField.durationDays:Proposed duration`,
  warrantyMonths: $localize`:@@bidField.warrantyMonths:Warranty`,
  exclusions: $localize`:@@bidField.exclusions:Exclusions`,
  commercialDeviations: $localize`:@@bidField.commercialDeviations:Commercial deviations`,
  commercialNotes: $localize`:@@bidField.commercialNotes:Commercial notes`,
  scopeCompliance: $localize`:@@bidField.scopeCompliance:Scope compliance`,
  technicalApproach: $localize`:@@bidField.technicalApproach:Technical approach and methodology`,
  technicalDeviations: $localize`:@@bidField.technicalDeviations:Technical deviations`,
  technicalNotes: $localize`:@@bidField.technicalNotes:Technical notes`,
  draft: $localize`:@@bidField.draft:Bid draft`,
  itemRates: $localize`:@@bidField.itemRates:Price schedule rate`,
  // CF-091: the pricing-basis and requested-terms answers, as a negotiation scope refusal names them.
  pricing: $localize`:@@bidField.pricing:VAT basis answer`,
  terms: $localize`:@@bidField.terms:Answers to the requested terms`,
});

/** CF-004 (ADR-093): the price-schedule fields, for the editor, the import report and refusals. */
const scheduleFieldLabels = (): Record<string, string> => ({
  key: $localize`:@@scheduleField.key:Item code`,
  section: $localize`:@@scheduleField.section:Section`,
  description: $localize`:@@scheduleField.description:Description`,
  unit: $localize`:@@scheduleField.unit:Unit`,
  quantity: $localize`:@@scheduleField.quantity:Quantity`,
  type: $localize`:@@scheduleField.type:Item type`,
  provisionalAmount: $localize`:@@scheduleField.provisionalAmount:Provisional sum`,
  items: $localize`:@@scheduleField.items:Price schedule`,
});

export function scheduleFieldLabel(key: string): string {
  return scheduleFieldLabels()[key] ?? key;
}

/** CF-004: what a schedule item is. */
export function scheduleItemTypeLabel(type: string): string {
  switch (type) {
    case 'Measured':
      return $localize`:@@scheduleType.measured:Measured`;
    case 'ProvisionalSum':
      return $localize`:@@scheduleType.provisionalSum:Provisional sum`;
    case 'Optional':
      return $localize`:@@scheduleType.optional:Optional`;
    case 'RateOnly':
      return $localize`:@@scheduleType.rateOnly:Rate only`;
    default:
      return type;
  }
}

export function bidFieldLabel(key: string): string {
  return bidFieldLabels()[key] ?? key;
}

/** What the review step says is still missing, from the server's gap keys. */
export function bidGapLabel(
  key: string,
  index: number | null,
  requiredDocuments: readonly string[],
  scheduleKeys: readonly string[] = [],
): string {
  const item = index === null ? '' : String(index + 1);
  // CF-004: a schedule gap's index is the item's position in the tender's schedule; the item is named by its code.
  const code = ltr(index !== null ? (scheduleKeys[index] ?? item) : '');
  switch (key) {
    case 'itemUnpriced':
      return $localize`:@@bidGap.itemUnpriced:Enter a rate for price schedule item ${code}:item:.`;
    case 'itemAmountInexact':
      return $localize`:@@bidGap.itemAmountInexact:Item ${code}:item:: quantity × rate is not an exact amount in the tender currency. Adjust the rate — amounts are never rounded.`;
    case 'itemAmountTooLarge':
      return $localize`:@@bidGap.itemAmountTooLarge:Item ${code}:item:: the amount is larger than the product can hold.`;
    case 'itemUnknown':
      return $localize`:@@bidGap.itemUnknown:A rate refers to an item that is not in the tender's price schedule (or is entered twice).`;
    case 'scheduleTotal':
      return $localize`:@@bidGap.scheduleTotal:The total bid amount must equal the priced schedule plus your own breakdown lines.`;
    case 'totalAmount':
      return $localize`:@@bidGap.totalAmount:Enter the total bid amount.`;
    case 'lineIncomplete':
      return $localize`:@@bidGap.lineIncomplete:Complete breakdown item ${item}:item: (description and amount).`;
    case 'linesTotal':
      return $localize`:@@bidGap.linesTotal:The price breakdown does not add up to the total bid amount.`;
    case 'validityDays':
      return $localize`:@@bidGap.validityDays:State how long your bid stays valid.`;
    case 'validityDeviation':
      return $localize`:@@bidGap.validityDeviation:Your bid validity is shorter than the tender asks: explain it as a commercial deviation.`;
    case 'vatBasis':
      return $localize`:@@bidGap.vatBasis:Say whether your prices are on the tender's VAT basis.`;
    case 'vatBasisDeviation':
      return $localize`:@@bidGap.vatBasisDeviation:State the VAT treatment and rate your prices are on.`;
    case 'termRetention':
      return $localize`:@@bidGap.termRetention:Answer the requested retention percentage.`;
    case 'termAdvancePayment':
      return $localize`:@@bidGap.termAdvancePayment:Answer the requested advance payment percentage.`;
    case 'termPerformanceSecurity':
      return $localize`:@@bidGap.termPerformanceSecurity:Answer the requested performance security percentage.`;
    case 'termBidBond':
      return $localize`:@@bidGap.termBidBond:Say whether you provide the required bid bond.`;
    case 'durationDays':
      return $localize`:@@bidGap.durationDays:State your proposed duration: the tender requires one.`;
    case 'scopeCompliance':
      return $localize`:@@bidGap.scopeCompliance:Say whether your bid covers the full scope.`;
    case 'deviationExplanation':
      return $localize`:@@bidGap.deviationExplanation:You said the bid departs from the scope: list at least one exclusion or deviation.`;
    case 'technicalApproach':
      return $localize`:@@bidGap.technicalApproach:Describe your technical approach: the tender requires a technical proposal.`;
    case 'requiredDocument': {
      const document = index !== null ? (requiredDocuments[index] ?? '') : '';
      return $localize`:@@bidGap.requiredDocument:Attach the required document: ${ltr(document)}:document:.`;
    }
    case 'addendumAcknowledgement':
      // The index is the addendum's number itself, not a position.
      return $localize`:@@bidGap.addendumAcknowledgement:Acknowledge addendum ${String(index ?? '')}:number: (see "Tender updated").`;
    default:
      return $localize`:@@bidGap.other:Complete the bid.`;
  }
}
