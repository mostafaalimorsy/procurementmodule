import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BidderInvitation } from './bidder.api';
import { TenderInvitationPage } from './tender-invitation';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const buttons = (element: HTMLElement) =>
  [...element.querySelectorAll('button')].map((button) => text(button).trim());

function view(overrides: Partial<BidderInvitation> = {}): BidderInvitation {
  return {
    buyerCompanyName: 'Delta Construction',
    reference: 'TND-2026-0001',
    type: 'Rfq',
    title: 'HVAC installation',
    projectName: 'Tower One',
    workPackageCode: 'HVAC-01',
    workPackageTitle: 'HVAC works',
    scopeInstructions: 'Supply and install.',
    currency: 'EGP',
    bidValidityDays: 90,
    technicalProposalRequired: true,
    durationRequired: true,
    pricing: null,
    terms: null,
    requiredDocuments: ['Priced BOQ'],
    submissionInstructions: null,
    submissionDeadline: {
      utc: '2099-10-15T11:00:00Z',
      local: '2099-10-15T14:00',
      offset: '+03:00',
    },
    questionsDeadline: null,
    timeZoneId: 'Asia/Riyadh',
    contactName: 'Maha Manager',
    contactEmail: 'maha@delta.example',
    contactPhone: null,
    documents: [
      { id: 'd1', fileName: 'Drawings.pdf', contentType: 'application/pdf', sizeBytes: 2048 },
    ],
    revision: 1,
    publishedAtUtc: '2026-10-01T09:00:00Z',
    state: 'Open',
    subcontractorName: 'Acme Mechanical',
    recipientName: 'Rana Estimator',
    invitationStatus: 'Invited',
    declineReason: null,
    canRespond: true,
    buyerPreview: false,
    bid: null,
    hasBuyerLogo: false,
    canBid: true,
    ...overrides,
  };
}

/** The page loads clarifications and addenda (Part 8) after the invitation; none here unless a test says so. */
function flushUpdates(http: HttpTestingController): void {
  for (const request of http.match((candidate) => candidate.url.endsWith('/communications')))
    request.flush({
      myQuestions: [],
      published: [],
      addenda: [],
      canAsk: true,
      questionsClosedReason: null,
      questionMaxLength: 4000,
      outstandingAcknowledgements: 0,
      currentRevision: 1,
      canAcknowledge: true,
      serverTimeUtc: '2026-10-01T09:00:00Z',
    });
}

function verifyAll(http: HttpTestingController): void {
  flushUpdates(http);
  http.verify();
}

function render(hash: string) {
  window.history.replaceState(null, '', `/tender-invitation${hash}`);
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TenderInvitationPage);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

