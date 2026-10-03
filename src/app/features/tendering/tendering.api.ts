import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AddendumStatus,
  ClarificationStatus,
  ClarificationVisibility,
  DeclineReason,
  DeliveryAttemptStatus,
  DeliveryKind,
  InvitationDeliveryStatus,
  InvitationEventType,
  InvitationStatus,
  ReminderStatus,
  SubcontractorStatus,
  TenderDeadlineState,
  TenderStatus,
  TenderType,
} from '../../core/localization/labels';
import { browserTimeZone } from '../../core/localization/zoned-time';
import { problemMessage } from '../../core/localization/product-problem';
import { Paged } from '../subcontractors/subcontractors.api';

export type {
  AddendumStatus,
  ClarificationStatus,
  ClarificationVisibility,
  DeclineReason,
  DeliveryAttemptStatus,
  DeliveryKind,
  InvitationDeliveryStatus,
  InvitationEventType,
  InvitationStatus,
  ReminderStatus,
  TenderDeadlineState,
  TenderStatus,
  TenderType,
} from '../../core/localization/labels';

export const TENDER_PERMISSIONS = {
  view: 'Tenders.View',
  create: 'Tenders.Create',
  edit: 'Tenders.Edit',
  publish: 'Tenders.Publish',
  invitations: 'Tenders.ManageInvitations',
  cancel: 'Tenders.Cancel',
  clarifications: 'Tenders.ManageClarifications',
  draftAddenda: 'Tenders.DraftAddenda',
  issueAddenda: 'Tenders.IssueAddenda',
  extendDeadline: 'Tenders.ExtendDeadline',
  closeEarly: 'Tenders.CloseEarly',
} as const;

/** Part 8 text limits, as the server enforces them. */
export const QUESTION_MAX = 4000;
export const ANSWER_MAX = 8000;
export const ADDENDUM_TITLE_MAX = 200;
export const ADDENDUM_SUMMARY_MAX = 8000;

/** Tendering works on work packages, directory firms and the sourcing shortlist, so it needs all four. */
export const TENDERING_FEATURES: readonly string[] = [
  'tendering',
  'projects',
  'subcontractor_directory',
  'sourcing',
];

export const TENDER_TYPES: readonly TenderType[] = ['Rfq', 'Rfp'];
export const REMINDER_DAY_OPTIONS: readonly number[] = [1, 2, 3, 5, 7, 10, 14];
export const MAX_REMINDERS = 3;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const DECLINE_COMMENT_MAX = 500;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.dwg,.png,.jpg,.jpeg,.csv,.txt';
export const DECLINE_REASONS: readonly DeclineReason[] = [
  'NotInterested',
  'InsufficientCapacity',
  'TimelineTooShort',
  'OutsideScope',
  'LocationNotCovered',
  'CommercialTerms',
  'Other',
];

export interface TenderWorkPackage {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly projectStatus: string;
}

export interface TenderSummary {
  readonly id: string;
  readonly reference: string;
  readonly type: TenderType;
  readonly title: string;
  readonly status: TenderStatus;
  readonly deadlineState: TenderDeadlineState | null;
  readonly submissionDeadlineUtc: string | null;
  readonly timeZoneId: string;
  readonly workPackage: TenderWorkPackage;
  readonly invitationCount: number;
  readonly intendsToBidCount: number;
  readonly declinedCount: number;
  readonly failedDeliveryCount: number;
  readonly updatedAtUtc: string;
  /** CF-130 (ADR-097): the preparer marked the draft ready to publish. */
  readonly publishRequestedAtUtc?: string | null;
  /** CF-009: the stage from the tender's row, and for decision readers the finer step and the award in force. */
  readonly stage?: TenderStage;
  readonly lifecycle?: string | null;
  readonly awardId?: string | null;
  /** Red-team B-098-1 (CF-098): the deadline in the tender's own zone (local time and offset beside the UTC instant). */
  readonly submissionDeadline?: TenderLocalTime | null;
}

export type TenderStage =
  | 'Draft'
  | 'OpenForBids'
  | 'AwaitingOpening'
  | 'Opened'
  | 'Awarded'
  | 'Cancelled'
  | 'ClosedForRetender';

/** CF-015: the stage header's view of one tender (lifecycle: the finer step for decision readers, else the stage). */
export interface TenderStageView {
  readonly tenderId: string;
  readonly reference: string;
  readonly title: string;
  readonly stage: TenderStage;
  readonly lifecycle: string;
  readonly awardId: string | null;
}

export const TENDER_STAGES: readonly TenderStage[] = [
  'Draft',
  'OpenForBids',
  'AwaitingOpening',
  'Opened',
  'Awarded',
  'Cancelled',
  'ClosedForRetender',
];

/** A deadline in the tender's own zone ("2026-10-15T14:00", "+03:00") next to the stored UTC instant. */
export interface TenderLocalTime {
  readonly utc: string;
  readonly local: string;
  readonly offset: string;
}

export interface TenderDocument {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly uploadedByName: string;
  readonly uploadedAtUtc: string;
  readonly isRemoved: boolean;
}

export interface TenderReminder {
  readonly daysBefore: number;
  readonly dueAtUtc: string;
  readonly status: ReminderStatus;
  readonly processedAtUtc: string | null;
  readonly queuedCount: number;
  readonly skipReason: string | null;
}

