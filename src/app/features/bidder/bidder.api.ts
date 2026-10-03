import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ClarificationStatus,
  ClarificationVisibility,
  DeclineReason,
  InvitationStatus,
  ScheduleItem,
  TenderLocalTime,
  TenderPricing,
  TenderTerms,
  TenderType,
  VatTreatment,
} from '../tendering/tendering.api';

export interface BidderDocument {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/** What an invited firm sees: the buyer, the published tender and its own invitation — nothing else. */
export interface BidderInvitation {
  readonly buyerCompanyName: string;
  readonly reference: string;
  readonly type: TenderType;
  readonly title: string;
  readonly projectName: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly scopeInstructions: string;
  readonly currency: string;
  readonly bidValidityDays: number | null;
  readonly technicalProposalRequired: boolean;
  /** CF-053: the tender requires a proposed duration. */
  readonly durationRequired: boolean;
  /** CF-055 (ADR-092): what the tender asks bidders to confirm and answer. */
  readonly pricing: TenderPricing | null;
  readonly terms: TenderTerms | null;
  /** CF-004 (ADR-093): the price schedule the firm prices item by item; absent or null for a lump-sum tender. */
  readonly schedule?: readonly ScheduleItem[] | null;
  /** CF-040 (ADR-105): the declared criteria and weights, only when the buyer chose to show them. */
  readonly criteria?: DisclosedCriteria | null;
  readonly requiredDocuments: readonly string[];
  readonly submissionInstructions: string | null;
  readonly submissionDeadline: TenderLocalTime;
  readonly questionsDeadline: TenderLocalTime | null;
  readonly timeZoneId: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly documents: readonly BidderDocument[];
  readonly revision: number;
  readonly publishedAtUtc: string;
  readonly state: 'Open' | 'Closed' | 'Cancelled';
  readonly subcontractorName: string;
  readonly recipientName: string;
  readonly invitationStatus: InvitationStatus;
  readonly declineReason: DeclineReason | null;
  readonly canRespond: boolean;
  /** Opened by someone signed in to the buyer's workspace: nothing is recorded and answers are off. */
  readonly buyerPreview: boolean;
  /** The firm's own bid, when it started one (never in a buyer preview). */
  readonly bid: BidSummary | null;
  readonly hasBuyerLogo: boolean;
  /** The tender is open and nothing was submitted yet: the firm may start or continue its bid. */
  readonly canBid: boolean;
  /**
   * What this link may do: `Firm` is the firm's emailed link; `ViewOnly` is a copy a buyer user took; `Shown` is a
   * firm link a user was once shown. Only `Firm` answers or bids.
   */
  readonly linkAccess?: 'Firm' | 'ViewOnly' | 'Shown';
  /** Part 8: the deadline first published, when it was since extended (submissionDeadline is the one in force). */
  readonly originalSubmissionDeadline?: TenderLocalTime | null;
  readonly deadlineExtended?: boolean;
  readonly addendaCount?: number;
  /** Issued addenda that require this firm's acknowledgement and do not have it yet. */
  readonly outstandingAcknowledgements?: number;
  readonly canAsk?: boolean;
  /** The server's clock when it answered: the countdown follows the server, not this device. */
  readonly serverTimeUtc?: string | null;
  /** Part 9: when the buyer closed the tender before its deadline (null otherwise). */
  readonly closedEarlyAt?: TenderLocalTime | null;
}

/** A clarification as a bidder sees it: its own questions, or a published one without who asked. */
export interface BidderClarification {
  readonly id: string;
  readonly reference: string;
  readonly mine: boolean;
  readonly question: string;
  readonly askedAtUtc: string | null;
  readonly status: ClarificationStatus;
  readonly visibility: ClarificationVisibility | null;
  readonly answer: string | null;
  readonly answeredAtUtc: string | null;
  readonly publishedQuestion: string | null;
  readonly publishedAtUtc: string | null;
}

export interface BidderAddendumDocument {
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly current: boolean;
  readonly replacesDocumentId: string | null;
}

export interface BidderAddendum {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly summary: string;
  readonly issuedAtUtc: string;
  readonly tenderRevision: number;
  readonly acknowledgementRequired: boolean;
  readonly acknowledgedAtUtc: string | null;
  readonly previousDeadline: TenderLocalTime | null;
  readonly newDeadline: TenderLocalTime | null;
  readonly addedDocuments: readonly BidderAddendumDocument[];
  readonly withdrawnDocuments: readonly BidderAddendumDocument[];
}

export interface BidderCommunications {
  readonly myQuestions: readonly BidderClarification[];
  readonly published: readonly BidderClarification[];
  readonly addenda: readonly BidderAddendum[];
  readonly canAsk: boolean;
  readonly questionsClosedReason: string | null;
  readonly questionMaxLength: number;
  readonly outstandingAcknowledgements: number;
  readonly currentRevision: number;
  readonly canAcknowledge: boolean;
  readonly serverTimeUtc: string;
}

/** An issued addendum at a glance in the bid workspace. */
export interface BidAddendumSummary {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly tenderRevision: number;
  readonly acknowledgementRequired: boolean;
  readonly acknowledgedAtUtc: string | null;
}

/** CF-045 (ADR-099): Amending — submitted, and the firm is revising it before the deadline (the submitted revision stands). */
export type BidStatus = 'Draft' | 'Submitted' | 'Amending' | 'Withdrawn';
export type ScopeCompliance = 'Full' | 'WithDeviations';

export interface BidSummary {
  readonly reference: string;
  readonly status: BidStatus;
  readonly startedAtUtc: string;
  readonly draftSavedAtUtc: string | null;
  readonly submittedAtUtc: string | null;
  readonly revisionNumber: number;
  /** The tender revision the draft was started on, or the one the submission answered (Part 8). */
  readonly tenderRevision?: number;
}

export interface BidLine {
  readonly description: string | null;
  readonly amount: string | null;
}

/** The structured response. Amounts are canonical decimal strings in the tender currency, never numbers. */
export interface BidContent {
  readonly totalAmount: string | null;
  readonly lines: readonly BidLine[];
  readonly validityDays: number | null;
  readonly paymentTerms: string | null;
  readonly durationDays: number | null;
  readonly warrantyMonths: number | null;
  readonly exclusions: readonly string[];
  readonly commercialDeviations: readonly string[];
  readonly commercialNotes: string | null;
  readonly scopeCompliance: ScopeCompliance | null;
  readonly technicalApproach: string | null;
  readonly technicalDeviations: readonly string[];
  readonly technicalNotes: string | null;
  /** CF-055 (ADR-092): the answer to the tender's pricing basis (absent on drafts written before it existed). */
  readonly pricing?: {
    readonly confirmed: boolean | null;
    readonly treatment: VatTreatment | null;
    readonly vatRatePercent: string | null;
  } | null;
  /** CF-055: the answers to the requested terms (percentages as typed). */
  readonly terms?: {
    readonly retentionPercent: string | null;
    readonly advancePaymentPercent: string | null;
    readonly performanceSecurityPercent: string | null;
    readonly bidBondProvided: boolean | null;
  } | null;
  /** CF-004 (ADR-093): the rates of the price schedule, as typed. */
  readonly itemRates?: readonly { readonly key: string | null; readonly rate: string | null }[];
}

export interface BidAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly requirementLabel: string | null;
  readonly uploadedAtUtc: string;
  /** CF-070: held while being scanned for malware; only a clean file is served (also to the firm itself). */
  readonly scanState?: 'Pending' | 'Clean' | 'Infected';
}