describe('bidder invitation page', () => {
  it('says the buyer closed the tender early, without anything about other firms, and offers no action', () => {
    const { http, fixture, element } = render('#token=closed-early-token');
    http.expectOne('/api/v1/tender-invitations/open').flush(
      view({
        state: 'Closed',
        canRespond: false,
        canBid: false,
        closedEarlyAt: { utc: '2099-10-10T09:00:00Z', local: '2099-10-10T12:00', offset: '+03:00' },
      }),
    );
    flushUpdates(http);
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('The buyer closed this tender on');
    expect(content).toContain('Oct 10, 2099, 12:00 (Asia/Riyadh, UTC+03:00)');
    expect(content).toContain('A bid you submitted is kept exactly as you submitted it');
    expect(content).not.toContain('The submission deadline has passed');
    expect(buttons(element)).not.toEqual(expect.arrayContaining(['We intend to bid']));
    verifyAll(http);
  });

  it('takes the link out of the address bar, sends it only in the body and shows the buyer and tender', () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    expect(window.location.hash).toBe('');
    const open = http.expectOne('/api/v1/tender-invitations/open');
    expect(open.request.method).toBe('POST');
    expect(open.request.body).toEqual({ token: 'secret-token-value' });
    expect(open.request.url).not.toContain('secret');
    open.flush(view());
    // Clarifications and addenda come through the same link, in the body only.
    const updates = http.expectOne('/api/v1/tender-invitations/communications');
    expect(updates.request.body).toEqual({ token: 'secret-token-value' });
    updates.flush({
      myQuestions: [],
      published: [],
      addenda: [],
      canAsk: true,
      questionsClosedReason: null,
      questionMaxLength: 4000,
      outstandingAcknowledgements: 0,
      currentRevision: 1,
      canAcknowledge: true,
      serverTimeUtc: '2026-10-01T09:00:00Z',
    });
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('Delta Construction invites you to submit a bid');
    expect(content).toContain('HVAC installation');
    expect(content).toContain('Oct 15, 2099, 14:00 (Asia/Riyadh, UTC+03:00)');
    expect(content).toContain('Addressed to Rana Estimator for Acme Mechanical');
    expect(content).toContain('Saying you intend to bid is not a bid');
    expect(buttons(element)).toEqual(
      expect.arrayContaining(['We intend to bid', 'Decline', 'Download Drawings.pdf']),
    );
    verifyAll(http);
  });

  it('records intending to bid, and requires a reason — and a comment for "Other" — to decline', () => {
    const { http, fixture, element, page } = render('#token=t1');
    http.expectOne('/api/v1/tender-invitations/open').flush(view());
    fixture.detectChanges();
    page.intend();
    const intend = http.expectOne('/api/v1/tender-invitations/respond');
    expect(intend.request.body).toEqual({
      token: 't1',
      response: 'IntendsToBid',
      declineReason: null,
      comment: null,
    });
    intend.flush(view({ invitationStatus: 'IntendsToBid' }));
    fixture.detectChanges();
    expect(text(element)).toContain('The buyer can see that you intend to bid.');
    expect(buttons(element)).not.toContain('We intend to bid');

    page.startDecline();
    page.reason = 'Other';
    page.decline();
    fixture.detectChanges();
    http.expectNone('/api/v1/tender-invitations/respond');
    expect(text(element)).toContain('Choose why you are declining.');
    page.comment = 'Fully booked.';
    page.decline();
    const decline = http.expectOne('/api/v1/tender-invitations/respond');
    expect(decline.request.body).toEqual({
      token: 't1',
      response: 'Decline',
      declineReason: 'Other',
      comment: 'Fully booked.',
    });
    decline.flush(view({ invitationStatus: 'Declined', declineReason: 'Other' }));
    verifyAll(http);
  });

  it('downloads a document by posting the link, never putting it in a URL', () => {
    const { http, fixture, page } = render('#token=t2');
    http.expectOne('/api/v1/tender-invitations/open').flush(view());
    fixture.detectChanges();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    page.download(view().documents[0]);
    const request = http.expectOne('/api/v1/tender-invitations/documents/d1');
    expect(request.request.body).toEqual({ token: 't2' });
    request.flush(new Blob(['%PDF']));
    expect(create).toHaveBeenCalled();
    create.mockRestore();
    revoke.mockRestore();
    verifyAll(http);
  });

  it('reads the problem inside a failed download instead of showing a generic error', async () => {
    const { http, fixture, element, page } = render('#token=t3');
    http.expectOne('/api/v1/tender-invitations/open').flush(view());
    fixture.detectChanges();
    page.download(view().documents[0]);
    http
      .expectOne('/api/v1/tender-invitations/documents/d1')
      .flush(new Blob([JSON.stringify({ code: 'storage.unavailable' })]), {
        status: 503,
        statusText: 'Service Unavailable',
      });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(text(element)).toContain('Document storage is not configured on this server.');
    page.download(view().documents[0]);
    http
      .expectOne('/api/v1/tender-invitations/documents/d1')
      .flush(new Blob([JSON.stringify({ code: 'bidder.link_invalid' })]), {
        status: 404,
        statusText: 'Not Found',
      });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(text(element)).toContain('This invitation link is invalid or has expired.');
    verifyAll(http);
  });

  it('counts down in words that stay true: days and hours, then less than an hour', () => {
    const inHours = (hours: number) =>
      new Date(Date.now() + hours * 3_600_000 + 60_000).toISOString();
    const soon = render('#token=t4');
    soon.http.expectOne('/api/v1/tender-invitations/open').flush(
      view({
        submissionDeadline: {
          utc: inHours(2 * 24 + 5),
          local: '2099-10-15T14:00',
          offset: '+03:00',
        },
      }),
    );
    soon.fixture.detectChanges();
    expect(text(soon.element)).toContain('Time left: 2 days 5 hours');
    TestBed.resetTestingModule();

    const minutes = render('#token=t5');
    minutes.http.expectOne('/api/v1/tender-invitations/open').flush(
      view({
        submissionDeadline: { utc: inHours(0), local: '2099-10-15T14:00', offset: '+03:00' },
      }),
    );
    minutes.fixture.detectChanges();
    expect(text(minutes.element)).toContain('Time left: less than an hour');
  });

  it('says a paused tender is paused, naming only its reference (CF-061)', () => {
    const paused = render('#token=p');
    paused.http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(
        { code: 'bidder.tender_paused', parameters: { reference: 'TND-2026-0042' } },
        { status: 409, statusText: 'Conflict' },
      );
    paused.fixture.detectChanges();
    const shown = text(paused.element);
    expect(shown).toContain('The buyer has paused tender TND-2026-0042.');
    expect(shown).not.toContain('invalid or has expired');
  });

  it('gives one plain answer for a missing or unusable link and shows no answer controls for a closed or cancelled tender', () => {
    const missing = render('');
    missing.fixture.detectChanges();
    missing.http.expectNone('/api/v1/tender-invitations/open');
    expect(text(missing.element)).toContain('This invitation link is invalid or has expired.');
    TestBed.resetTestingModule();

    const unknown = render('#token=nope');
    unknown.http
      .expectOne('/api/v1/tender-invitations/open')
      .flush({ code: 'bidder.link_invalid' }, { status: 404, statusText: 'Not Found' });
    unknown.fixture.detectChanges();
    expect(text(unknown.element)).toContain('This invitation link is invalid or has expired.');
    TestBed.resetTestingModule();

    const cancelled = render('#token=c');
    cancelled.http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ state: 'Cancelled', canRespond: false }));
    cancelled.fixture.detectChanges();
    expect(text(cancelled.element)).toContain('The buyer has cancelled this tender.');
    expect(buttons(cancelled.element)).not.toContain('We intend to bid');
    expect(buttons(cancelled.element)).not.toContain('Decline');
    TestBed.resetTestingModule();

    const preview = render('#token=p');
    preview.http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ buyerPreview: true, canRespond: false }));
    preview.fixture.detectChanges();
    expect(text(preview.element)).toContain('this is a preview of what the invited firm sees');
    expect(buttons(preview.element)).not.toContain('We intend to bid');
  });
});