export interface RecipientOption {
  readonly contactId: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly email: string | null;
  readonly isPrimary: boolean;
}

export interface ShortlistMember {
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
  readonly currentStanding: SubcontractorStatus;
  readonly alreadyInvited: boolean;
  readonly contacts: readonly RecipientOption[];
}

export interface TenderShortlist {
  readonly approvalId: string;
  readonly round: number;
  readonly approvedAtUtc: string;
  readonly approvedByName: string;
  readonly members: readonly ShortlistMember[];
  /** CF-057 (ADR-098 / OD-10): approved on the low-value fast path. */
  readonly fastPath?: boolean | null;
}

export interface TenderOrigin {
  readonly templateId: string | null;
  readonly templateName: string | null;
  readonly templateVersion: number | null;
  readonly clonedFromTenderId: string | null;
  readonly clonedFromReference: string | null;
}

/** CF-084 (ADR-098): a company tender template and its versions, newest first. */
export interface TenderTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly currentVersion: number;
  readonly versions: readonly TenderTemplateVersion[];
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface TenderTemplateVersion {
  readonly number: number;
  readonly createdAtUtc: string;
  readonly createdByName: string;
  readonly sourceTenderReference: string | null;
  readonly type: TenderType;
  readonly title: string;
  readonly requiredDocuments: number;
  readonly documents: number;
  readonly scheduleItems: number;
  readonly hasPricing: boolean;
  readonly hasTerms: boolean;
}

/** CF-058 (ADR-102, OD-11): a bid received outside the portal, recorded with an attestation and confirmed by a second user. */
export type OutsideBidChannel = 'Email' | 'HandDelivered' | 'Courier' | 'Other';

export interface OutsideBidIntake {
  readonly id: string;
  readonly invitationId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly bidReference: string;
  readonly revisionNumber: number;
  readonly channel: OutsideBidChannel;
  readonly receivedAtUtc: string;
  readonly attestation: string;
  readonly recordedByName: string;
  readonly recordedAtUtc: string;
  readonly confirmedByName: string | null;
  readonly confirmedAtUtc: string | null;
  readonly canConfirm: boolean;
  /** Re-audit R-06: null once confirmed and until the opening — sealed like any bid. */
  readonly content: {
    readonly totalAmount: string | null;
    readonly validityDays: number | null;
    readonly durationDays: number | null;
  } | null;
  readonly files: readonly {
    readonly id: string;
    readonly fileName: string;
    readonly sizeBytes: number;
    readonly requirementLabel: string | null;
    readonly sha256: string;
  }[];
  readonly sealed: boolean;
  readonly version: string;
}

export interface OutsideBids {
  readonly enabled: boolean;
  readonly canRecord: boolean;
  readonly intakes: readonly OutsideBidIntake[];
}

export type InviteSkipReason = 'not_active' | 'no_contact';

export interface InviteAllResult {
  readonly tender: TenderDetail;
  readonly skipped: readonly {
    readonly subcontractorCode: string;
    readonly reason: InviteSkipReason;
  }[];
}

export interface TenderInvitation {
  readonly id: string;
  readonly subcontractorId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly currentStanding: SubcontractorStatus | null;
  readonly onApprovedShortlist: boolean;
  readonly contactId: string;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly status: InvitationStatus;
  readonly expired: boolean;
  readonly deliveryStatus: InvitationDeliveryStatus;
  readonly lastFailureCategory: string | null;
  readonly issuedAtUtc: string | null;
  readonly lastSentAtUtc: string | null;
  readonly sentCount: number;
  readonly reminderCount: number;
  readonly firstOpenedAtUtc: string | null;
  readonly lastOpenedAtUtc: string | null;
  readonly openCount: number;
  readonly respondedAtUtc: string | null;
  readonly declineReason: DeclineReason | null;
  readonly declineComment: string | null;
  readonly revokedAtUtc: string | null;
  readonly revokedByName: string | null;
  readonly revocationReason: string | null;
  readonly tokenGeneration: number;
  readonly hasActiveLink: boolean;
  readonly sourcingApprovalRound: number | null;
  readonly canResend: boolean;
  readonly canRemind: boolean;
  readonly canRevoke: boolean;
  readonly canRegenerate: boolean;
  readonly canChangeRecipient: boolean;
  readonly version: string;
  /** Copying yields the view-only link: it shows the invitation, never answers or bids (ADR-054). */
  readonly canCopyLink: boolean;
  /** An earlier version showed a user the firm's own link; it only views until replaced. */
  readonly firmLinkShown: boolean;
  /** CF-058 part 2 (ADR-103): a second contact of the firm with its own emailed link (never shown). */
  readonly secondRecipient?: {
    readonly contactId: string;
    readonly name: string;
    readonly email: string;
    readonly linkIssued: boolean;
    readonly addedAtUtc: string;
  } | null;
}

export interface TenderCounts {
  readonly total: number;
  readonly queued: number;
  readonly sent: number;
  readonly failed: number;
  readonly opened: number;
  readonly intendsToBid: number;
  readonly declined: number;
  readonly noResponse: number;
  readonly revoked: number;
  readonly bidStarted?: number;
  readonly bidSubmitted?: number;
}

