import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenderAddenda } from './tender-addenda';
import { TenderClarifications } from './tender-clarifications';
import {
  Addendum,
  Clarification,
  TenderAddenda as AddendaView,
  TenderClarifications as ClarificationLog,
} from './tendering.api';
import { published } from './tendering.fixtures';

const MANAGER = [
  'Tenders.View',
  'Tenders.ManageClarifications',
  'Tenders.DraftAddenda',
  'Tenders.IssueAddenda',
  'Tenders.ExtendDeadline',
];
const OFFICER = ['Tenders.View', 'Tenders.ManageClarifications', 'Tenders.DraftAddenda'];
const VIEWER = ['Tenders.View'];

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const submitForm = (element: HTMLElement, label: string) => button(element, label)!.click();
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;

function configure(permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    email: 'maha@delta.example',
    roles: ['ProcurementManager'],
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

function question(overrides: Partial<Clarification> = {}): Clarification {
  return {
    id: 'q1',
    reference: 'CL-001',
    number: 1,
    invitationId: 'i1',
    subcontractorCode: 'ACME-01',
    subcontractorName: 'Acme Mechanical',
    askedByName: 'Rana Estimator',
    question: 'Acme asks: is the chiller in scope?',
    askedAtUtc: '2026-10-02T09:00:00Z',
    tenderRevision: 1,
    status: 'Open',
    visibility: null,
    answer: null,
    answeredAtUtc: null,
    answeredByName: null,
    publishedQuestion: null,
    publishedAtUtc: null,
    publishedByName: null,
    canAnswer: true,
    canPublish: false,
    version: 'c-v1',
    ...overrides,
  };
}

function log(items: Clarification[]): ClarificationLog {
  return {
    total: items.length,
    open: items.filter((item) => item.status === 'Open').length,
    answeredPrivately: items.filter((item) => item.visibility === 'Private').length,
    published: items.filter((item) => item.visibility === 'AllBidders').length,
    items,
  };
}

function renderClarifications(permissions: readonly string[], items: Clarification[]) {
  const http = configure(permissions);
  const fixture = TestBed.createComponent(TenderClarifications);
  fixture.componentRef.setInput('tender', published());
  const announced: string[] = [];
  fixture.componentInstance.announce.subscribe((message) => announced.push(message));
  fixture.detectChanges();
  http.expectOne('/api/v1/tenders/t1/clarifications').flush(log(items));
  fixture.detectChanges();
  return { http, fixture, element: fixture.nativeElement as HTMLElement, announced };
}

function addendum(overrides: Partial<Addendum> = {}): Addendum {
  return {
    id: 'a1',
    status: 'Draft',
    number: null,
    title: 'Revised drawings',
    summary: 'Revision 1 replaces revision 0.',
    acknowledgementRequired: true,
    newSubmissionDeadline: null,
    newQuestionsDeadline: null,
    previousSubmissionDeadline: null,
    withdrawnDocumentIds: [],
    documents: [],
    withdrawn: [],
    baseRevision: null,
    resultingRevision: null,
    issuedAtUtc: null,
    issuedByName: null,
    createdByName: 'Omar Officer',
    updatedAtUtc: '2026-10-02T09:00:00Z',
    acknowledgedCount: 0,
    acknowledgementExpected: 0,
    acknowledgements: [],
    missingForIssue: [],
    version: 'a-v1',
    ...overrides,
  };
}

function view(overrides: Partial<AddendaView> = {}): AddendaView {
  return {
    currentRevision: 1,
    draft: null,
    issued: [],
    currentDocuments: [
      {
        id: 'd1',
        fileName: 'drawings-rev0.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
        addedInRevision: 1,
        replacesDocumentId: null,
      },
    ],
    canDraft: true,
    canExtend: true,
    tenderVersion: 't-v1',
    ...overrides,
  };
}

function renderAddenda(permissions: readonly string[], initial: AddendaView) {
  const http = configure(permissions);
  const fixture = TestBed.createComponent(TenderAddenda);
  fixture.componentRef.setInput('tender', published({ version: 't-v1' }));
  const announced: string[] = [];
  fixture.componentInstance.announce.subscribe((message) => announced.push(message));
  fixture.detectChanges();
  http.expectOne('/api/v1/tenders/t1/addenda').flush(initial);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
    announced,
  };
}

