import { InvalidSubmitFocus } from '../../core/a11y/invalid-submit-focus';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessFormat } from '../../core/localization/business-format';
import { knownProductProblem } from '../../core/localization/product-problem';
import { Paged } from '../subcontractors/subcontractors.api';
import { TenderBuilder } from './tender-builder';
import { TenderControl } from './tender-control';
import { TenderList } from './tender-list';
import { TenderDetail, TenderSummary, describeLocal, fileSize } from './tendering.api';
import { invitation, published, tender } from './tendering.fixtures';
import { WorkPackageTender } from './work-package-tender';

const FEATURES = ['projects', 'subcontractor_directory', 'sourcing', 'tendering'];
const MANAGER = [
  'Tenders.View',
  'Tenders.Create',
  'Tenders.Edit',
  'Tenders.Publish',
  'Tenders.ManageInvitations',
  'Tenders.Cancel',
];
const OFFICER = ['Tenders.View', 'Tenders.Create', 'Tenders.Edit', 'Tenders.ManageInvitations'];
const VIEWER = ['Tenders.View'];

function configure(permissions: readonly string[], features: readonly string[] = FEATURES) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'tenders/:id', children: [] },
        { path: '**', children: [] },
      ]),
    ],
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
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(EntitlementsService).load().subscribe();
  http.expectOne('/api/v1/company/features').flush({ features });
  return http;
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const buttons = (element: HTMLElement) =>
  [...element.querySelectorAll('button')].map((button) => text(button).trim());

function paged<T>(items: T[]): Paged<T> {
  return {
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: items.length ? 1 : 0,
  };
}