export interface TenderDetail {
  readonly id: string;
  readonly reference: string;
  readonly type: TenderType;
  readonly status: TenderStatus;
  readonly lockReason: string | null;
  readonly deadlineState: TenderDeadlineState | null;
  readonly workPackage: TenderWorkPackage;
  readonly title: string;
  readonly scopeInstructions: string | null;
  readonly currency: string | null;
  readonly bidValidityDays: number | null;
  readonly technicalProposalRequired: boolean;
  /** CF-053 (ADR-090): bidders must state a proposed duration. */
  readonly durationRequired: boolean;
  /** CF-055 (ADR-092): the pricing basis, the requested terms, and whether the company requires a basis before publication. */
  readonly pricing: TenderPricing | null;
  readonly terms: TenderTerms | null;
  readonly pricingBasisRequired: boolean;
  /** CF-004 (ADR-093): the price schedule in force (the draft's before publication); null for a lump-sum tender. */
  readonly schedule?: readonly ScheduleItem[] | null;
  /** CF-130 (ADR-097): ready-to-publish marker and whether four eyes apply. */
  readonly publishRequestedAtUtc?: string | null;
  readonly publishRequestedByName?: string | null;
  readonly requireIndependentPublish?: boolean;
  /** CF-057 / CF-084 (ADR-098): the template version or earlier tender this draft was made from. */
  readonly origin?: TenderOrigin | null;
  /** CF-086 (ADR-101): the company's shortest bid period (publication refused below it) and the period under which it warns. */
  readonly minimumBidPeriodHours?: number;
  readonly normalBidPeriodDays?: number;
  /** CF-040 (ADR-105): the declared criteria (pinned once published), whether the company requires them, and a draft's options. */
  readonly criteria?: TenderCriteria | null;
  readonly criteriaRequired?: boolean;
  readonly criteriaOptions?: CriteriaOptions | null;
  readonly requiredDocuments: readonly string[];
  readonly submissionInstructions: string | null;
  readonly submissionDeadline: TenderLocalTime | null;
  readonly originalSubmissionDeadline: TenderLocalTime | null;
  readonly questionsDeadline: TenderLocalTime | null;
  readonly timeZoneId: string;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly emailLocale: 'en' | 'ar';
  readonly reminderDays: readonly number[];
  readonly reminders: readonly TenderReminder[];
  readonly missingForPublication: readonly string[];
  readonly documents: readonly TenderDocument[];
  readonly invitations: readonly TenderInvitation[];
  readonly counts: TenderCounts;
  readonly approvedShortlist: TenderShortlist | null;
  readonly currentRevision: number;
  readonly publishedAtUtc: string | null;
  readonly publishedByName: string | null;
  readonly sourcingApprovalRound: number | null;
  readonly cancelledAtUtc: string | null;
  readonly cancelledByName: string | null;
  readonly cancellationReason: string | null;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** Every move of the deadline after publication, oldest first (Part 8). */
  readonly deadlineExtensions?: readonly DeadlineExtension[] | null;
  /** Part 9: how and when the tender stopped accepting responses; null while it is open. */
  readonly closure?: TenderClosure | null;
  /** Part 9: issued, not revoked invitations and how many of those firms submitted (what an early close warns about). */
  readonly closureCounts?: TenderClosureCounts | null;
  /** Part 10: when the award was issued (the tender is then read-only); null or absent before. */
  readonly awardedAtUtc?: string | null;
  /** CF-009: the award in force (its pages check their own permission) and the tender's stage. */
  readonly awardId?: string | null;
  readonly stage?: TenderStage;
}

export type TenderClosureKind = 'Deadline' | 'Early';

export interface TenderClosure {
  readonly kind: TenderClosureKind;
  readonly closedAt: TenderLocalTime;
  readonly scheduledDeadline: TenderLocalTime;
  readonly closedByName: string | null;
  readonly reason: string | null;
  readonly bidsOpenedAtUtc: string | null;
}

export interface TenderClosureCounts {
  readonly invited: number;
  readonly submitted: number;
  readonly notSubmitted: number;
}

export interface DeadlineExtension {
  readonly previous: TenderLocalTime;
  readonly new: TenderLocalTime;
  readonly previousQuestions: TenderLocalTime | null;
  readonly newQuestions: TenderLocalTime | null;
  readonly reason: string;
  readonly reopenedAfterClose: boolean;
  readonly addendumNumber: number | null;
  readonly extendedAtUtc: string;
  readonly extendedByName: string;
}

/** One entry of the clarification log, as the buyer's team sees it (the firm that asked is internal only). */
export interface Clarification {
  readonly id: string;
  readonly reference: string;
  readonly number: number;
  readonly invitationId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly askedByName: string;
  readonly question: string;
  readonly askedAtUtc: string;
  readonly tenderRevision: number;
  readonly status: ClarificationStatus;
  readonly visibility: ClarificationVisibility | null;
  readonly answer: string | null;
  readonly answeredAtUtc: string | null;
  readonly answeredByName: string | null;
  readonly publishedQuestion: string | null;
  readonly publishedAtUtc: string | null;
  readonly publishedByName: string | null;
  readonly canAnswer: boolean;
  readonly canPublish: boolean;
  readonly version: string;
}

export interface TenderClarifications {
  readonly total: number;
  readonly open: number;
  readonly answeredPrivately: number;
  readonly published: number;
  readonly items: readonly Clarification[];
}

