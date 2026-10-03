import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import {
  NegotiationParticipantStatus,
  NegotiationRoundType,
  NegotiationScope,
} from '../decision/decision.api';
import {
  ScheduleItem,
  TenderLocalTime,
  TenderPricing,
  TenderTerms,
} from '../tendering/tendering.api';
import {
  Bid,
  BidAttachment,
  BidContent,
  BidDraftSaved,
  BidGap,
  BidReceipt,
  BidWorkspaceBackend,
  BidderInvitation,
} from './bidder.api';

/** open, deadline_passed, closed, cancelled or withdrawn — judged by the server clock and the round's own state. */
export type BidderRoundState = 'open' | 'deadline_passed' | 'closed' | 'cancelled' | 'withdrawn';

/**
 * What a selected firm sees through its own round link (Part 10): the buyer, the tender, this round's instructions and
 * deadline, its own response in force and its own revised response. Nothing about who else was invited, anyone's prices or
 * scores, the ranking or the decision.
 */
export interface BidderNegotiation {
  readonly buyerName: string;
  readonly hasLogo: boolean;
  readonly tenderReference: string;
  readonly tenderTitle: string;
  readonly roundNumber: number;
  readonly type: NegotiationRoundType;
  readonly scope: NegotiationScope;
  readonly instructions: string;
  readonly responseDeadline: TenderLocalTime;
  readonly timeZoneId: string;
  readonly state: BidderRoundState | string;
  readonly status: NegotiationParticipantStatus;
  readonly currency: string;
  readonly currencyMinorUnits: number;
  readonly bidReference: string;
  /** The firm's own name (never another firm's). */
  readonly subcontractorName: string;
  readonly bidValidityDays: number | null;
  readonly technicalProposalRequired: boolean;
  readonly durationRequired: boolean;
  readonly pricing: TenderPricing | null;
  readonly terms: TenderTerms | null;
  readonly schedule?: readonly ScheduleItem[] | null;
  /** The tender's required documents, in the order a requiredDocument gap index refers to. */
  readonly requiredDocuments: readonly string[];
  readonly currentRevisionNumber: number;
  readonly currentSubmission: BidContent;
  readonly currentFiles: readonly BidAttachment[];
  readonly draft: BidContent | null;
  readonly draftVersion: string | null;
  readonly draftSavedAtUtc: string | null;
  readonly draftFiles: readonly BidAttachment[];
  readonly gaps: readonly BidGap[];
  readonly editable: boolean;
  readonly receipt: BidReceipt | null;
  readonly declineComment: string | null;
  readonly maximumAttachments: number;
  readonly maximumAttachmentBytes: number;
  readonly maximumTotalAttachmentBytes: number;
  readonly allowedExtensions: readonly string[];
  readonly contactName: string;
  readonly contactEmail: string;
  readonly serverNowUtc: string;
}

export const DECLINE_ROUND_COMMENT_MAX = 500;
const BASE = '/api/v1/tender-invitations/negotiation';

/**
 * The selected firm's round surface. The round link is the credential: it travels only in request bodies (an upload: a
 * header), never in a URL, and it is never stored in the browser. It is a separate credential from the invitation link.
 */
@Injectable({ providedIn: 'root' })
export class BidderNegotiationApi {
  private readonly http = inject(HttpClient);

  open(token: string): Observable<BidderNegotiation> {
    return this.http.post<BidderNegotiation>(BASE, { token });
  }

  logo(token: string): Observable<Blob> {
    return this.http.post(`${BASE}/logo`, { token }, { responseType: 'blob' });
  }

  /** Starts the revised response (or resumes it after declining); a firm that already submitted just gets its view. */
  start(token: string): Observable<BidderNegotiation> {
    return this.http.post<BidderNegotiation>(`${BASE}/start`, { token });
  }

  saveDraft(token: string, draftVersion: string, content: BidContent): Observable<BidDraftSaved> {
    return this.http.put<BidDraftSaved>(`${BASE}/draft`, { token, draftVersion, content });
  }

  uploadAttachment(
    token: string,
    file: File,
    requirement: string | null,
  ): Observable<HttpEvent<BidderNegotiation>> {
    const form = new FormData();
    if (requirement) form.append('requirement', requirement);
    form.append('file', file, file.name);
    return this.http.post<BidderNegotiation>(`${BASE}/attachments`, form, {
      headers: { 'X-Bid-Token': token },
      reportProgress: true,
      observe: 'events',
    });
  }

  removeAttachment(token: string, attachmentId: string): Observable<BidderNegotiation> {
    return this.http.post<BidderNegotiation>(
      `${BASE}/attachments/${encodeURIComponent(attachmentId)}/remove`,
      { token },
    );
  }

  attachment(token: string, attachmentId: string): Observable<Blob> {
    return this.http.post(
      `${BASE}/attachments/${encodeURIComponent(attachmentId)}`,
      { token },
      { responseType: 'blob' },
    );
  }

  submit(
    token: string,
    draftVersion: string,
    attachmentIds: readonly string[],
    idempotencyKey: string,
  ): Observable<BidderNegotiation> {
    return this.http.post<BidderNegotiation>(`${BASE}/submit`, {
      token,
      draftVersion,
      attachmentIds,
      idempotencyKey,
      confirmed: true,
    });
  }