describe('buyer clarifications', () => {
  it('names the firm internally and requires an explicit choice between a private and a published answer', async () => {
    const { http, fixture, element, announced } = renderClarifications(MANAGER, [question()]);
    const content = text(element);
    expect(content).toContain('CL-001');
    expect(content).toContain('Asked by ACME-01 – Acme Mechanical (Rana Estimator)');
    expect(content).toContain('Awaiting answer');

    button(element, 'Answer')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Neither choice is preselected: answering never publishes by default.
    const radios = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((radio) => radio.checked)).toEqual([false, false]);
    (dialog.querySelector('#clar-answer') as HTMLTextAreaElement).value = 'Chillers are included.';
    dialog.querySelector('#clar-answer')!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(dialog, 'Send the answer to this firm')!.click();
    fixture.detectChanges();
    expect(text(dialog)).toContain('Choose who receives the answer.');
    http.expectNone('/api/v1/tenders/t1/clarifications/q1/answer');

    // A click inside the dialog is never cancelled (the backdrop handler returns nothing): the radio really checks.
    radios[1].click();
    expect(radios[1].checked).toBe(true);
    fixture.detectChanges();
    await fixture.whenStable();
    // Publishing shows the wording every bidder will read, prefilled and editable, with the anonymity advice.
    const published = dialog.querySelector('#clar-published') as HTMLTextAreaElement;
    expect(published.value).toBe('Acme asks: is the chiller in scope?');
    expect(text(dialog)).toContain('Remove anything that identifies the firm that asked');
    published.value = 'Is the chiller in scope?';
    published.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submitForm(dialog, 'Publish to all bidders');
    const request = http.expectOne('/api/v1/tenders/t1/clarifications/q1/answer');
    expect(request.request.body).toEqual({
      answer: 'Chillers are included.',
      visibility: 'AllBidders',
      publishedQuestion: 'Is the chiller in scope?',
      version: 'c-v1',
    });
    request.flush(
      log([
        question({
          status: 'Answered',
          visibility: 'AllBidders',
          answer: 'Chillers are included.',
          publishedQuestion: 'Is the chiller in scope?',
          answeredByName: 'Maha',
          publishedByName: 'Maha',
          answeredAtUtc: '2026-10-02T10:00:00Z',
          publishedAtUtc: '2026-10-02T10:00:00Z',
          canAnswer: false,
        }),
      ]),
    );
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(announced).toEqual([
      'CL-001 is answered and published to all invited bidders. They are being emailed.',
    ]);
    expect(text(element)).toContain('Published to bidders as: Is the chiller in scope?');
    http.verify();
  });

  it('publishes a private answer later, and a reader sees the log without any action', () => {
    const answered = question({
      status: 'Answered',
      visibility: 'Private',
      answer: 'Yes.',
      answeredByName: 'Maha',
      answeredAtUtc: '2026-10-02T10:00:00Z',
      canAnswer: false,
      canPublish: true,
    });
    const officer = renderClarifications(OFFICER, [answered]);
    button(officer.element, 'Publish to all bidders')!.click();
    officer.fixture.detectChanges();
    const dialog = officer.element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('#clar-answer')).toBeNull();
    submitForm(dialog, 'Publish to all bidders');
    const request = officer.http.expectOne('/api/v1/tenders/t1/clarifications/q1/publish');
    expect(request.request.body).toEqual({
      publishedQuestion: 'Acme asks: is the chiller in scope?',
      version: 'c-v1',
    });
    request.flush(
      { status: 409, code: 'concurrency.stale' },
      { status: 409, statusText: 'Conflict' },
    );
    officer.fixture.detectChanges();
    // A stale screen reloads the log and says why.
    officer.http.expectOne('/api/v1/tenders/t1/clarifications').flush(log([answered]));
    expect(officer.announced[0]).toContain('Someone else changed this question');
    officer.http.verify();

    TestBed.resetTestingModule();
    const reader = renderClarifications(VIEWER, [question(), answered]);
    expect(text(reader.element)).toContain('CL-001');
    expect(button(reader.element, 'Answer')).toBeUndefined();
    expect(button(reader.element, 'Publish to all bidders')).toBeUndefined();
    reader.http.verify();
  });
});