export interface AddendumDocument {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly replacesDocumentId: string | null;
  readonly replacesFileName: string | null;
  readonly uploadedAtUtc: string;
}

export interface RevisionDocument {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly addedInRevision: number;
  readonly replacesDocumentId: string | null;
}

export interface WithdrawnDocument {
  readonly id: string;
  readonly fileName: string;
  readonly replacedById: string | null;
}

export interface AddendumAcknowledgement {
  readonly invitationId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly invitationStatus: InvitationStatus;
  readonly expected: boolean;
  readonly acknowledgedAtUtc: string | null;
  readonly acknowledgedByName: string | null;
}

export interface Addendum {
  readonly id: string;
  readonly status: AddendumStatus;
  readonly number: number | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly acknowledgementRequired: boolean;
  readonly newSubmissionDeadline: TenderLocalTime | null;
  readonly newQuestionsDeadline: TenderLocalTime | null;
  readonly previousSubmissionDeadline: TenderLocalTime | null;
  readonly withdrawnDocumentIds: readonly string[];
  readonly documents: readonly AddendumDocument[];
  readonly withdrawn: readonly WithdrawnDocument[];
  readonly baseRevision: number | null;
  readonly resultingRevision: number | null;
  readonly issuedAtUtc: string | null;
  readonly issuedByName: string | null;
  readonly createdByName: string;
  readonly updatedAtUtc: string;
  readonly acknowledgedCount: number;
  readonly acknowledgementExpected: number;
  readonly acknowledgements: readonly AddendumAcknowledgement[];
  readonly missingForIssue: readonly string[];
  readonly version: string;
  /** CF-004: the price schedule this addendum puts in force (null = unchanged). */
  readonly schedule?: readonly ScheduleItem[] | null;
}

export interface TenderAddenda {
  readonly currentRevision: number;
  readonly draft: Addendum | null;
  readonly issued: readonly Addendum[];
  readonly currentDocuments: readonly RevisionDocument[];
  readonly canDraft: boolean;
  readonly canExtend: boolean;
  readonly tenderVersion: string;
}

/** A draft addendum as the screen sends it. Dates are local times in the tender's zone. */
export interface AddendumInput {
  readonly title: string | null;
  readonly summary: string | null;
  readonly acknowledgementRequired: boolean;
  readonly newSubmissionDeadlineLocal: string | null;
  readonly newQuestionsDeadlineLocal: string | null;
  readonly withdrawnDocumentIds: readonly string[];
  /** CF-004: a replacement price schedule; absent or null leaves the schedule in force unchanged. */
  readonly schedule?: readonly ScheduleItemInputDto[] | null;
}

/** The whole editable draft, as the builder sends it. Dates are local times in {@link timeZoneId}. */
export interface TenderDraftInput {
  readonly type: TenderType;
  readonly title: string;
  readonly scopeInstructions: string | null;
  readonly bidValidityDays: number | null;
  readonly technicalProposalRequired: boolean;
  readonly durationRequired: boolean;
  /** CF-055: a pricing with no treatment, or terms asking nothing, clears them. */
  readonly pricing: {
    treatment: VatTreatment | null;
    vatRatePercent: string | null;
    note: string | null;
  };
  readonly terms: TenderTerms;
  /** CF-040: the declared policies (none clears) and whether bidders see the criteria. */
  readonly criteria?: {
    evaluationPolicyId: string | null;
    recommendationPolicyId: string | null;
    disclosed: boolean;
  };
  readonly requiredDocuments: readonly string[];
  readonly submissionInstructions: string | null;
  readonly submissionDeadlineLocal: string | null;
  readonly questionsDeadlineLocal: string | null;
  readonly timeZoneId: string;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly emailLocale: 'en' | 'ar';
  readonly reminderDays: readonly number[];
  /** CF-004 (ADR-093): the whole price schedule; an empty list makes the tender lump sum. */
  readonly schedule?: readonly ScheduleItemInputDto[];
}

/** One invited firm's bid as the buyer sees it before evaluation: a receipt, never the amounts or content. */
export interface TenderBidReceipt {
  readonly invitationId: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly invitationStatus: InvitationStatus;
  readonly bidReference: string | null;
  readonly bidStatus: 'Draft' | 'Submitted' | 'Withdrawn' | null;
  readonly startedAtUtc: string | null;
  readonly submittedAtUtc: string | null;
  readonly revisionNumber: number;
  readonly submittedAttachmentCount: number | null;
  readonly contentSha256: string | null;
  /** The tender revision the submission answered (Part 8). */
  readonly answeredTenderRevision?: number | null;
  /** An addendum revised the tender after this submission. */
  readonly tenderRevisedSince?: boolean;
  /** CF-069 (ADR-101): whether the receipt email of the latest submission went out (never its content). */
  readonly receiptEmailStatus?:
    'Queued' | 'Sending' | 'Sent' | 'Failed' | 'Cancelled' | 'Held' | null;
  /** CF-058 (ADR-102): the bid in force was recorded by the buyer from a bid received outside the portal. */
  readonly outsidePortal?: boolean;
}