export interface BidGap {
  readonly key: string;
  readonly index: number | null;
}

export interface BidReceipt {
  readonly reference: string;
  readonly revisionNumber: number;
  readonly submittedAtUtc: string;
  readonly currency: string;
  readonly totalAmount: string;
  readonly attachmentCount: number;
  readonly contentSha256: string;
  readonly submittedByName: string;
  readonly tenderRevision: number;
}

export interface Bid {
  readonly reference: string;
  readonly status: BidStatus;
  readonly currency: string;
  readonly currencyDecimals: number;
  readonly tenderRevision: number;
  readonly draft: BidContent;
  readonly draftVersion: string;
  readonly startedAtUtc: string;
  readonly draftSavedAtUtc: string | null;
  readonly attachments: readonly BidAttachment[];
  readonly gaps: readonly BidGap[];
  readonly canEdit: boolean;
  readonly receipt: BidReceipt | null;
  readonly submitted: BidContent | null;
  readonly submittedAttachments: readonly BidAttachment[];
  readonly maxAttachments: number;
  readonly maxAttachmentBytes: number;
  readonly maxTotalAttachmentBytes: number;
  readonly allowedExtensions: readonly string[];
  /** The server's clock when it answered: the countdown and the lock follow it, not this device's clock. */
  readonly serverTimeUtc?: string;
  /** Part 8: the revision in force now (tenderRevision is the one the draft started on, or the one submitted). */
  readonly currentTenderRevision?: number;
  readonly addenda?: readonly BidAddendumSummary[] | null;
  /** CF-045 (ADR-099, OD-09): the buyer's limit on revisions before the deadline, those used, and whether one can start now. */
  readonly resubmission?: BidResubmission | null;
  /** CF-049 (ADR-100): the withdrawal standing (the firm may submit again while bidding is open), and whether it may withdraw now. */
  readonly withdrawal?: BidWithdrawal | null;
  readonly canWithdraw?: boolean;
  /** CF-069 (ADR-101): where the receipt of each submission is emailed. */
  readonly receiptRecipient?: string | null;
}

