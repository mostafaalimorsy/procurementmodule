import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BidWorkspace } from './bid-workspace';
import { bidView, invitationView } from './bid-workspace.spec.fixtures';
import { BidderAddendum, BidderCommunications, BidderInvitation } from './bidder.api';
import { BidderUpdates } from './bidder-updates';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;

function addendum(overrides: Partial<BidderAddendum> = {}): BidderAddendum {
  return {
    id: 'a1',
    number: 1,
    title: 'Revised drawings',
    summary: 'Revision 1 replaces revision 0.',
    issuedAtUtc: '2026-10-03T09:00:00Z',
    tenderRevision: 2,
    acknowledgementRequired: true,
    acknowledgedAtUtc: null,
    previousDeadline: null,
    newDeadline: null,
    addedDocuments: [
      {
        id: 'd2',
        fileName: 'drawings-rev1.pdf',
        sizeBytes: 2048,
        current: true,
        replacesDocumentId: 'd1',
      },
    ],
    withdrawnDocuments: [
      {
        id: 'd1',
        fileName: 'drawings-rev0.pdf',
        sizeBytes: 2048,
        current: false,
        replacesDocumentId: null,
      },
    ],
    ...overrides,
  };
}

function communications(overrides: Partial<BidderCommunications> = {}): BidderCommunications {
  return {
    myQuestions: [],
    published: [
      {
        id: 'c2',
        reference: 'CL-002',
        mine: false,
        question: 'Which drawing revision applies?',
        askedAtUtc: null,
        status: 'Answered',
        visibility: 'AllBidders',
        answer: 'Revision C.',
        answeredAtUtc: '2026-10-02T10:00:00Z',
        publishedQuestion: 'Which drawing revision applies?',
        publishedAtUtc: '2026-10-02T10:00:00Z',
      },
    ],
    addenda: [addendum()],
    canAsk: true,
    questionsClosedReason: null,
    questionMaxLength: 4000,
    outstandingAcknowledgements: 1,
    currentRevision: 2,
    canAcknowledge: true,
    serverTimeUtc: '2026-10-03T10:00:00Z',
    ...overrides,
  };
}

function render(
  part: 'addenda' | 'clarifications',
  view: BidderCommunications,
  invitation?: BidderInvitation,
) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(BidderUpdates);
  fixture.componentRef.setInput('token', 'firm-token');
  fixture.componentRef.setInput(
    'invitation',
    invitation ?? invitationView({ linkAccess: 'Firm', revision: 2 }),
  );
  fixture.componentRef.setInput('part', part);
  fixture.componentRef.setInput('view', view);
  const updated: BidderCommunications[] = [];
  fixture.componentInstance.updated.subscribe((next) => {
    updated.push(next);
    fixture.componentRef.setInput('view', next);
  });
  fixture.detectChanges();
  return { http, fixture, element: fixture.nativeElement as HTMLElement, updated };
}