export interface TenderBids {
  readonly invited: number;
  /** Draft bids not yet submitted. */
  readonly inProgress: number;
  readonly submitted: number;
  /** Always true in this release: bid content opens with evaluation, under its own permissions. */
  readonly contentSealed: boolean;
  readonly receipts: readonly TenderBidReceipt[];
  readonly currentRevision?: number;
  /** Red-team B-085-1 (CF-085): drafts left by a firm that then declined or whose invitation was revoked (never in progress). */
  readonly draftsOfDeclinedFirms?: number;
}

export interface InvitationLink {
  readonly url: string;
  readonly tokenGeneration: number;
  readonly expiresAtUtc: string | null;
}

export interface InvitationDelivery {
  readonly id: string;
  readonly kind: DeliveryKind;
  readonly status: DeliveryAttemptStatus;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly locale: string;
  readonly templateKey: string | null;
  readonly templateVersion: number | null;
  readonly subject: string | null;
  readonly senderSource: 'Platform' | 'Company' | null;
  readonly fromAddress: string | null;
  readonly failureCategory: string | null;
  readonly queuedAtUtc: string;
  readonly attemptedAtUtc: string | null;
  readonly completedAtUtc: string | null;
  readonly requestedByName: string;
}

export interface InvitationEvent {
  readonly id: string;
  readonly type: InvitationEventType;
  readonly actorKind: 'User' | 'Bidder' | 'System';
  readonly actorName: string;
  readonly occurredAtUtc: string;
  readonly detail: string | null;
}

export interface InvitationActivity {
  readonly invitation: TenderInvitation;
  readonly events: readonly InvitationEvent[];
  readonly deliveries: readonly InvitationDelivery[];
}

export interface TenderEmailPreview {
  readonly templateKey: string;
  readonly locale: string;
  readonly templateVersion: number;
  readonly subject: string;
  readonly textBody: string;
  readonly fromName: string | null;
  readonly fromAddress: string | null;
  readonly replyToAddress: string | null;
  readonly senderSource: 'Platform' | 'Company' | null;
  readonly senderReady: boolean;
  readonly senderProblem: string | null;
}

/**
 * The tendering HTTP surface. Every mutation sends the version the screen shows and returns the whole
 * refreshed tender, so the screen always holds exactly what the server decided.
 */
@Injectable({ providedIn: 'root' })
export class TenderingApi {
  private readonly http = inject(HttpClient);

  list(
    options: {
      status?: readonly TenderStatus[];
      stage?: readonly TenderStage[];
      search?: string;
      page?: number;
    } = {},
  ): Observable<Paged<TenderSummary>> {
    let params = new HttpParams();
    for (const status of options.status ?? []) params = params.append('status', status);
    for (const stage of options.stage ?? []) params = params.append('stage', stage);
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    if (options.page) params = params.set('page', options.page);
    return this.http.get<Paged<TenderSummary>>('/api/v1/tenders', { params });
  }

  forWorkPackage(workPackageId: string): Observable<Paged<TenderSummary>> {
    return this.http.get<Paged<TenderSummary>>('/api/v1/tenders', {
      params: new HttpParams().set('workPackageId', workPackageId),
    });
  }

  get(id: string): Observable<TenderDetail> {
    return this.http.get<TenderDetail>(this.url(id));
  }

  /** CF-015: where the tender is, as its list row says it. */
  stage(id: string): Observable<TenderStageView> {
    return this.http.get<TenderStageView>(`${this.url(id)}/stage`);
  }

  bids(id: string): Observable<TenderBids> {
    return this.http.get<TenderBids>(`${this.url(id)}/bids`);
  }

  create(workPackageId: string, type: TenderType, locale: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>('/api/v1/tenders', {
      workPackageId,
      type,
      title: null,
      timeZoneId: browserTimeZone(),
      emailLocale: locale === 'ar' ? 'ar' : 'en',
    });
  }