export interface BidWithdrawal {
  readonly stage: 'BeforeDeadline' | 'AfterOpening';
  readonly recordedAtUtc: string;
  readonly recordedByName: string;
  readonly revisionInForce: number;
  readonly reason: string | null;
}

export interface BidResubmission {
  readonly maximum: number;
  readonly used: number;
  readonly canStart: boolean;
}

export interface BidDraftSaved {
  readonly draftVersion: string;
  readonly savedAtUtc: string;
  readonly gaps: readonly BidGap[];
}

export const EMPTY_BID: BidContent = {
  totalAmount: null,
  lines: [],
  validityDays: null,
  paymentTerms: null,
  durationDays: null,
  warrantyMonths: null,
  exclusions: [],
  commercialDeviations: [],
  commercialNotes: null,
  scopeCompliance: null,
  technicalApproach: null,
  technicalDeviations: [],
  technicalNotes: null,
};

/** Limits the server applies to a bid, mirrored for inline guidance (the server still decides). */
export const BID_LIMITS = {
  lines: 100,
  lineDescription: 300,
  paymentTerms: 2000,
  notes: 4000,
  technicalApproach: 8000,
  listItems: 50,
  listItem: 500,
  validityMin: 1,
  validityMax: 365,
  durationMin: 1,
  durationMax: 3650,
  warrantyMax: 240,
} as const;

/**
 * What the bid workspace needs from the server. The invitation portal's own bid (BidderApi) is the default; a negotiation
 * round (Part 10) provides the same operations on the firm's revised response, so the one bid form serves both.
 */
export interface BidWorkspaceBackend {
  bid(token: string): Observable<Bid>;
  saveDraft(token: string, draftVersion: string, content: BidContent): Observable<BidDraftSaved>;
  uploadAttachment(
    token: string,
    file: File,
    requirement: string | null,
  ): Observable<HttpEvent<Bid>>;
  removeAttachment(token: string, attachmentId: string): Observable<Bid>;
  attachment(token: string, attachmentId: string): Observable<Blob>;
  submit(
    token: string,
    draftVersion: string,
    attachmentIds: readonly string[],
    idempotencyKey: string,
    tenderRevision?: number | null,
  ): Observable<Bid>;
  /** CF-045: only the invitation's own bid can be revised before the deadline (a negotiation round has its own flow). */
  amend?(token: string): Observable<Bid>;
  discardAmendment?(token: string): Observable<Bid>;
  /** CF-049: only the invitation's own bid can be withdrawn by the firm. */
  withdraw?(token: string, reason: string | null, requestKey: string): Observable<Bid>;
}

export const BID_WORKSPACE_BACKEND = new InjectionToken<BidWorkspaceBackend>('BidWorkspaceBackend');

/**
 * The anonymous invitation surface. The secure link is the credential: it travels only in request bodies,
 * never in a URL, so no server or proxy log records it, and it is never stored in the browser.
 */
@Injectable({ providedIn: 'root' })
export class BidderApi {
  private readonly http = inject(HttpClient);

  open(token: string): Observable<BidderInvitation> {
    return this.http.post<BidderInvitation>('/api/v1/tender-invitations/open', { token });
  }