  decline(token: string, comment: string | null): Observable<BidderNegotiation> {
    return this.http.post<BidderNegotiation>(`${BASE}/decline`, { token, comment });
  }
}

/**
 * The bid workspace's operations on a round's revised response. It keeps the latest round view it received, so the round
 * page can show the receipt and state after the workspace submits.
 */
@Injectable()
export class NegotiationBidBackend implements BidWorkspaceBackend {
  private readonly api = inject(BidderNegotiationApi);
  readonly latest = signal<BidderNegotiation | null>(null);

  bid(token: string): Observable<Bid> {
    return this.api.open(token).pipe(
      tap((view) => this.latest.set(view)),
      map(negotiationAsBid),
    );
  }

  saveDraft(token: string, draftVersion: string, content: BidContent): Observable<BidDraftSaved> {
    return this.api.saveDraft(token, draftVersion, content);
  }

  uploadAttachment(
    token: string,
    file: File,
    requirement: string | null,
  ): Observable<HttpEvent<Bid>> {
    return this.api.uploadAttachment(token, file, requirement).pipe(
      map((event) => {
        if (event.type !== HttpEventType.Response) return event;
        if (event.body) this.latest.set(event.body);
        return event.clone<Bid>({ body: event.body ? negotiationAsBid(event.body) : null });
      }),
    );
  }

  removeAttachment(token: string, attachmentId: string): Observable<Bid> {
    return this.api.removeAttachment(token, attachmentId).pipe(
      tap((view) => this.latest.set(view)),
      map(negotiationAsBid),
    );
  }

  attachment(token: string, attachmentId: string): Observable<Blob> {
    return this.api.attachment(token, attachmentId);
  }

  submit(
    token: string,
    draftVersion: string,
    attachmentIds: readonly string[],
    idempotencyKey: string,
  ): Observable<Bid> {
    return this.api.submit(token, draftVersion, attachmentIds, idempotencyKey).pipe(
      tap((view) => this.latest.set(view)),
      map(negotiationAsBid),
    );
  }
}

/** The round's revised response in the shape the bid workspace works with. */
export function negotiationAsBid(view: BidderNegotiation): Bid {
  const submitted = !!view.receipt;
  return {
    reference: view.bidReference,
    status: submitted ? 'Submitted' : 'Draft',
    currency: view.currency,
    currencyDecimals: view.currencyMinorUnits,
    tenderRevision: view.receipt?.tenderRevision ?? 1,
    draft: view.draft ?? view.currentSubmission,
    draftVersion: view.draftVersion ?? '',
    startedAtUtc: view.draftSavedAtUtc ?? view.serverNowUtc,
    draftSavedAtUtc: view.draftSavedAtUtc,
    attachments: view.draftFiles,
    gaps: view.gaps,
    canEdit: view.editable,
    receipt: view.receipt,
    submitted: submitted ? (view.draft ?? view.currentSubmission) : null,
    submittedAttachments: submitted ? view.draftFiles : [],
    maxAttachments: view.maximumAttachments,
    maxAttachmentBytes: view.maximumAttachmentBytes,
    maxTotalAttachmentBytes: view.maximumTotalAttachmentBytes,
    allowedExtensions: view.allowedExtensions,
    serverTimeUtc: view.serverNowUtc,
    addenda: null,
  };
}

/**
 * The tender facts the bid workspace shows, from the round view: the same bid requirements the invitation portal passes
 * (required documents in the server's gap-index order, technical proposal, requested validity, the firm's own name), with
 * the round's response deadline.
 */
export function negotiationAsInvitation(view: BidderNegotiation): BidderInvitation {
  return {
    buyerCompanyName: view.buyerName,
    reference: view.tenderReference,
    type: 'Rfq',
    title: view.tenderTitle,
    projectName: '',
    workPackageCode: '',
    workPackageTitle: '',
    scopeInstructions: '',
    currency: view.currency,
    bidValidityDays: view.bidValidityDays,
    technicalProposalRequired: view.technicalProposalRequired,
    durationRequired: view.durationRequired,
    pricing: view.pricing,
    terms: view.terms,
    schedule: view.schedule ?? null,
    requiredDocuments: view.requiredDocuments,
    submissionInstructions: null,
    submissionDeadline: view.responseDeadline,
    questionsDeadline: null,
    timeZoneId: view.timeZoneId,
    contactName: view.contactName,
    contactEmail: view.contactEmail,
    contactPhone: null,
    documents: [],
    revision: 1,
    publishedAtUtc: view.serverNowUtc,
    state: view.state === 'open' ? 'Open' : view.state === 'cancelled' ? 'Cancelled' : 'Closed',
    subcontractorName: view.subcontractorName,
    recipientName: '',
    invitationStatus: 'IntendsToBid',
    declineReason: null,
    canRespond: false,
    buyerPreview: false,
    bid: null,
    hasBuyerLogo: view.hasLogo,
    canBid: view.state === 'open',
    serverTimeUtc: view.serverNowUtc,
  };
}