  /** CF-057: a new draft for another work package with this tender's content (and, by default, its documents). */
  clone(id: string, workPackageId: string, includeDocuments: boolean): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/clone`, {
      workPackageId,
      includeDocuments,
    });
  }

  /** CF-084: a new draft from a template's current version. */
  createFromTemplate(templateId: string, workPackageId: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>('/api/v1/tenders/from-template', {
      templateId,
      workPackageId,
    });
  }

  /** CF-057: invite every approved, Active firm of the shortlist in force with its primary contact. */
  inviteAllShortlisted(id: string, version: string): Observable<InviteAllResult> {
    return this.http.post<InviteAllResult>(`${this.url(id)}/invitees/all-shortlisted`, { version });
  }

  templates(): Observable<readonly TenderTemplate[]> {
    return this.http.get<readonly TenderTemplate[]>('/api/v1/tender-templates');
  }

  /** CF-084: saves the tender's content as a new template, or with templateId as that template's next version. */
  saveTemplate(request: {
    tenderId: string;
    name: string | null;
    description: string | null;
    includeDocuments: boolean;
    templateId?: string;
    version?: string;
  }): Observable<TenderTemplate> {
    return this.http.post<TenderTemplate>('/api/v1/tender-templates', request);
  }

  updateTemplate(
    id: string,
    request: {
      name: string | null;
      description: string | null;
      isActive: boolean;
      version: string;
    },
  ): Observable<TenderTemplate> {
    return this.http.put<TenderTemplate>(
      `/api/v1/tender-templates/${encodeURIComponent(id)}`,
      request,
    );
  }

  /** CF-058 (ADR-102): the tender's bids received outside the portal (content only for those who record or confirm them). */
  outsideBids(id: string): Observable<OutsideBids> {
    return this.http.get<OutsideBids>(`${this.url(id)}/outside-bids`);
  }

  recordOutsideBid(id: string, form: FormData): Observable<OutsideBids> {
    return this.http.post<OutsideBids>(`${this.url(id)}/outside-bids`, form);
  }

  confirmOutsideBid(id: string, intakeId: string, version: string): Observable<OutsideBids> {
    return this.http.post<OutsideBids>(
      `${this.url(id)}/outside-bids/${encodeURIComponent(intakeId)}/confirm`,
      { version },
    );
  }

  outsideBidFileUrl(id: string, intakeId: string, fileId: string): string {
    return `${this.url(id)}/outside-bids/${encodeURIComponent(intakeId)}/files/${encodeURIComponent(fileId)}`;
  }

  /** CF-004: a dry run of a price-schedule file (XLSX or UTF-8 CSV); nothing is written. */
  importSchedule(id: string, file: File): Observable<ScheduleImport> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ScheduleImport>(`${this.url(id)}/schedule/import`, form);
  }

  scheduleTemplateUrl(id: string): string {
    return `${this.url(id)}/schedule/template`;
  }

  /** CF-130: the preparer marks a complete draft ready to publish. */
  requestPublish(id: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/request-publish`, { version });
  }

  update(id: string, draft: TenderDraftInput, version: string): Observable<TenderDetail> {
    return this.http.put<TenderDetail>(this.url(id), { ...draft, version });
  }

  addInvitee(
    id: string,
    subcontractorId: string,
    contactId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/invitees`, {
      subcontractorId,
      contactId,
      version,
    });
  }

  changeDraftRecipient(
    id: string,
    invitationId: string,
    contactId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.put<TenderDetail>(`${this.invitee(id, invitationId)}/recipient`, {
      contactId,
      version,
    });
  }

  removeInvitee(id: string, invitationId: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.invitee(id, invitationId)}/remove`, { version });
  }

  uploadDocument(id: string, file: File, version: string): Observable<TenderDetail> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('version', version);
    return this.http.post<TenderDetail>(`${this.url(id)}/documents`, form);
  }

  removeDocument(id: string, documentId: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(
      `${this.url(id)}/documents/${encodeURIComponent(documentId)}/remove`,
      { version },
    );
  }

  documentUrl(id: string, documentId: string): string {
    return `${this.url(id)}/documents/${encodeURIComponent(documentId)}/content`;
  }

  emailPreview(id: string, kind: 'invitation' | 'reminder'): Observable<TenderEmailPreview> {
    return this.http.get<TenderEmailPreview>(`${this.url(id)}/email-preview`, {
      params: new HttpParams().set('kind', kind),
    });
  }

  publish(id: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/publish`, { version });
  }

  cancel(id: string, reason: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/cancel`, { reason, version });
  }

  /** CF-060 (ADR-137): on a plan without award, an opened, evaluated tender ends without an award (frees its slot; no bidder is emailed). */
  closeWithoutAward(id: string, reason: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/close-for-retender`, { reason, version });
  }

  invite(
    id: string,
    subcontractorId: string,
    contactId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/invitations`, {
      subcontractorId,
      contactId,
      version,
    });
  }

  resend(id: string, invitationId: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.invitation(id, invitationId)}/resend`, { version });
  }

  remind(id: string, invitationId: string, version: string): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.invitation(id, invitationId)}/remind`, { version });
  }

  revoke(
    id: string,
    invitationId: string,
    reason: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.invitation(id, invitationId)}/revoke`, {
      reason,
      version,
    });
  }

  regenerate(
    id: string,
    invitationId: string,
    version: string,
    sendEmail: boolean,
  ): Observable<{ tender: TenderDetail; link: InvitationLink }> {
    return this.http.post<{ tender: TenderDetail; link: InvitationLink }>(
      `${this.invitation(id, invitationId)}/regenerate-link`,
      { version, sendEmail },
    );
  }

  changeRecipient(
    id: string,
    invitationId: string,
    contactId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.put<TenderDetail>(`${this.invitation(id, invitationId)}/recipient`, {
      contactId,
      version,
    });
  }

  /** CF-058 part 2 (ADR-103): names (or replaces) the invitation's second recipient; once published its own link is emailed. */
  setSecondRecipient(
    id: string,
    invitationId: string,
    contactId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.put<TenderDetail>(`${this.invitation(id, invitationId)}/second-recipient`, {
      contactId,
      version,
    });
  }

  removeSecondRecipient(
    id: string,
    invitationId: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(
      `${this.invitation(id, invitationId)}/second-recipient/remove`,
      { version },
    );
  }

  copyLink(id: string, invitationId: string): Observable<InvitationLink> {
    return this.http.post<InvitationLink>(`${this.invitation(id, invitationId)}/link`, {});
  }

  activity(id: string, invitationId: string): Observable<InvitationActivity> {
    return this.http.get<InvitationActivity>(`${this.invitation(id, invitationId)}/activity`);
  }

  // ------------------------------------------------------------ Part 9

  /** Stops accepting responses before the deadline. The count the buyer confirmed must still be true. */
  closeEarly(
    id: string,
    reason: string,
    notSubmittedCount: number,
    requestKey: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/close-early`, {
      reason,
      confirmed: true,
      notSubmittedCount,
      requestKey,
      version,
    });
  }

  // ------------------------------------------------------------ Part 8

  extendDeadline(
    id: string,
    input: { newDeadlineLocal: string; newQuestionsDeadlineLocal: string | null; reason: string },
    idempotencyKey: string,
    version: string,
  ): Observable<TenderDetail> {
    return this.http.post<TenderDetail>(`${this.url(id)}/deadline-extensions`, {
      ...input,
      idempotencyKey,
      version,
    });
  }

  clarifications(id: string): Observable<TenderClarifications> {
    return this.http.get<TenderClarifications>(`${this.url(id)}/clarifications`);
  }

  answer(
    id: string,
    clarificationId: string,
    answer: string,
    visibility: ClarificationVisibility,
    publishedQuestion: string | null,
    version: string,
  ): Observable<TenderClarifications> {
    return this.http.post<TenderClarifications>(
      `${this.url(id)}/clarifications/${encodeURIComponent(clarificationId)}/answer`,
      { answer, visibility, publishedQuestion, version },
    );
  }

  publishClarification(
    id: string,
    clarificationId: string,
    publishedQuestion: string | null,
    version: string,
  ): Observable<TenderClarifications> {
    return this.http.post<TenderClarifications>(
      `${this.url(id)}/clarifications/${encodeURIComponent(clarificationId)}/publish`,
      { publishedQuestion, version },
    );
  }

  addenda(id: string): Observable<TenderAddenda> {
    return this.http.get<TenderAddenda>(`${this.url(id)}/addenda`);
  }

  createAddendum(id: string, input: AddendumInput): Observable<TenderAddenda> {
    return this.http.post<TenderAddenda>(`${this.url(id)}/addenda`, { ...input, version: null });
  }

  updateAddendum(
    id: string,
    addendumId: string,
    input: AddendumInput,
    version: string,
  ): Observable<TenderAddenda> {
    return this.http.put<TenderAddenda>(this.addendum(id, addendumId), { ...input, version });
  }

  uploadAddendumDocument(
    id: string,
    addendumId: string,
    file: File,
    replacesDocumentId: string | null,
    version: string,
  ): Observable<TenderAddenda> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('version', version);
    if (replacesDocumentId) form.append('replacesDocumentId', replacesDocumentId);
    return this.http.post<TenderAddenda>(`${this.addendum(id, addendumId)}/documents`, form);
  }

  removeAddendumDocument(
    id: string,
    addendumId: string,
    documentId: string,
    version: string,
  ): Observable<TenderAddenda> {
    return this.http.post<TenderAddenda>(
      `${this.addendum(id, addendumId)}/documents/${encodeURIComponent(documentId)}/remove`,
      { version },
    );
  }

  discardAddendum(id: string, addendumId: string, version: string): Observable<TenderAddenda> {
    return this.http.post<TenderAddenda>(`${this.addendum(id, addendumId)}/discard`, { version });
  }

  issueAddendum(
    id: string,
    addendumId: string,
    version: string,
    tenderVersion: string,
  ): Observable<TenderAddenda> {
    return this.http.post<TenderAddenda>(`${this.addendum(id, addendumId)}/issue`, {
      version,
      tenderVersion,
    });
  }

  private addendum(id: string, addendumId: string): string {
    return `${this.url(id)}/addenda/${encodeURIComponent(addendumId)}`;
  }

  private url(id: string): string {
    return `/api/v1/tenders/${encodeURIComponent(id)}`;
  }

  private invitee(id: string, invitationId: string): string {
    return `${this.url(id)}/invitees/${encodeURIComponent(invitationId)}`;
  }

  private invitation(id: string, invitationId: string): string {
    return `${this.url(id)}/invitations/${encodeURIComponent(invitationId)}`;
  }
}