  respond(
    token: string,
    response: 'IntendsToBid' | 'Decline',
    declineReason: DeclineReason | null,
    comment: string | null,
  ): Observable<BidderInvitation> {
    return this.http.post<BidderInvitation>('/api/v1/tender-invitations/respond', {
      token,
      response,
      declineReason,
      comment,
    });
  }

  logo(token: string): Observable<Blob> {
    return this.http.post('/api/v1/tender-invitations/logo', { token }, { responseType: 'blob' });
  }

  bid(token: string): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid', { token });
  }

  startBid(token: string): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/start', { token });
  }

  saveDraft(token: string, draftVersion: string, content: BidContent): Observable<BidDraftSaved> {
    return this.http.put<BidDraftSaved>('/api/v1/tender-invitations/bid/draft', {
      token,
      draftVersion,
      content,
    });
  }

  /** One file per request, with upload progress. The secure link travels in the form body, never in the URL. */
  uploadAttachment(
    token: string,
    file: File,
    requirement: string | null,
  ): Observable<HttpEvent<Bid>> {
    const form = new FormData();
    if (requirement) form.append('requirement', requirement);
    form.append('file', file, file.name);
    // The link travels in a header so the server can refuse a bad link before reading the file.
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/attachments', form, {
      headers: { 'X-Bid-Token': token },
      reportProgress: true,
      observe: 'events',
    });
  }

  removeAttachment(token: string, attachmentId: string): Observable<Bid> {
    return this.http.post<Bid>(
      `/api/v1/tender-invitations/bid/attachments/${encodeURIComponent(attachmentId)}/remove`,
      { token },
    );
  }

  attachment(token: string, attachmentId: string): Observable<Blob> {
    return this.http.post(
      `/api/v1/tender-invitations/bid/attachments/${encodeURIComponent(attachmentId)}`,
      { token },
      { responseType: 'blob' },
    );
  }

  /** Submits exactly what was reviewed, against the tender revision the bidder reviewed (Part 8). */
  submit(
    token: string,
    draftVersion: string,
    attachmentIds: readonly string[],
    idempotencyKey: string,
    tenderRevision: number | null = null,
  ): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/submit', {
      token,
      draftVersion,
      attachmentIds,
      idempotencyKey,
      confirmed: true,
      tenderRevision,
    });
  }

  /** CF-045 (ADR-099): starts revising the submitted bid; the submitted revision stands until the revised one is submitted. */
  amend(token: string): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/amend', { token });
  }

  discardAmendment(token: string): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/amend/discard', { token });
  }

  /** CF-049 (ADR-100): withdraws the submitted bid before the deadline; the submitted revisions are kept. */
  withdraw(token: string, reason: string | null, requestKey: string): Observable<Bid> {
    return this.http.post<Bid>('/api/v1/tender-invitations/bid/withdraw', {
      token,
      confirmed: true,
      reason,
      requestKey,
    });
  }

  communications(token: string): Observable<BidderCommunications> {
    return this.http.post<BidderCommunications>('/api/v1/tender-invitations/communications', {
      token,
    });
  }

  /** Asks a question. The client key makes a retried request find the question it already asked. */
  ask(token: string, question: string, clientKey: string): Observable<BidderCommunications> {
    return this.http.post<BidderCommunications>('/api/v1/tender-invitations/clarifications', {
      token,
      question,
      clientKey,
    });
  }

  acknowledge(token: string, addendumId: string): Observable<BidderCommunications> {
    return this.http.post<BidderCommunications>(
      `/api/v1/tender-invitations/addenda/${encodeURIComponent(addendumId)}/acknowledge`,
      { token },
    );
  }

  document(token: string, documentId: string): Observable<Blob> {
    return this.http.post(
      `/api/v1/tender-invitations/documents/${encodeURIComponent(documentId)}`,
      { token },
      { responseType: 'blob' },
    );
  }
}

/** CF-040: the criteria and weights a bidder is shown (names and weights only). */
export interface DisclosedCriteria {
  readonly evaluationPolicyName: string | null;
  readonly scaleMaximum: number | null;
  readonly technicalCriteria: readonly { name: string; category: string | null; weight: number }[];
  readonly recommendationCriteria: readonly {
    name: string;
    category: string | null;
    weight: number;
  }[];
}