describe('buyer addenda and deadline', () => {
  it('prepares a draft, keeps issue behind a saved and complete draft, and issues with both versions', async () => {
    const { http, fixture, element, announced } = renderAddenda(MANAGER, view());
    button(element, 'Prepare an addendum')!.click();
    const created = http.expectOne('/api/v1/tenders/t1/addenda');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(
      expect.objectContaining({ acknowledgementRequired: true, version: null }),
    );
    created.flush(
      view({
        draft: addendum({ title: null, summary: null, missingForIssue: ['title', 'summary'] }),
        canDraft: false,
      }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text(element)).toContain('Addendum in preparation (revision 2 when issued)');
    expect(button(element, 'Review and issue')!.disabled).toBe(true);
    expect(text(element)).toContain('Still needed before issue: Title and What changes and why');

    const title = element.querySelector('#addendum-title') as HTMLInputElement;
    title.value = 'Revised drawings';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // Unsaved changes: issuing waits for the save.
    expect(button(element, 'Review and issue')!.disabled).toBe(true);
    expect(text(element)).toContain('Save your changes before issuing.');
    submitForm(element, 'Save draft');
    const saved = http.expectOne('/api/v1/tenders/t1/addenda/a1');
    expect(saved.request.method).toBe('PUT');
    expect(saved.request.body).toEqual(
      expect.objectContaining({ title: 'Revised drawings', version: 'a-v1' }),
    );
    saved.flush(view({ draft: addendum({ version: 'a-v2' }), canDraft: false }));
    fixture.detectChanges();

    button(element, 'Review and issue')!.click();
    fixture.detectChanges();
    expect(text(element)).toContain('It becomes addendum 1 and tender revision 2');
    expect(text(element)).toContain('Each firm must acknowledge it before submitting a bid.');
    button(element, 'Issue the addendum')!.click();
    const issue = http.expectOne('/api/v1/tenders/t1/addenda/a1/issue');
    expect(issue.request.body).toEqual({ version: 'a-v2', tenderVersion: 't-v1' });
    issue.flush(
      view({
        currentRevision: 2,
        issued: [
          addendum({
            status: 'Issued',
            number: 1,
            baseRevision: 1,
            resultingRevision: 2,
            issuedByName: 'Maha',
            issuedAtUtc: '2026-10-02T11:00:00Z',
            acknowledgementExpected: 2,
            acknowledgedCount: 1,
            acknowledgements: [
              {
                invitationId: 'i1',
                subcontractorCode: 'ACME-01',
                subcontractorName: 'Acme',
                invitationStatus: 'BidStarted',
                expected: true,
                acknowledgedAtUtc: '2026-10-02T12:00:00Z',
                acknowledgedByName: 'Rana',
              },
              {
                invitationId: 'i2',
                subcontractorCode: 'BETA-01',
                subcontractorName: 'Beta',
                invitationStatus: 'Invited',
                expected: true,
                acknowledgedAtUtc: null,
                acknowledgedByName: null,
              },
            ],
          }),
        ],
      }),
    );
    // The tender itself changed: the page reloads it.
    http.expectOne('/api/v1/tenders/t1').flush(published({ version: 't-v2', currentRevision: 2 }));
    fixture.detectChanges();
    expect(announced.at(-1)).toBe(
      'Addendum 1 issued as revision 2. Every invited firm is being emailed.',
    );
    const content = text(element);
    expect(content).toContain('Acknowledgements: 1 of 2 (required)');
    expect(content).toContain('Not acknowledged yet');
    http.verify();
  });

  it('extends the deadline only with a reason, sends a request key, and shows an officer no issue or extend control', async () => {
    const { http, fixture, element, announced } = renderAddenda(MANAGER, view());
    button(element, 'Extend the deadline')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-labelledby')).toBe('extend-title');
    const deadline = dialog.querySelector('#extend-deadline') as HTMLInputElement;
    deadline.value = '2099-10-20T14:00';
    deadline.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submitForm(dialog, 'Extend and notify bidders');
    fixture.detectChanges();
    expect(text(dialog)).toContain('Explain the reason (at least 3 characters).');
    http.expectNone('/api/v1/tenders/t1/deadline-extensions');
    const reason = dialog.querySelector('#extend-reason') as HTMLTextAreaElement;
    reason.value = 'Site visit moved';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submitForm(dialog, 'Extend and notify bidders');
    const request = http.expectOne('/api/v1/tenders/t1/deadline-extensions');
    expect(request.request.body).toEqual({
      newDeadlineLocal: '2099-10-20T14:00',
      newQuestionsDeadlineLocal: null,
      reason: 'Site visit moved',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      version: 't-v1',
    });
    request.flush(
      { status: 400, code: 'tender.extension_not_later' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(text(dialog)).toContain('The new deadline must be later than the current deadline.');
    expect(announced).toEqual([]);
    http.verify();

    TestBed.resetTestingModule();
    const officer = renderAddenda(OFFICER, view({ draft: addendum(), canDraft: false }));
    expect(button(officer.element, 'Extend the deadline')).toBeUndefined();
    expect(button(officer.element, 'Review and issue')).toBeUndefined();
    expect(text(officer.element)).toContain(
      'A Procurement Manager or Company Admin issues the addendum.',
    );
    officer.http.verify();
  });
});