function renderBuilder(permissions: readonly string[], detail: TenderDetail) {
  const http = configure(permissions);
  const fixture = TestBed.createComponent(TenderBuilder);
  fixture.componentRef.setInput('tender', detail);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

/** The Part 8 sections of the control center load their own data (addenda, clarifications); empty here. */
function flushCommunications(http: HttpTestingController): void {
  for (const request of http.match((candidate) => candidate.url.endsWith('/addenda')))
    request.flush({
      currentRevision: 1,
      draft: null,
      issued: [],
      currentDocuments: [],
      canDraft: true,
      canExtend: true,
      tenderVersion: 'v1',
    });
  for (const request of http.match((candidate) => candidate.url.endsWith('/clarifications')))
    request.flush({ total: 0, open: 0, answeredPrivately: 0, published: 0, items: [] });
  // CF-058: the outside-portal panel (off unless the company turned it on).
  for (const request of http.match((candidate) => candidate.url.endsWith('/outside-bids')))
    request.flush({ enabled: false, canRecord: false, intakes: [] });
}

function renderControl(
  permissions: readonly string[],
  detail: TenderDetail,
  features: readonly string[] = FEATURES,
) {
  const http = configure(permissions, features);
  const fixture = TestBed.createComponent(TenderControl);
  fixture.componentRef.setInput('tender', detail);
  fixture.detectChanges();
  // The receipts panel loads once per tender (Part 7); these tests are about invitations.
  for (const request of http.match((candidate) => candidate.url.endsWith('/bids')))
    request.flush({ invited: 0, inProgress: 0, submitted: 0, contentSealed: true, receipts: [] });
  flushCommunications(http);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

describe('tender refusals and presentation helpers', () => {
  it('explains every tender refusal with its parameters', () => {
    expect(
      knownProductProblem({
        code: 'tender.incomplete',
        parameters: { fields: 'scopeInstructions,submissionDeadline' },
      }),
    ).toBe(
      'Complete the tender before publishing it: Scope and instructions and Submission deadline.',
    );
    expect(
      knownProductProblem({
        code: 'tender.invitee_not_active',
        parameters: { code: 'BETA', status: 'Blocked' },
      }),
    ).toContain('Blocked in the directory');
    expect(
      knownProductProblem({ code: 'tender.invitation_send_too_soon', parameters: { minutes: 5 } }),
    ).toContain('Wait 5 minutes');
    expect(
      knownProductProblem({
        code: 'quota.exceeded',
        parameters: { quota: 'max_active_tenders', limit: 1 },
      }),
    ).toContain('active-tender capacity');
    expect(knownProductProblem({ code: 'bidder.link_invalid' })).toContain(
      'invalid or has expired',
    );
    expect(
      knownProductProblem({
        code: 'email.template_placeholder_unknown',
        parameters: { placeholder: 'Password', field: 'subject' },
      }),
    ).toContain('{{Password}}');
  });

  it('states a deadline in the tender time zone with its UTC offset', () => {
    expect(
      describeLocal(
        { utc: '2026-10-15T11:00:00Z', local: '2026-10-15T14:00', offset: '+03:00' },
        'Asia/Riyadh',
        'en',
      ),
    ).toBe('Oct 15, 2026, 14:00 (Asia/Riyadh, UTC+03:00)');
  });
});

describe('tender list', () => {
  it('lists tenders in a table, filters on the server and explains an empty result', () => {
    const http = configure(VIEWER);
    const fixture = TestBed.createComponent(TenderList);
    fixture.detectChanges();
    const summary: TenderSummary = {
      id: 't1',
      reference: 'TND-2026-0001',
      type: 'Rfq',
      title: 'HVAC installation',
      status: 'Published',
      deadlineState: 'ClosingSoon',
      submissionDeadlineUtc: '2026-10-15T11:00:00Z',
      timeZoneId: 'Asia/Riyadh',
      workPackage: tender().workPackage,
      invitationCount: 3,
      intendsToBidCount: 1,
      declinedCount: 1,
      failedDeliveryCount: 1,
      updatedAtUtc: '2026-10-01T09:00:00Z',
      stage: 'OpenForBids',
      lifecycle: 'OpenForBids',
    };
    // CF-009: an awarded tender reads where it is, never "Published".
    const awarded: TenderSummary = {
      ...summary,
      id: 't2',
      reference: 'TND-2026-0002',
      deadlineState: 'Closed',
      stage: 'Awarded',
      lifecycle: 'AwaitingAnswer',
      awardId: 'a2',
    };
    http.expectOne((request) => request.url === '/api/v1/tenders').flush(paged([summary, awarded]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('table')).not.toBeNull();
    expect(element.querySelector('a[href="/tenders/t1"]')?.textContent).toContain('TND-2026-0001');
    expect(text(element)).toContain('Bidding closes soon');
    expect(text(element)).toContain(
      'Invited: 3 · Intend to bid, not yet submitted: 1 · Declined: 1',
    );
    expect(text(element)).toContain('Failed emails: 1');
    expect(text(element)).toContain('Open for bids');
    expect(text(element)).toContain("Awarded — awaiting the firm's answer");
    expect(text(element)).not.toContain('Published');

    fixture.componentInstance.stage = 'Awarded';
    fixture.componentInstance.search = ' TND ';
    fixture.componentInstance.applyFilter();
    const filtered = http.expectOne((request) => request.url === '/api/v1/tenders');
    expect(filtered.request.params.getAll('stage')).toEqual(['Awarded']);
    expect(filtered.request.params.has('status')).toBe(false);
    expect(filtered.request.params.get('search')).toBe('TND');
    filtered.flush(paged([]));
    fixture.detectChanges();
    expect(text(element)).toContain('No tender matches this search');
    http.verify();
  });

  it("shows each deadline in the tender's zone with its offset and the UTC instant on hover (B-098-1)", () => {
    const http = configure(VIEWER);
    const fixture = TestBed.createComponent(TenderList);
    fixture.detectChanges();
    const summary: TenderSummary = {
      id: 't1',
      reference: 'TND-2026-0001',
      type: 'Rfq',
      title: 'HVAC installation',
      status: 'Published',
      deadlineState: 'Open',
      submissionDeadlineUtc: '2026-10-15T11:00:00Z',
      timeZoneId: 'Asia/Riyadh',
      workPackage: tender().workPackage,
      invitationCount: 3,
      intendsToBidCount: 1,
      declinedCount: 0,
      failedDeliveryCount: 0,
      updatedAtUtc: '2026-10-01T09:00:00Z',
      stage: 'OpenForBids',
      submissionDeadline: {
        utc: '2026-10-15T11:00:00Z',
        local: '2026-10-15T14:00',
        offset: '+03:00',
      },
    };
    const draft: TenderSummary = {
      ...summary,
      id: 't2',
      reference: 'TND-2026-0002',
      status: 'Draft',
      stage: 'Draft',
      submissionDeadlineUtc: null,
      submissionDeadline: null,
    };
    http.expectOne((request) => request.url === '/api/v1/tenders').flush(paged([summary, draft]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const headers = [...element.querySelectorAll('thead th')].map((cell) =>
      text(cell as HTMLElement).trim(),
    );
    expect(headers).toContain('Deadline (tender time)');
    expect(headers).not.toContain('Deadline (UTC)');
    const cells = [...element.querySelectorAll('tbody tr')].map(
      (row) => row.querySelectorAll('td')[3] as HTMLElement,
    );
    expect(text(cells[0]).trim()).toBe('Oct 15, 2026, 14:00 (Asia/Riyadh, UTC+03:00)');
    const utc = TestBed.inject(BusinessFormat).dateTime('2026-10-15T11:00:00Z');
    expect(utc).toContain('UTC');
    expect(cells[0].getAttribute('title')).toBe(utc);
    expect(text(cells[1]).trim()).toBe('—');
    expect(cells[1].hasAttribute('title')).toBe(false);
    http.verify();
  });
});

describe('tender builder', () => {
  it('walks an officer through the steps and saves the whole draft with its version', () => {
    const { http, fixture, element, page } = renderBuilder(OFFICER, tender());
    expect(element.querySelectorAll('.tnd-step').length).toBe(6);
    expect(element.querySelector('[aria-current="step"]')?.textContent).toContain('Basics');

    page.form.title = '  HVAC works  ';
    page.form.scopeInstructions = 'Supply, install and commission.';
    page.save('documents');
    const save = http.expectOne('/api/v1/tenders/t1');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toMatchObject({
      title: 'HVAC works',
      scopeInstructions: 'Supply, install and commission.',
      submissionDeadlineLocal: '2026-10-15T14:00',
      timeZoneId: 'Asia/Riyadh',
      reminderDays: [3, 1],
      requiredDocuments: ['Priced BOQ'],
      // CF-053: the draft's duration requirement travels with every save.
      durationRequired: true,
      // CF-055: no pricing basis or terms stated yet — sent as "none", never omitted.
      pricing: { treatment: null, vatRatePercent: null, note: null },
      terms: {
        retentionPercent: null,
        advancePaymentPercent: null,
        performanceSecurityPercent: null,
        bidBondRequired: false,
        paymentTermsNote: null,
      },
      version: 'v1',
    });
    save.flush(tender({ title: 'HVAC works', version: 'v2' }));
    fixture.componentRef.setInput('tender', tender({ title: 'HVAC works', version: 'v2' }));
    fixture.detectChanges();
    expect(page.step()).toBe('documents');
    expect(text(element)).toContain('they are not scanned for viruses');
    http.verify();
  });

  it('refuses a questions deadline after the submission deadline before sending anything', () => {
    const { http, fixture, element, page } = renderBuilder(OFFICER, tender());
    page.form.questionsDeadlineLocal = '2026-10-16T10:00';
    page.save('review');
    fixture.detectChanges();
    http.expectNone('/api/v1/tenders/t1');
    expect(text(element)).toContain(
      'The questions deadline must be before the submission deadline.',
    );
    http.verify();
  });

  it('invites from the approved shortlist on a chosen contact and shows who is invited', () => {
    const { http, fixture, element, page } = renderBuilder(OFFICER, tender());
    page.go('invitees');
    fixture.detectChanges();
    expect(text(element)).toContain('From the approved shortlist, round 1');
    expect(buttons(element)).toContain('Invite Beta Cooling');
    const beta = page.members().find((member) => member.subcontractorId === 's2')!;
    page.addInvitee(beta);
    const add = http.expectOne('/api/v1/tenders/t1/invitees');
    expect(add.request.body).toEqual({ subcontractorId: 's2', contactId: 'c3', version: 'v1' });
    add.flush(tender({ version: 'v2' }));
    http.verify();
  });

  it('leaves publication to a manager, shows the real email and confirms what publishing does', () => {
    const officer = renderBuilder(OFFICER, tender());
    officer.page.go('review');
    officer.http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush({
      templateKey: 'tender.invitation',
      locale: 'en',
      templateVersion: 0,
      subject: 'Invitation to tender: TND-2026-0001 – HVAC installation',
      textBody: 'Dear Rana Estimator, …',
      fromName: 'Delta via Bid Platform',
      fromAddress: 'noreply@platform.example',
      replyToAddress: 'maha@delta.example',
      senderSource: 'Platform',
      senderReady: true,
      senderProblem: null,
    });
    officer.fixture.detectChanges();
    expect(text(officer.element)).toContain('Invitation to tender: TND-2026-0001');
    expect(text(officer.element)).toContain(
      'A Procurement Manager or Company Admin publishes the tender.',
    );
    expect(buttons(officer.element)).not.toContain('Publish and send invitations');
    TestBed.resetTestingModule();

    const manager = renderBuilder(MANAGER, tender());
    manager.page.go('review');
    manager.http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush({
      templateKey: 'tender.invitation',
      locale: 'en',
      templateVersion: 0,
      subject: 's',
      textBody: 'b',
      fromName: null,
      fromAddress: null,
      replyToAddress: null,
      senderSource: 'Platform',
      senderReady: false,
      senderProblem: 'not_configured',
    });
    manager.fixture.detectChanges();
    expect(text(manager.element)).toContain(
      'Emails cannot be sent right now: No mail server is configured.',
    );
    manager.page.open({ kind: 'publish' });
    manager.fixture.detectChanges();
    expect(text(manager.element)).toContain('is frozen and can no longer be edited here');
    let changed: TenderDetail | null = null;
    manager.page.changed.subscribe((value) => (changed = value));
    manager.page.confirm();
    const publish = manager.http.expectOne('/api/v1/tenders/t1/publish');
    expect(publish.request.body).toEqual({ version: 'v1' });
    publish.flush(published());
    expect(changed).not.toBeNull();
    manager.http.verify();
  });

  it('warns before publishing when no scorecard policy is active and still publishes (CF-013 AC3)', () => {
    const preview = {
      templateKey: 'tender.invitation',
      locale: 'en',
      templateVersion: 0,
      subject: 's',
      textBody: 'b',
      fromName: null,
      fromAddress: null,
      replyToAddress: null,
      senderSource: 'Platform',
      senderReady: true,
      senderProblem: null,
    };
    const http = configure([...MANAGER, 'Evaluation.View'], [...FEATURES, 'evaluation']);
    const fixture = TestBed.createComponent(TenderBuilder);
    fixture.componentRef.setInput('tender', tender());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance;
    page.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(preview);
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Inactive' }]);
    http.expectOne('/api/v1/access/role-holders?permission=Evaluation.ManagePolicy').flush({
      permission: 'Evaluation.ManagePolicy',
      roles: ['CompanyAdmin', 'ProcurementManager'],
    });
    // No recommendation read: the plan has no award stage.
    http.expectNone('/api/v1/recommendation-policies');
    fixture.detectChanges();
    const warning =
      'No scorecard policy is active. Bids can be received, but the evaluation cannot start until Company Admin or Procurement Manager activates one.';
    const notes = () =>
      [...element.querySelectorAll('[data-testid="policy-warning"]')].map((note) =>
        text(note as HTMLElement).trim(),
      );
    expect(notes()).toEqual([warning]);
    expect(element.querySelector('[data-testid="policy-warning"]')!.getAttribute('role')).toBe(
      'note',
    );

    // The publish dialog repeats it, and publishing is still sent.
    page.open({ kind: 'publish' });
    fixture.detectChanges();
    expect(notes()).toEqual([warning, warning]);
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].every(
        (button) => !button.disabled,
      ),
    ).toBe(true);
    page.confirm();
    http.expectOne('/api/v1/tenders/t1/publish').flush(published());
    http.verify();
  });

  it('warns about a missing recommendation policy and says nothing when policies are active or unreadable (CF-013 AC3)', () => {
    const preview = {
      templateKey: 'tender.invitation',
      locale: 'en',
      templateVersion: 0,
      subject: 's',
      textBody: 'b',
      fromName: null,
      fromAddress: null,
      replyToAddress: null,
      senderSource: 'Platform',
      senderReady: true,
      senderProblem: null,
    };
    const http = configure(
      [...MANAGER, 'Evaluation.View', 'Decision.View'],
      [...FEATURES, 'evaluation', 'award'],
    );
    const fixture = TestBed.createComponent(TenderBuilder);
    fixture.componentRef.setInput('tender', tender());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(preview);
    http
      .expectOne('/api/v1/evaluation-policies')
      .flush([{ status: 'Inactive' }, { status: 'Active' }]);
    http.expectOne('/api/v1/recommendation-policies').flush([]);
    http
      .expectOne('/api/v1/access/role-holders?permission=Recommendation.ManagePolicy')
      .flush({ permission: 'Recommendation.ManagePolicy', roles: ['ProcurementManager'] });
    fixture.detectChanges();
    const notes = () =>
      [...element.querySelectorAll('[data-testid="policy-warning"]')].map((note) =>
        text(note as HTMLElement).trim(),
      );
    expect(notes()).toEqual([
      'No recommendation policy is active. Bids can be received, but the recommendation cannot be computed until Procurement Manager activates one.',
    ]);

    // Active policies (or a failed read) leave the review step without a warning.
    fixture.componentInstance.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(preview);
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Active' }]);
    http
      .expectOne('/api/v1/recommendation-policies')
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(notes()).toEqual([]);
    http.verify();
  });

  it('still warns about a missing policy, without role names, when the role holders cannot be read (re-audit O)', () => {
    const preview = {
      templateKey: 'tender.invitation',
      locale: 'en',
      templateVersion: 0,
      subject: 's',
      textBody: 'b',
      fromName: null,
      fromAddress: null,
      replyToAddress: null,
      senderSource: 'Platform',
      senderReady: true,
      senderProblem: null,
    };
    const http = configure(
      [...MANAGER, 'Evaluation.View', 'Decision.View'],
      [...FEATURES, 'evaluation', 'award'],
    );
    const fixture = TestBed.createComponent(TenderBuilder);
    fixture.componentRef.setInput('tender', tender());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(preview);
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Inactive' }]);
    http.expectOne('/api/v1/recommendation-policies').flush([]);
    http
      .expectOne('/api/v1/access/role-holders?permission=Evaluation.ManagePolicy')
      .flush(null, { status: 500, statusText: 'Error' });
    http
      .expectOne('/api/v1/access/role-holders?permission=Recommendation.ManagePolicy')
      .flush(null, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    const notes = [...element.querySelectorAll('[data-testid="policy-warning"]')].map((note) =>
      text(note as HTMLElement).trim(),
    );
    expect(notes).toEqual([
      'No scorecard policy is active. Bids can be received, but the evaluation cannot start until one is activated.',
      'No recommendation policy is active. Bids can be received, but the recommendation cannot be computed until one is activated.',
    ]);
    http.verify();
  });

  it('summarises an invalid builder step first in its form and focuses the field (CF-020)', async () => {
    const { http, fixture, element, page } = renderBuilder(OFFICER, tender());
    TestBed.inject(InvalidSubmitFocus).start();
    document.body.appendChild(element);
    await fixture.whenStable();
    const title = element.querySelector<HTMLInputElement>('#tender-title')!;
    title.value = '';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(page.form.title).toBe('');
    const form = element.querySelector('form')!;
    expect(form.firstElementChild!.tagName).toBe('APP-ERROR-SUMMARY');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await (async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
    })();
    fixture.detectChanges();
    const summary = form.querySelector('.prj-error-summary')!;
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(summary.textContent).toContain('1 field needs attention');
    const link = summary.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('#tender-title');
    expect(link.textContent).toContain('Title');
    expect(link.textContent).toContain('Enter a title.');
    expect(document.activeElement?.id).toBe('tender-title');
    http.expectNone('/api/v1/tenders/t1');
    element.remove();
  });

  it('asks for a reload instead of overwriting a colleague on a stale save', () => {
    const { http, page } = renderBuilder(OFFICER, tender());
    let reload = '';
    page.reloadRequested.subscribe((message) => (reload = message));
    page.form.title = 'New title';
    page.save();
    http
      .expectOne('/api/v1/tenders/t1')
      .flush({ code: 'concurrency.stale' }, { status: 409, statusText: 'Conflict' });
    expect(reload).toContain('Someone else changed this tender');
    http.verify();
  });

  it('lets a reader follow a draft without offering any preparation control', async () => {
    const { element, fixture } = renderBuilder(VIEWER, tender());
    // ngModel applies a disabled state asynchronously.
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(element)).toContain('You can follow this draft');
    expect(buttons(element)).not.toContain('Save and continue');
    expect((element.querySelector('#tender-title') as HTMLInputElement).disabled).toBe(true);
  });

  it('reads a price schedule as a dry run, applies it only when the whole file is valid, and saves it with the draft (CF-004)', () => {
    const { http, fixture, element, page } = renderBuilder(OFFICER, tender());
    page.go('requirements');
    fixture.detectChanges();
    expect(text(element)).toContain('No price schedule: bidders state a lump sum.');
    const choose = () => {
      const input = element.querySelector('#tender-schedule-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], 'boq.xlsx')],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      return http.expectOne('/api/v1/tenders/t1/schedule/import');
    };
    const faulty = choose();
    expect(faulty.request.body instanceof FormData).toBe(true);
    faulty.flush({
      sha256: 'a',
      rows: 2,
      items: [],
      canApply: false,
      issues: [
        {
          row: 2,
          code: 'schedule.item_invalid',
          column: 'quantity',
          parameters: { field: 'quantity', reason: 'number', decimals: '3' },
        },
        {
          row: 3,
          code: 'schedule.item_invalid',
          column: 'item',
          parameters: { field: 'key', reason: 'duplicate', firstRow: '2' },
        },
      ],
    });
    fixture.detectChanges();
    expect(text(element)).toContain(
      'Row 2: Price schedule: Quantity must be a plain number with at most 3 decimal places — it is never rounded.',
    );
    expect(text(element)).toContain('Row 3: the item code repeats row 2');
    expect(text(element)).not.toContain('Replace the schedule with these');
    expect(page.form.schedule).toEqual([]);

    choose().flush({
      sha256: 'b',
      rows: 2,
      canApply: true,
      issues: [],
      items: [
        {
          key: 'A.1',
          section: 'Ductwork',
          description: 'Supply duct',
          unit: 'm2',
          quantity: '120.125',
          type: 'Measured',
          provisionalAmount: null,
        },
        {
          key: 'A.2',
          section: null,
          description: 'Allowance',
          unit: null,
          quantity: null,
          type: 'ProvisionalSum',
          provisionalAmount: '25000.50',
        },
      ],
    });
    fixture.detectChanges();
    const apply = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Replace the schedule with these 2 items'),
    ) as HTMLButtonElement;
    apply.click();
    fixture.detectChanges();
    expect(page.form.schedule.map((item) => item.key)).toEqual(['A.1', 'A.2']);
    expect(text(element)).toContain('2 items placed in the schedule. Save the draft to keep them.');
    page.save();
    const save = http.expectOne('/api/v1/tenders/t1');
    expect(save.request.body.schedule).toEqual([
      {
        key: 'A.1',
        section: 'Ductwork',
        description: 'Supply duct',
        unit: 'm2',
        quantity: '120.125',
        type: 'Measured',
        provisionalAmount: null,
      },
      {
        key: 'A.2',
        section: null,
        description: 'Allowance',
        unit: null,
        quantity: null,
        type: 'ProvisionalSum',
        provisionalAmount: '25000.50',
      },
    ]);
    http.verify();
  });

  it('lets the preparer mark a complete draft ready to publish and shows the four-eyes rule (CF-130)', () => {
    const { http, fixture, element, page } = renderBuilder(
      OFFICER,
      tender({ missingForPublication: [], requireIndependentPublish: true }),
    );
    page.requestPublish();
    const request = http.expectOne('/api/v1/tenders/t1/request-publish');
    expect(request.request.body).toEqual({ version: 'v1' });
    const marked = tender({
      missingForPublication: [],
      requireIndependentPublish: true,
      publishRequestedAtUtc: '2026-10-01T08:00:00Z',
      publishRequestedByName: 'Omar Officer',
      version: 'v2',
    });
    request.flush(marked);
    fixture.componentRef.setInput('tender', marked);
    page.go('review');
    fixture.detectChanges();
    http.match(() => true).forEach((pending) => pending.flush({}));
    fixture.detectChanges();
    expect(text(element)).toContain('Ready to publish — marked by Omar Officer');
    expect(text(element)).toContain(
      'published by someone other than who prepared or last changed it',
    );
  });
});

describe('tender control center', () => {
  it('names the next stage the plan does not include instead of ending silently', () => {
    // CF-105: bids opened on a plan without the award — the decision area says so.
    const opened = published({
      closure: { bidsOpenedAtUtc: '2026-10-01T09:00:00Z' } as unknown as TenderDetail['closure'],
    });
    const { element } = renderControl([...VIEWER, 'Evaluation.View', 'Decision.View'], opened, [
      ...FEATURES,
      'evaluation',
    ]);
    expect(text(element)).toContain(
      'Negotiation, recommendation and award is not included in your company plan.',
    );
    expect(element.querySelectorAll('[data-testid="not-in-plan"]').length).toBe(1);
    TestBed.resetTestingModule();
    // Without evaluation, that is the boundary named.
    const { element: basic } = renderControl([...VIEWER, 'Evaluation.View'], opened);
    expect(text(basic)).toContain('Evaluation is not included in your company plan.');
    TestBed.resetTestingModule();
    // A reader who could not use the stage anyway is told nothing.
    const { element: viewer } = renderControl(VIEWER, opened);
    expect(viewer.querySelector('[data-testid="not-in-plan"]')).toBeNull();
  });

  it('offers to close an opened tender without an award only on a plan without award (CF-060)', () => {
    const opened = published({
      closure: { bidsOpenedAtUtc: '2026-10-01T09:00:00Z' } as unknown as TenderDetail['closure'],
    });
    const { element } = renderControl(MANAGER, opened, [...FEATURES, 'evaluation']);
    expect(buttons(element)).toContain('Close without award');
    TestBed.resetTestingModule();
    const { element: full } = renderControl(MANAGER, opened, [...FEATURES, 'evaluation', 'award']);
    expect(buttons(full)).not.toContain('Close without award');
    TestBed.resetTestingModule();
    const { element: sealed } = renderControl(MANAGER, published(), [...FEATURES, 'evaluation']);
    expect(buttons(sealed)).not.toContain('Close without award');
  });

  it('shows who was invited, what the mail server did, and what needs attention, without claiming delivery', () => {
    const detail = published({
      invitations: [
        invitation(),
        invitation({
          id: 'i2',
          subcontractorId: 's2',
          subcontractorCode: 'BETA',
          subcontractorName: 'Beta Cooling',
          recipientEmail: 'bilal@beta.example',
          deliveryStatus: 'Failed',
          lastFailureCategory: 'authentication_failed',
          lastSentAtUtc: null,
          canRemind: false,
        }),
      ],
      counts: {
        total: 2,
        queued: 0,
        sent: 1,
        failed: 1,
        opened: 0,
        intendsToBid: 0,
        declined: 0,
        noResponse: 2,
        revoked: 0,
      },
    });
    const { element } = renderControl(VIEWER, detail);
    const content = text(element);
    expect(content).toContain('Accepted by mail server');
    expect(content).toContain('does not prove the email reached an inbox');
    expect(content).toContain('The mail server refused the user name or password');
    expect(content).toContain('Failed emails: 1. Open each invitation to see why, then resend.');
    expect(content).toContain('Not opened');
    expect(content).toContain('Oct 15, 2026, 14:00 (Asia/Riyadh, UTC+03:00)');
    expect(buttons(element)).not.toContain('Cancel tender');
  });

  it('offers only a view-only link, and says when a firm link was once shown and must be replaced', () => {
    const sealed = invitation({
      status: 'BidStarted',
      firmLinkShown: true,
    });
    const { http, fixture, element, page } = renderControl(
      OFFICER,
      published({ invitations: [sealed] }),
    );
    page.select(page.tender().invitations[0]);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/tenders/t1/invitations/i1/activity')
      .flush({ invitation: sealed, events: [], deliveries: [] });
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(buttons(dialog)).toContain('Show view-only link');
    expect(buttons(dialog)).not.toContain('Show link to copy');
    expect(buttons(dialog)).toContain('Replace link');
    expect(text(dialog)).toContain('it can now only view the invitation');
    // A click inside the dialog is never cancelled by the backdrop handler: the checkbox really toggles.
    (
      [...dialog.querySelectorAll('button')].find((candidate) =>
        text(candidate).includes('Replace link'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const email = dialog.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(email).not.toBeNull();
    const before = email.checked;
    email.click();
    expect(email.checked).toBe(!before);
  });

  it('opens an invitation with its history; an officer resends, reveals the link and must explain a revocation', async () => {
    const { http, fixture, element, page } = renderControl(OFFICER, published());
    page.select(page.tender().invitations[0]);
    fixture.detectChanges();
    http.expectOne('/api/v1/tenders/t1/invitations/i1/activity').flush({
      invitation: invitation(),
      events: [
        {
          id: 'e1',
          type: 'EmailSent',
          actorKind: 'System',
          actorName: 'system',
          occurredAtUtc: '2026-10-01T09:01:00Z',
          detail: 'Invitation',
        },
      ],
      deliveries: [
        {
          id: 'd1',
          kind: 'Invitation',
          status: 'Sent',
          recipientName: 'Rana Estimator',
          recipientEmail: 'rana@acme.example',
          locale: 'en',
          templateKey: 'tender.invitation',
          templateVersion: 0,
          subject: 'Invitation',
          senderSource: 'Platform',
          fromAddress: 'noreply@platform.example',
          failureCategory: null,
          queuedAtUtc: '2026-10-01T09:00:00Z',
          attemptedAtUtc: '2026-10-01T09:00:30Z',
          completedAtUtc: '2026-10-01T09:01:00Z',
          requestedByName: 'Maha Manager',
        },
      ],
    });
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(text(dialog)).toContain('Email accepted by the mail server');
    expect(text(dialog)).toContain('Template version 0 (English)');
    expect(buttons(dialog)).toEqual(
      expect.arrayContaining([
        'Resend invitation',
        'Send reminder',
        'Show view-only link',
        'Replace link',
        'Revoke invitation',
      ]),
    );
    // The link is never in the table or the history; revealing it is its own request.
    expect(text(element)).not.toContain('#token=');
    const dialogComponent = fixture.debugElement.children.find(
      (child) => child.name === 'app-invitation-dialog',
    )!.componentInstance;
    dialogComponent.revealLink();
    http.expectOne('/api/v1/tenders/t1/invitations/i1/link').flush({
      url: 'https://app.example/en/tender-invitation#token=abc',
      tokenGeneration: 1,
      expiresAtUtc: null,
    });
    http
      .expectOne('/api/v1/tenders/t1/invitations/i1/activity')
      .flush({ invitation: invitation(), events: [], deliveries: [] });
    fixture.detectChanges();
    expect((element.querySelector('#invitation-link') as HTMLInputElement).value).toBe(
      'https://app.example/en/tender-invitation#token=abc',
    );
    expect(text(element)).toContain('View-only invitation link');
    expect(text(element)).toContain('nobody can answer or bid with it');

    dialogComponent.ask('revoke');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    // The pressed button is replaced by the question: focus stays inside the dialog, on it.
    expect(document.activeElement?.textContent).toContain('Revoke this invitation?');
    dialogComponent.reason = ' x ';
    dialogComponent.run();
    fixture.detectChanges();
    http.expectNone('/api/v1/tenders/t1/invitations/i1/revoke');
    expect(text(element)).toContain('Explain the reason (at least 3 characters).');
    dialogComponent.reason = 'Merged with another bidder.';
    dialogComponent.run();
    const revoke = http.expectOne('/api/v1/tenders/t1/invitations/i1/revoke');
    expect(revoke.request.body).toEqual({ reason: 'Merged with another bidder.', version: 'iv1' });
    revoke.flush(
      published({
        invitations: [
          invitation({
            status: 'Revoked',
            hasActiveLink: false,
            canResend: false,
            canRevoke: false,
          }),
        ],
      }),
    );
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    // The dead link and its Copy button are gone; the outcome is announced and focused inside the dialog.
    expect(element.querySelector('#invitation-link')).toBeNull();
    expect(document.activeElement?.textContent).toContain(
      'Invitation revoked. Its link no longer works.',
    );
    expect(element.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    http.verify();
  });

  it('shows a reader the history but no invitation action, and a manager must give a reason to cancel', () => {
    const reader = renderControl(VIEWER, published());
    reader.page.select(reader.page.tender().invitations[0]);
    reader.fixture.detectChanges();
    reader.http
      .expectOne('/api/v1/tenders/t1/invitations/i1/activity')
      .flush({ invitation: invitation(), events: [], deliveries: [] });
    reader.fixture.detectChanges();
    const dialog = reader.element.querySelector('[role="dialog"]') as HTMLElement;
    expect(buttons(dialog)).toEqual(['Close']);
    TestBed.resetTestingModule();

    const manager = renderControl(MANAGER, published());
    manager.page.startCancel();
    manager.fixture.detectChanges();
    manager.page.cancelReason = 'no';
    manager.page.confirmCancel();
    manager.http.expectNone('/api/v1/tenders/t1/cancel');
    manager.page.cancelReason = 'Scope withdrawn by client.';
    manager.page.confirmCancel();
    const cancel = manager.http.expectOne('/api/v1/tenders/t1/cancel');
    expect(cancel.request.body).toEqual({ reason: 'Scope withdrawn by client.', version: 'v1' });
    cancel.flush(published({ status: 'Cancelled', deadlineState: 'Cancelled' }));
    manager.http.verify();
  });

  it('says so and offers a manual check when automatic refreshing stops', () => {
    vi.useFakeTimers();
    try {
      const queued = published({ counts: { ...published().counts, queued: 2 } });
      const { http, fixture, element, page } = renderControl(VIEWER, queued);
      expect(text(element)).toContain('This page refreshes on its own.');
      vi.advanceTimersByTime(4000);
      http
        .expectOne('/api/v1/tenders/t1')
        .flush({}, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();
      expect(text(element)).not.toContain('This page refreshes on its own.');
      expect(text(element)).toContain('Check again to see the latest status.');
      page.checkAgain();
      http.expectOne('/api/v1/tenders/t1').flush(published());
      http.verify();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps checking while emails are queued and stops once they are sent', () => {
    vi.useFakeTimers();
    try {
      const queued = published({ counts: { ...published().counts, queued: 1 } });
      const { http, fixture, page } = renderControl(VIEWER, queued);
      let latest: TenderDetail | null = null;
      page.changed.subscribe((value) => (latest = value));
      vi.advanceTimersByTime(4000);
      http.expectOne('/api/v1/tenders/t1').flush(published());
      expect(latest).not.toBeNull();
      fixture.componentRef.setInput('tender', published());
      fixture.detectChanges();
      vi.advanceTimersByTime(8000);
      http.expectNone('/api/v1/tenders/t1');
      http.verify();
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a draft left by a firm that declined or was revoked apart, and names its row (B-085-1)', () => {
    const http = configure(VIEWER);
    const fixture = TestBed.createComponent(TenderControl);
    fixture.componentRef.setInput('tender', published());
    fixture.detectChanges();
    const draft = {
      invitationId: 'i1',
      subcontractorCode: 'ACME-01',
      subcontractorName: 'ACME Contracting',
      invitationStatus: 'BidStarted',
      bidReference: null,
      bidStatus: 'Draft',
      startedAtUtc: '2026-10-02T09:00:00Z',
      submittedAtUtc: null,
      revisionNumber: 1,
      submittedAttachmentCount: null,
      contentSha256: null,
      receiptEmailStatus: null,
    };
    for (const request of http.match((candidate) => candidate.url.endsWith('/bids')))
      request.flush({
        invited: 3,
        inProgress: 1,
        submitted: 0,
        contentSealed: true,
        draftsOfDeclinedFirms: 2,
        receipts: [
          draft,
          {
            ...draft,
            invitationId: 'i2',
            subcontractorCode: 'BETA-02',
            invitationStatus: 'Declined',
          },
          {
            ...draft,
            invitationId: 'i3',
            subcontractorCode: 'GAMA-03',
            invitationStatus: 'Revoked',
          },
        ],
      });
    flushCommunications(http);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const panels = [...element.querySelectorAll('dl.tnd-counts')];
    const counts = [...panels[panels.length - 1].querySelectorAll(':scope > div')].map((entry) => [
      text(entry.querySelector('dt') as HTMLElement).trim(),
      text(entry.querySelector('dd') as HTMLElement).trim(),
    ]);
    expect(counts).toEqual([
      ['Invited', '3'],
      ['Bid in progress', '1'],
      ['Bid submitted', '0'],
      // Re-audit Z: the counter also counts drafts of revoked invitations, and says so.
      ['Started, then declined or revoked', '2'],
    ]);
    const receipts = [...element.querySelectorAll('table')].find((table) =>
      text(table.querySelector('caption') as HTMLElement).includes('Bids received'),
    )!;
    const rows = [...receipts.querySelectorAll('tbody tr')].map((row) =>
      text(row.querySelectorAll('td')[1] as HTMLElement).trim(),
    );
    expect(rows).toEqual(['In progress', 'Started, then declined', 'Started, invitation revoked']);
    http.verify();
  });

  it('shows no declined-draft counter when there is none', () => {
    const { element } = renderControl(VIEWER, published());
    expect(text(element)).not.toContain('Started, then declined');
    expect(text(element)).not.toContain('declined or revoked');
  });
});

describe('work package tender panel', () => {
  it('offers RFQ and RFP once the shortlist is approved and opens the new draft', () => {
    const http = configure(OFFICER);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(WorkPackageTender);
    fixture.componentRef.setInput('workPackageId', 'wp1');
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/sourcing')
      .flush(paged([{ status: 'ShortlistApproved' }]));
    http.expectOne((request) => request.url === '/api/v1/tenders').flush(paged([]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(buttons(element)).toEqual(['Create RFQ', 'Create RFP']);
    fixture.componentInstance.create('Rfq');
    const create = http.expectOne('/api/v1/tenders');
    expect(create.request.body).toMatchObject({
      workPackageId: 'wp1',
      type: 'Rfq',
      emailLocale: 'en',
    });
    expect(typeof create.request.body.timeZoneId).toBe('string');
    create.flush(tender());
    expect(navigate).toHaveBeenCalledWith(['/tenders', 't1']);
    http.verify();
  });

  it('shows where the package tender is and links to its award and closeout for their readers (CF-009)', () => {
    const http = configure(
      ['Tenders.View', 'Decision.View', 'Performance.View'],
      [...FEATURES, 'evaluation', 'award', 'performance'],
    );
    const fixture = TestBed.createComponent(WorkPackageTender);
    fixture.componentRef.setInput('workPackageId', 'wp1');
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/sourcing')
      .flush(paged([{ status: 'ShortlistApproved' }]));
    http
      .expectOne((request) => request.url === '/api/v1/tenders')
      .flush(
        paged([
          {
            id: 't1',
            reference: 'TND-2026-0001',
            type: 'Rfq',
            title: 'HVAC installation',
            status: 'Published',
            deadlineState: 'Closed',
            submissionDeadlineUtc: '2026-10-15T11:00:00Z',
            timeZoneId: 'Asia/Riyadh',
            workPackage: tender().workPackage,
            invitationCount: 3,
            intendsToBidCount: 1,
            declinedCount: 0,
            failedDeliveryCount: 0,
            updatedAtUtc: '2026-10-01T09:00:00Z',
            stage: 'Awarded',
            lifecycle: 'CloseoutInProgress',
            awardId: 'a1',
          },
        ]),
      );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Closeout in progress');
    expect(text(element)).not.toContain('Published');
    const hrefs = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/tenders/t1/decision?tab=award');
    expect(hrefs).toContain('/closeouts/a1');
    http.verify();
  });

  it('gives a Project Manager (Performance.View, no Decision.View) the closeout link and no award link (B-009-2)', () => {
    // The tender list now returns awardId to Performance.View readers too (red-team G103).
    const http = configure(
      ['Tenders.View', 'Performance.View'],
      [...FEATURES, 'evaluation', 'award', 'performance'],
    );
    const fixture = TestBed.createComponent(WorkPackageTender);
    fixture.componentRef.setInput('workPackageId', 'wp1');
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/sourcing')
      .flush(paged([{ status: 'ShortlistApproved' }]));
    http
      .expectOne((request) => request.url === '/api/v1/tenders')
      .flush(
        paged([
          {
            id: 't1',
            reference: 'TND-2026-0001',
            type: 'Rfq',
            title: 'HVAC installation',
            status: 'Published',
            deadlineState: 'Closed',
            submissionDeadlineUtc: '2026-10-15T11:00:00Z',
            timeZoneId: 'Asia/Riyadh',
            workPackage: tender().workPackage,
            invitationCount: 3,
            intendsToBidCount: 1,
            declinedCount: 0,
            failedDeliveryCount: 0,
            updatedAtUtc: '2026-10-01T09:00:00Z',
            stage: 'Awarded',
            lifecycle: 'Awarded',
            awardId: 'a1',
          },
        ]),
      );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('a')];
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/closeouts/a1');
    expect(hrefs.some((href) => href?.includes('/decision'))).toBe(false);
    expect(links.map((link) => text(link).trim())).toContain('Closeout');
    expect(links.map((link) => text(link).trim())).not.toContain('Award');
    http.verify();
  });

  it('names the plan boundary for a company without tendering', () => {
    const http = configure(OFFICER, ['projects', 'subcontractor_directory', 'sourcing']);
    const fixture = TestBed.createComponent(WorkPackageTender);
    fixture.componentRef.setInput('workPackageId', 'wp1');
    fixture.detectChanges();
    http.expectNone((request) => request.url === '/api/v1/tenders');
    // CF-105: named, not silent.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Tendering is not included in your company plan.',
    );
    // CF-105 (D-105-1): the placeholder reads the plan once more when it is shown.
    http
      .expectOne('/api/v1/company/features')
      .flush({ features: ['projects', 'subcontractor_directory', 'sourcing'] });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Tendering is not included in your company plan.',
    );
    http.verify();
  });
});

describe('File sizes (CF-098)', () => {
  it('reads every size in kilobytes or megabytes, never in bytes', () => {
    expect(fileSize(793, 'en')).toBe('0.8 kB');
    expect(fileSize(1536, 'en')).toBe('1.5 kB');
    expect(fileSize(25 * 1024 * 1024, 'en')).toBe('25 MB');
    expect(fileSize(0, 'en')).toBe('0.1 kB');
  });
});