/** One resolution order for every tender screen: known code, then localized fallback. */
export function tenderProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}

/** Someone else changed the tender or invitation since this screen loaded it. */
export function isStale(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 409 &&
    typeof error.error === 'object' &&
    (error.error?.code === 'concurrency.stale' || error.error?.code === 'concurrency.retry')
  );
}

/** Time zones the host can resolve, browser-supplied, with the tender's own always offered. */
export function timeZoneOptions(current: string): readonly string[] {
  const common = [
    'Asia/Riyadh',
    'Asia/Dubai',
    'Asia/Qatar',
    'Asia/Kuwait',
    'Asia/Bahrain',
    'Asia/Muscat',
    'Africa/Cairo',
    'Asia/Amman',
    'Africa/Casablanca',
    'Africa/Lagos',
    'Africa/Nairobi',
    'Europe/London',
    'UTC',
  ];
  let all: string[] = [];
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    all = supported ? supported('timeZone') : [];
  } catch {
    all = [];
  }
  const merged = new Set([current, browserTimeZone(), ...common, ...all].filter(Boolean));
  return [...merged];
}

// CF-098: the formatting itself lives in core/localization; these names stay for the features that import them from here.
export {
  fileSize,
  tenderLocalTime as describeLocal,
} from '../../core/localization/business-format';
export { browserTimeZone } from '../../core/localization/zoned-time';