describe('bidder tender updates', () => {
  it('shows each addendum with its documents and acknowledges it explicitly through the firm link', async () => {
    const { http, fixture, element, updated } = render('addenda', communications());
    const content = text(element);
    expect(content).toContain('Tender updated');
    expect(content).toContain('The buyer has issued 1 addendum.');
    expect(content).toContain('Addendum 1 · Revised drawings');
    expect(content).toContain('Acknowledgement required');
    expect(content).toContain('No longer part of the tender');
    expect(content).toContain('It is not acceptance of any commercial term.');
    expect(button(element, 'Download drawings-rev1.pdf')).toBeDefined();

    button(element, 'Acknowledge receipt')!.click();
    const request = http.expectOne('/api/v1/tender-invitations/addenda/a1/acknowledge');
    expect(request.request.body).toEqual({ token: 'firm-token' });
    expect(request.request.url).not.toContain('firm-token');
    request.flush(
      communications({
        addenda: [addendum({ acknowledgedAtUtc: '2026-10-03T11:00:00Z' })],
        outstandingAcknowledgements: 0,
      }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(updated).toHaveLength(1);
    expect(text(element)).toContain(
      'Addendum 1 acknowledged. The buyer can see that you received and reviewed it.',
    );
    expect(button(element, 'Acknowledge receipt')).toBeUndefined();
    expect(element.querySelector('[role="status"]')?.getAttribute('tabindex')).toBe('-1');
    http.verify();
  });

  it('asks a question with a request key, and a published clarification never names the firm that asked', async () => {
    const { http, fixture, element } = render('clarifications', communications());
    let content = text(element);
    expect(content).toContain('Published clarifications');
    expect(content).toContain('CL-002');
    expect(content).toContain('Which drawing revision applies?');
    expect(content).toContain('The firm that asked is never named.');
    expect(content).toContain('Your questions');

    button(element, 'Send question')!.click();
    fixture.detectChanges();
    expect(text(element)).toContain('Write your question first.');
    http.expectNone('/api/v1/tender-invitations/clarifications');

    await fixture.whenStable();
    const field = element.querySelector('#bid-question') as HTMLTextAreaElement;
    field.value = 'May we visit the site?';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(element, 'Send question')!.click();
    const request = http.expectOne('/api/v1/tender-invitations/clarifications');
    expect(request.request.body).toEqual({
      token: 'firm-token',
      question: 'May we visit the site?',
      clientKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    request.flush(
      communications({
        myQuestions: [
          {
            id: 'c3',
            reference: 'CL-003',
            mine: true,
            question: 'May we visit the site?',
            askedAtUtc: '2026-10-03T12:00:00Z',
            status: 'Open',
            visibility: null,
            answer: null,
            answeredAtUtc: null,
            publishedQuestion: null,
            publishedAtUtc: null,
          },
        ],
      }),
    );
    fixture.detectChanges();
    content = text(element);
    expect(content).toContain('Your question was sent to the buyer as CL-003.');
    expect(content).toContain('Awaiting answer');
    expect(content).toContain('The buyer has not answered yet.');
    http.verify();
  });

  it('shows a view-only copy only what every invited firm sees, and explains a closed question window', () => {
    const view = render(
      'clarifications',
      communications({ canAsk: false, questionsClosedReason: 'view_only', canAcknowledge: false }),
      invitationView({ linkAccess: 'ViewOnly' }),
    );
    let content = text(view.element);
    expect(button(view.element, 'Send question')).toBeUndefined();
    view.http.verify();
    expect(content).toContain('Published clarifications');
    TestBed.resetTestingModule();
    const viewOnlyAddenda = render(
      'addenda',
      communications({ canAcknowledge: false, outstandingAcknowledgements: 0 }),
      invitationView({ linkAccess: 'ViewOnly' }),
    );
    const addendaText = text(viewOnlyAddenda.element);
    // Someone who cannot acknowledge is not told to acknowledge before submitting.
    expect(addendaText).not.toContain('before you submit your bid');
    expect(addendaText).toContain(
      'Each invited firm acknowledges this addendum through its own link.',
    );
    expect(button(viewOnlyAddenda.element, 'Acknowledge receipt')).toBeUndefined();
    expect(content).not.toContain('Your questions');

    TestBed.resetTestingModule();
    const closed = render(
      'clarifications',
      communications({ canAsk: false, questionsClosedReason: 'questions_deadline_passed' }),
    );
    content = text(closed.element);
    expect(content).toContain('The questions deadline has passed.');
    expect(button(closed.element, 'Send question')).toBeUndefined();
  });
});

describe('bid workspace after an addendum', () => {
  it('says the tender changed, keeps the draft, sends the bidder to read and acknowledge it, and submits against the revision reviewed', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BidWorkspace);
    fixture.componentRef.setInput('token', 'firm-token');
    fixture.componentRef.setInput('invitation', invitationView({ revision: 2 }));
    fixture.componentRef.setInput(
      'initial',
      bidView({
        tenderRevision: 1,
        currentTenderRevision: 2,
        addenda: [
          {
            id: 'a1',
            number: 1,
            title: 'Revised drawings',
            tenderRevision: 2,
            acknowledgementRequired: true,
            acknowledgedAtUtc: null,
          },
        ],
        gaps: [{ key: 'addendumAcknowledgement', index: 1 }],
      }),
    );
    let left = 0;
    fixture.componentInstance.back.subscribe(() => left++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain('Tender updated');
    expect(content).toContain('Review changes before submitting: the tender is now at revision 2.');
    expect(content).toContain('nothing was changed for you');
    expect(content).toContain('Acknowledgement required');
    // Acknowledging happens where the addendum can be read: the workspace sends the bidder there (saved first).
    expect(button(element, 'Acknowledge receipt')).toBeUndefined();
    button(element, 'Review the addenda')!.click();
    expect(left).toBe(1);
    // The submission names the revision the bidder is looking at.
    expect(fixture.componentInstance.currentTenderRevision()).toBe(2);
    http.verify();
  });
});