describe('bidder portal identity and bid entry (Part 7)', () => {
  it('continues the email identity: buyer logo and name, the system, and the tender currency', async () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ hasBuyerLogo: true, currency: 'QAR' }));
    fixture.detectChanges();
    const logo = http.expectOne('/api/v1/tender-invitations/logo');
    expect(logo.request.body).toEqual({ token: 'secret-token-value' });
    logo.flush(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }));
    // The logo is read asynchronously (FileReader): wait for it, bounded, rather than a fixed delay that a loaded run can outlast.
    for (let tries = 0; tries < 50 && !element.querySelector('.bid-logo'); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      fixture.detectChanges();
    }
    const content = text(element);
    expect(content).toContain('Delta Construction');
    expect(content).toContain('via Subcontractor Intelligence');
    expect(content).toContain('Prices are in QAR');
    const image = element.querySelector('.bid-logo') as HTMLImageElement;
    // Decorative: the name is written beside it, so a screen reader does not hear it twice.
    expect(image.alt).toBe('');
    expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(content).toContain('If you did not expect it, contact the buyer');
  });

  it('starts a bid in the workspace and never shows competitors', () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http.expectOne('/api/v1/tender-invitations/open').flush(view());
    fixture.detectChanges();
    expect(text(element)).not.toMatch(/other bidders|competitor|invitees/i);
    (
      [...element.querySelectorAll('button')].find((button) =>
        text(button).includes('Start your bid'),
      ) as HTMLButtonElement
    ).click();
    const start = http.expectOne('/api/v1/tender-invitations/bid/start');
    expect(start.request.body).toEqual({ token: 'secret-token-value' });
    start.flush({
      reference: 'BID-7K4Q-M2XD',
      status: 'Draft',
      currency: 'EGP',
      currencyDecimals: 2,
      tenderRevision: 1,
      draft: {
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
      },
      draftVersion: 'v1',
      startedAtUtc: '2026-10-02T08:00:00Z',
      draftSavedAtUtc: null,
      attachments: [],
      gaps: [],
      canEdit: true,
      receipt: null,
      submitted: null,
      submittedAttachments: [],
      maxAttachments: 20,
      maxAttachmentBytes: 26214400,
      maxTotalAttachmentBytes: 209715200,
      allowedExtensions: ['.pdf'],
    });
    fixture.detectChanges();
    expect(element.querySelector('app-bid-workspace')).not.toBeNull();
    expect(text(element)).toContain('Commercial offer');
  });

  it('shows a submitted bid as received — not approved — and offers the submitted content', () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http.expectOne('/api/v1/tender-invitations/open').flush(
      view({
        invitationStatus: 'BidSubmitted',
        canRespond: false,
        canBid: false,
        bid: {
          reference: 'BID-7K4Q-M2XD',
          status: 'Submitted',
          startedAtUtc: '2026-10-02T08:00:00Z',
          draftSavedAtUtc: '2026-10-02T09:00:00Z',
          submittedAtUtc: '2026-10-03T10:00:00Z',
          revisionNumber: 1,
        },
      }),
    );
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('Submitted');
    expect(content).toContain('BID-7K4Q-M2XD');
    expect(content).toContain('It is not an approval or an award');
    expect(buttons(element)).toContain('View your submitted bid');
    expect(buttons(element)).not.toContain('Start your bid');
  });

  it('gives a buyer preview no bid card and no bid actions', () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ buyerPreview: true, canBid: false, canRespond: false }));
    fixture.detectChanges();
    expect(element.querySelector('.bid-card--bid')).toBeNull();
    expect(buttons(element)).not.toContain('Start your bid');
  });

  it("shows a view-only copy of the link without answers, bid or the firm's status, and says where to act", () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ linkAccess: 'ViewOnly', canBid: false, canRespond: false }));
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('This is a view-only copy of the invitation');
    expect(content).not.toContain('Your answer');
    expect(element.querySelector('.bid-card--bid')).toBeNull();
    expect(buttons(element)).not.toContain('Start your bid');
    expect(buttons(element)).not.toContain('We intend to bid');
  });

  it('tells a firm whose link was once shown to ask for a new one, keeping its saved work', () => {
    const { http, fixture, element } = render('#token=secret-token-value');
    http
      .expectOne('/api/v1/tender-invitations/open')
      .flush(view({ linkAccess: 'Shown', canBid: false, canRespond: false }));
    fixture.detectChanges();
    expect(text(element)).toContain('Ask the buyer to send you a new invitation link');
    expect(element.querySelector('.bid-card--bid')).toBeNull();
  });
});