/** CF-055 (ADR-092): how a tender's prices treat VAT. */
export type VatTreatment = 'ExclusiveOfVat' | 'InclusiveOfVat' | 'NotApplicable';
export const VAT_TREATMENTS: readonly VatTreatment[] = [
  'ExclusiveOfVat',
  'InclusiveOfVat',
  'NotApplicable',
];

/** CF-055: a tender's VAT basis (percent with two decimals; none when VAT does not apply). */
export interface TenderPricing {
  readonly treatment: VatTreatment;
  readonly vatRatePercent: string | null;
  readonly note: string | null;
}

/** CF-055: the commercial conditions every bid answers. */
export interface TenderTerms {
  readonly retentionPercent: string | null;
  readonly advancePaymentPercent: string | null;
  readonly performanceSecurityPercent: string | null;
  readonly bidBondRequired: boolean;
  readonly paymentTermsNote: string | null;
}

/** CF-004 (ADR-093): what a price-schedule item is. */
export type ScheduleItemType = 'Measured' | 'ProvisionalSum' | 'Optional' | 'RateOnly';
export const SCHEDULE_ITEM_TYPES: readonly ScheduleItemType[] = [
  'Measured',
  'ProvisionalSum',
  'Optional',
  'RateOnly',
];
/** The most items a schedule (and a bid's rates) may hold — the server's limit. */
export const MAX_SCHEDULE_ITEMS = 500;
/** Quantities have at most three decimals and rates at most six; neither is ever rounded. */
export const QUANTITY_DECIMALS = 3;
export const RATE_DECIMALS = 6;

/** CF-004: one item of a buyer-issued price schedule; numbers are exact text. */
export interface ScheduleItem {
  readonly key: string;
  readonly section: string | null;
  readonly description: string;
  readonly unit: string | null;
  readonly quantity: string | null;
  readonly type: ScheduleItemType;
  readonly provisionalAmount: string | null;
}

/** An item as the editor holds and sends it (every field as typed; the server judges it). */
export interface ScheduleItemInput {
  key: string;
  section: string;
  description: string;
  unit: string;
  quantity: string;
  type: ScheduleItemType;
  provisionalAmount: string;
}

export interface ScheduleImportIssue {
  readonly row: number | null;
  readonly code: string;
  readonly column: string | null;
  readonly parameters: Readonly<Record<string, string>> | null;
}

/** The dry run of a schedule file: nothing is applied until the reviewed items are saved. */
export interface ScheduleImport {
  readonly sha256: string;
  readonly rows: number;
  readonly items: readonly ScheduleItemInputDto[];
  readonly issues: readonly ScheduleImportIssue[];
  readonly canApply: boolean;
}

export interface ScheduleItemInputDto {
  readonly key: string | null;
  readonly section: string | null;
  readonly description: string | null;
  readonly unit: string | null;
  readonly quantity: string | null;
  readonly type: ScheduleItemType | null;
  readonly provisionalAmount: string | null;
}

export function scheduleInput(item: ScheduleItem | ScheduleItemInputDto): ScheduleItemInput {
  return {
    key: item.key ?? '',
    section: item.section ?? '',
    description: item.description ?? '',
    unit: item.unit ?? '',
    quantity: item.quantity ?? '',
    type: item.type ?? 'Measured',
    provisionalAmount: item.provisionalAmount ?? '',
  };
}

/** What the server receives: blanks as null; the quantity and sum only where the item type has them. */
export function scheduleRequest(items: readonly ScheduleItemInput[]): ScheduleItemInputDto[] {
  const text = (value: string) => (value.trim() ? value.trim() : null);
  return items.map((item) => ({
    key: text(item.key),
    section: text(item.section),
    description: text(item.description),
    unit: text(item.unit),
    quantity: item.type === 'Measured' || item.type === 'Optional' ? text(item.quantity) : null,
    type: item.type,
    provisionalAmount: item.type === 'ProvisionalSum' ? text(item.provisionalAmount) : null,
  }));
}

export interface BidPricingAnswer {
  readonly confirmed: boolean;
  readonly treatment: VatTreatment | null;
  readonly vatRatePercent: string | null;
}

export interface BidTermsAnswer {
  readonly retentionPercent: string | null;
  readonly advancePaymentPercent: string | null;
  readonly performanceSecurityPercent: string | null;
  readonly bidBondProvided: boolean | null;
}

/** CF-040 (ADR-105): one declared criterion — a technical criterion's name, or a recommendation criterion's kind — and its weight. */
export interface DeclaredCriterion {
  readonly name: string;
  readonly category: string | null;
  readonly weight: number;
}

export interface TenderCriteria {
  readonly evaluationPolicyId: string | null;
  readonly evaluationPolicyName: string | null;
  readonly evaluationPolicyVersionNumber: number | null;
  readonly recommendationPolicyId: string | null;
  readonly recommendationPolicyName: string | null;
  readonly recommendationPolicyVersionNumber: number | null;
  readonly disclosed: boolean;
  readonly pinned: boolean;
  readonly technicalCriteria: readonly DeclaredCriterion[];
  readonly recommendationCriteria: readonly DeclaredCriterion[];
}

export interface CriteriaPolicyOption {
  readonly id: string;
  readonly name: string;
  readonly versionNumber: number;
  readonly criteria: readonly DeclaredCriterion[];
}

export interface CriteriaOptions {
  readonly evaluation: readonly CriteriaPolicyOption[];
  readonly recommendation: readonly CriteriaPolicyOption[];
}
