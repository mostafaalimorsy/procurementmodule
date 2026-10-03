import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AUTOSAVE_DELAY_MS, BidWorkspace } from './bid-workspace';
import { Bid, BidderInvitation, EMPTY_BID } from './bidder.api';
import { bidView, invitationView } from './bid-workspace.spec.fixtures';
import { bidGapLabel } from '../../core/localization/labels';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function render(bid: Bid = bidView(), invitation: BidderInvitation = invitationView()) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(BidWorkspace);
  fixture.componentRef.setInput('token', 'secret-token');
  fixture.componentRef.setInput('invitation', invitation);
  fixture.componentRef.setInput('initial', bid);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const type = (selector: string, value: string) => {
    const input = element.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { http, fixture, element, page: fixture.componentInstance, type };
}

describe('bid workspace', () => {
  afterEach(() => vi.useRealTimers());

  it('marks the proposed duration as required when the tender asks for it, and names the gap (CF-053)', () => {
    const required = render();
    const input = required.element.querySelector('#bid-duration') as HTMLInputElement;
    expect(text(required.element)).toContain('Proposed duration (days, required)');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(bidGapLabel('durationDays', null, [])).toBe(
      'State your proposed duration: the tender requires one.',
    );
    TestBed.resetTestingModule();
    const optional = render(bidView(), { ...invitationView(), durationRequired: false });
    expect(text(optional.element)).not.toContain('days, required');
    expect(
      (optional.element.querySelector('#bid-duration') as HTMLInputElement).getAttribute(
        'aria-required',
      ),
    ).toBeNull();
  });

  it('shows the tender currency beside every amount and never lets the bidder pick another', () => {
    const { element } = render();
    const content = text(element);
    expect(content).toContain('Priced in QAR');
    expect(content).toContain('BID-7K4Q-M2XD');
    expect(element.querySelector('#bid-total')?.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('.bw-money__code')?.textContent).toBe('QAR');
    expect(element.querySelector('select')).toBeNull();
    expect(content).toContain('Submission deadline');
  });

  it('asks for the VAT basis and requested terms only when the tender states them, and saves the answers as typed (CF-055)', () => {
    vi.useFakeTimers();
    const plain = render();
    expect(plain.element.querySelector('#bid-vat')).toBeNull();
    expect(plain.element.querySelector('#bid-terms')).toBeNull();
    TestBed.resetTestingModule();
    const { http, element, page, fixture } = render(bidView(), {
      ...invitationView(),
      pricing: { treatment: 'ExclusiveOfVat', vatRatePercent: '15.00', note: null },
      terms: {
        retentionPercent: '10.00',
        advancePaymentPercent: null,
        performanceSecurityPercent: null,
        bidBondRequired: true,
        paymentTermsNote: null,
      },
    });
    expect(text(element.querySelector('#bid-vat') as HTMLElement)).toContain('Exclusive of VAT');
    expect(element.querySelector('#bid-advance')).toBeNull();
    page.form.vatConfirmed = 'no';
    page.form.vatTreatment = 'InclusiveOfVat';
    page.form.vatRatePercent = '15';
    page.form.retentionPercent = '7.5';
    page.form.bidBondProvided = 'yes';
    page.edited();
    fixture.detectChanges();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    const save = http.expectOne('/api/v1/tender-invitations/bid/draft');
    expect(save.request.body.content.pricing).toEqual({
      confirmed: false,
      treatment: 'InclusiveOfVat',
      vatRatePercent: '15',
    });
    expect(save.request.body.content.terms).toEqual({
      retentionPercent: '7.5',
      advancePaymentPercent: null,
      performanceSecurityPercent: null,
      bidBondProvided: true,
    });
    vi.useRealTimers();
  });

  it('autosaves shortly after typing stops with the version it last saw and announces each state', async () => {
    vi.useFakeTimers();
    const { http, fixture, element, page, type } = render();
    type('#bid-total', '1,250,000.5');
    expect(page.saveState()).toBe('dirty');
    expect(text(element.querySelector('.bw-save') as HTMLElement)).toContain('Unsaved changes');
    expect(element.querySelector('.bw-save')?.getAttribute('role')).toBe('status');
    http.expectNone('/api/v1/tender-invitations/bid/draft');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    const save = http.expectOne('/api/v1/tender-invitations/bid/draft');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body.token).toBe('secret-token');
    expect(save.request.body.draftVersion).toBe('v1');
    // Money leaves the browser as exact text, never as a number.
    expect(save.request.body.content.totalAmount).toBe('1250000.50');
    expect(typeof save.request.body.content.totalAmount).toBe('string');
    expect(page.saveState()).toBe('saving');
    save.flush({ draftVersion: 'v2', savedAtUtc: '2026-10-02T08:05:00Z', gaps: [] });
    fixture.detectChanges();
    expect(page.saveState()).toBe('saved');
    expect(text(element)).toContain('Saved');

    // The next save carries the new version.
    type('#bid-payment', '30% advance');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(http.expectOne('/api/v1/tender-invitations/bid/draft').request.body.draftVersion).toBe(
      'v2',
    );
  });

  it('does not save an amount it would have to guess, and says why next to the field', () => {
    vi.useFakeTimers();
    const { http, fixture, element, page, type } = render();
    type('#bid-total', '12.345');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    http.expectNone('/api/v1/tender-invitations/bid/draft');
    expect(page.saveState()).toBe('invalid');
    fixture.detectChanges();
    const input = element.querySelector('#bid-total') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('bid-error-totalAmount');
    expect(text(element)).toContain('Use at most 2 decimal places for QAR.');
  });

  it('refuses to overwrite newer work from another tab and offers to reload it', () => {
    vi.useFakeTimers();
    const { http, fixture, element, page, type } = render();
    type('#bid-total', '100');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    http
      .expectOne('/api/v1/tender-invitations/bid/draft')
      .flush({ code: 'bid.draft_stale' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(page.saveState()).toBe('conflict');
    expect(text(element)).toContain('saved from another tab or device after you opened it');
    expect(element.querySelectorAll('[role="alert"]').length).toBe(1);
    // No further automatic save can clobber the newer version.
    type('#bid-total', '200');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    http.expectNone('/api/v1/tender-invitations/bid/draft');
    (
      [...element.querySelectorAll('button')].find((button) =>
        text(button).includes('Reload the latest version'),
      ) as HTMLButtonElement
    ).click();
    http
      .expectOne('/api/v1/tender-invitations/bid')
      .flush(bidView({ draftVersion: 'v9', draft: { ...EMPTY_BID, totalAmount: '300.00' } }));
    fixture.detectChanges();
    expect(page.saveState()).toBe('saved');
    expect(page.form.totalAmount).toBe('300.00');
  });

  it('when the deadline passes during a save, keeps what was typed on screen, says it is closed and sends nothing more', () => {
    vi.useFakeTimers();
    const { http, fixture, element, page, type } = render();
    type('#bid-total', '1250000.50');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    http
      .expectOne('/api/v1/tender-invitations/bid/draft')
      .flush({ code: 'bid.deadline_passed' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(page.saveState()).toBe('closed');
    expect(text(element)).toContain('The submission deadline has passed');
    // Nothing the bidder typed is removed from the page, and no further save or submit is attempted.
    expect(page.form.totalAmount).toBe('1250000.50');
    expect((element.querySelector('#bid-total') as HTMLInputElement).value).toBe('1250000.50');
    type('#bid-total', '1250001');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    http.expectNone('/api/v1/tender-invitations/bid/draft');
    http.expectNone('/api/v1/tender-invitations/bid/submit');
  });

  it('warns before leaving with unsaved work', () => {
    vi.useFakeTimers();
    const { page, type } = render();
    const clean = new Event('beforeunload') as BeforeUnloadEvent;
    page.beforeUnload(clean);
    expect(clean.defaultPrevented).toBe(false);
    type('#bid-total', '100');
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    page.beforeUnload(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('adds up the price breakdown exactly and can use it as the total', () => {
    const { fixture, element, page } = render();
    page.addLine();
    page.addLine();
    page.form.lines[0] = { description: 'Supply', amount: '0.10' };
    page.form.lines[1] = { description: 'Install', amount: '0.20' };
    page.edited();
    fixture.detectChanges();
    expect(text(element)).toContain('Breakdown total: 0.30 QAR');
    page.useLinesTotal();
    expect(page.form.totalAmount).toBe('0.30');
  });

  it('uploads with visible progress, lets a failed upload be retried and files it against the document asked for', () => {
    const { http, fixture, element, page } = render();
    page.goTo('files');
    fixture.detectChanges();
    expect(text(element)).toContain('Priced BOQ');
    expect(text(element)).toContain(
      'scanned for malware; a file is shared only once the scanner finds it clean',
    );
    const file = new File(['%PDF-1.7'], 'boq.pdf', { type: 'application/pdf' });
    const input = element.querySelector('#bid-file-input-0') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const upload = http.expectOne('/api/v1/tender-invitations/bid/attachments');
    const form = upload.request.body as FormData;
    expect(form.get('token')).toBeNull();
    expect(upload.request.headers.get('X-Bid-Token')).toBe('secret-token');
    expect(form.get('requirement')).toBe('Priced BOQ');
    expect(upload.request.url).not.toContain('secret');
    upload.event({ type: 1, loaded: 50, total: 100 });
    fixture.detectChanges();
    expect(element.querySelector('progress')?.getAttribute('value')).toBe('50');
    expect(text(element)).toContain('Uploading 50%');
    upload.flush(
      { code: 'tender.document_type_not_allowed', parameters: { extensions: '.pdf' } },
      {
        status: 400,
        statusText: 'Bad Request',
      },
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Retry');
    const retry = [...element.querySelectorAll('button')].find((button) =>
      text(button).includes('Retry'),
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    http.expectOne('/api/v1/tender-invitations/bid/attachments').flush(
      bidView({
        attachments: [
          {
            id: 'a1',
            fileName: 'boq.pdf',
            contentType: 'application/pdf',
            sizeBytes: 8,
            requirementLabel: 'Priced BOQ',
            uploadedAtUtc: '2026-10-02T08:10:00Z',
          },
        ],
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('boq.pdf was uploaded to your bid.');
    expect(page.filesFor('Priced BOQ').length).toBe(1);
  });

  it('refuses a file type or size before sending it', () => {
    const { http, fixture, element, page } = render();
    page.goTo('files');
    fixture.detectChanges();
    const input = element.querySelector('#bid-file-input--1') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['MZ'], 'setup.exe')] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    http.expectNone('/api/v1/tender-invitations/bid/attachments');
    expect(text(element)).toContain('This type of file cannot be attached');
  });

  it('keeps Save draft and Submit bid apart: submission needs a complete, saved bid, a tick and a confirmation', () => {
    const complete = bidView({
      gaps: [],
      draft: {
        ...EMPTY_BID,
        totalAmount: '1250000.00',
        scopeCompliance: 'Full',
        technicalApproach: 'Two crews',
        validityDays: 90,
      },
      attachments: [
        {
          id: 'a1',
          fileName: 'boq.pdf',
          contentType: 'application/pdf',
          sizeBytes: 8,
          requirementLabel: 'Priced BOQ',
          uploadedAtUtc: '2026-10-02T08:10:00Z',
        },
      ],
    });
    const { http, fixture, element, page } = render(complete);
    page.goTo('review');
    fixture.detectChanges();
    expect(text(element)).toContain('Everything the tender asks for is in your bid.');
    expect(text(element)).toContain('Saving keeps a private draft');
    const submit = () =>
      [...element.querySelectorAll('button')].find(
        (button) => text(button).trim() === 'Submit bid',
      ) as HTMLButtonElement;
    // Enabled only by the checkbox; clicking without it explains.
    page.openConfirmation();
    fixture.detectChanges();
    expect(text(element)).toContain('Tick the confirmation box before submitting.');
    const box = element.querySelector('.bw-submit input[type="checkbox"]') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    submit().click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('1,250,000.00 QAR');
    expect(text(dialog)).toContain('Delta Construction');
    (
      [...dialog.querySelectorAll('button')].find((button) =>
        text(button).includes('Submit bid now'),
      ) as HTMLButtonElement
    ).click();
    const request = http.expectOne('/api/v1/tender-invitations/bid/submit');
    expect(request.request.body).toEqual({
      token: 'secret-token',
      draftVersion: 'v1',
      attachmentIds: ['a1'],
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      confirmed: true,
      // Part 8: the tender revision the bidder reviewed; the server refuses any other.
      tenderRevision: 1,
    });
    request.flush(
      bidView({
        status: 'Submitted',
        canEdit: false,
        gaps: [],
        submitted: complete.draft,
        receipt: {
          reference: 'BID-7K4Q-M2XD',
          revisionNumber: 1,
          submittedAtUtc: '2026-10-03T10:00:00Z',
          currency: 'QAR',
          totalAmount: '1250000.00',
          attachmentCount: 1,
          contentSha256: 'a'.repeat(64),
          submittedByName: 'Rana Estimator',
          tenderRevision: 1,
        },
      }),
    );
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('Submission received');
    expect(content).toContain('not an approval or an award');
    expect(content).toContain('1,250,000.00 QAR');
    expect(content).toContain('a'.repeat(64));
    expect(element.querySelector('#bid-total')).toBeNull();
  });

  it('keeps the receipt fingerprint collapsed under Verification details and shows the whole hash when opened (CF-100 AC4)', () => {
    const hash = '0123456789abcdef'.repeat(4);
    const { element } = render(
      bidView({
        status: 'Submitted',
        canEdit: false,
        gaps: [],
        submitted: { ...EMPTY_BID, totalAmount: '10.00', scopeCompliance: 'Full' },
        receipt: {
          reference: 'BID-7K4Q-M2XD',
          revisionNumber: 1,
          submittedAtUtc: '2026-10-03T10:00:00Z',
          currency: 'QAR',
          totalAmount: '10.00',
          attachmentCount: 0,
          contentSha256: hash,
          submittedByName: 'Rana Estimator',
          tenderRevision: 1,
        },
      }),
    );
    const details = element.querySelector('app-verification-details details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(text(details.querySelector('summary') as HTMLElement).trim()).toBe(
      'Verification details',
    );
    details.open = true;
    const code = details.querySelector('code[dir="ltr"]') as HTMLElement;
    expect(code.textContent?.trim()).toBe(hash);
    expect(code.textContent?.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('retries a lost submission response with the same idempotency key', () => {
    const complete = bidView({
      gaps: [],
      draft: { ...EMPTY_BID, totalAmount: '10.00', scopeCompliance: 'Full' },
    });
    const { http, page } = render(complete);
    page.confirmChecked.set(true);
    page.submit();
    const first = http.expectOne('/api/v1/tender-invitations/bid/submit');
    const key = first.request.body.idempotencyKey;
    first.error(new ProgressEvent('error'), { status: 0, statusText: 'Network' });
    page.submit();
    expect(
      http.expectOne('/api/v1/tender-invitations/bid/submit').request.body.idempotencyKey,
    ).toBe(key);
  });

  it('revises a submitted bid before the deadline with a new submission key, and can set the revision aside (CF-045)', () => {
    const receipt = {
      reference: 'BID-7K4Q-M2XD',
      revisionNumber: 1,
      submittedAtUtc: '2026-10-03T08:00:00Z',
      currency: 'QAR',
      totalAmount: '10.00',
      attachmentCount: 0,
      contentSha256: 'a'.repeat(64),
      submittedByName: 'Rana Estimator',
      tenderRevision: 1,
    };
    const submittedContent = {
      ...EMPTY_BID,
      totalAmount: '10.00',
      scopeCompliance: 'Full' as const,
    };
    const submitted = bidView({
      status: 'Submitted',
      canEdit: false,
      gaps: [],
      receipt,
      submitted: submittedContent,
      resubmission: { maximum: 3, used: 0, canStart: true },
    });
    const { http, fixture, element, page } = render(submitted);
    expect(text(element)).toContain('(0 of 3 revisions used)');
    page.confirmChecked.set(true);
    page.submit();
    const firstKey = http.expectOne('/api/v1/tender-invitations/bid/submit').request.body
      .idempotencyKey;
    page.submitting.set(false);

    page.amend();
    const amend = http.expectOne('/api/v1/tender-invitations/bid/amend');
    expect(amend.request.body).toEqual({ token: 'secret-token' });
    amend.flush(
      bidView({
        status: 'Amending',
        canEdit: true,
        gaps: [],
        receipt,
        draft: submittedContent,
        draftVersion: 'v2',
        resubmission: { maximum: 3, used: 0, canStart: false },
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Revising your submitted bid');
    expect(text(element)).toContain('Your submitted revision 1 stays in force');
    expect(page.drafting()).toBe(true);
    // A revised bid is a new submission: it never replays the first receipt's key.
    page.confirmChecked.set(true);
    page.submit();
    const resubmit = http.expectOne('/api/v1/tender-invitations/bid/submit');
    expect(resubmit.request.body.draftVersion).toBe('v2');
    expect(resubmit.request.body.idempotencyKey).not.toBe(firstKey);
    page.submitting.set(false);

    page.discardAmendment();
    http.expectOne('/api/v1/tender-invitations/bid/amend/discard').flush(submitted);
    fixture.detectChanges();
    expect(text(element)).toContain('Submission received');
  });

  it('withdraws a submitted bid after asking, with an optional reason, and can submit again (CF-049)', () => {
    const receipt = {
      reference: 'BID-7K4Q-M2XD',
      revisionNumber: 1,
      submittedAtUtc: '2026-10-03T08:00:00Z',
      currency: 'QAR',
      totalAmount: '10.00',
      attachmentCount: 0,
      contentSha256: 'a'.repeat(64),
      submittedByName: 'Rana Estimator',
      tenderRevision: 1,
    };
    const { http, fixture, element, page } = render(
      bidView({
        status: 'Submitted',
        canEdit: false,
        gaps: [],
        receipt,
        canWithdraw: true,
        resubmission: { maximum: 3, used: 0, canStart: true },
      }),
    );
    page.askWithdraw();
    fixture.detectChanges();
    expect(text(element)).toContain('Withdraw your bid? The buyer will not open it.');
    page.withdrawReason = 'Crew no longer available';
    page.withdraw();
    const request = http.expectOne('/api/v1/tender-invitations/bid/withdraw');
    expect(request.request.body).toMatchObject({
      token: 'secret-token',
      confirmed: true,
      reason: 'Crew no longer available',
    });
    request.flush(
      bidView({
        status: 'Withdrawn',
        canEdit: false,
        gaps: [],
        receipt,
        withdrawal: {
          stage: 'BeforeDeadline',
          recordedAtUtc: '2026-10-04T08:00:00Z',
          recordedByName: 'Rana Estimator',
          revisionInForce: 1,
          reason: 'Crew no longer available',
        },
        resubmission: { maximum: 3, used: 0, canStart: true },
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Bid withdrawn');
    expect(text(element)).toContain('your submitted revision 1 is kept on record');
    expect(text(element)).toContain('Submit a new bid');
  });

  it('says where the submission receipt is emailed before submitting (CF-069)', () => {
    const { element, page, fixture } = render(
      bidView({
        gaps: [],
        draft: { ...EMPTY_BID, totalAmount: '10.00', scopeCompliance: 'Full' },
        receiptRecipient: 'rana@acme.example',
      }),
    );
    page.step.set('review');
    fixture.detectChanges();
    expect(text(element)).toContain(
      'A receipt with the bid reference and fingerprint (no prices) is emailed to rana@acme.example.',
    );
  });

  it('keeps a submission final when the buyer allows no revision', () => {
    const { element } = render(
      bidView({
        status: 'Submitted',
        canEdit: false,
        gaps: [],
        receipt: {
          reference: 'BID-7K4Q-M2XD',
          revisionNumber: 1,
          submittedAtUtc: '2026-10-03T08:00:00Z',
          currency: 'QAR',
          totalAmount: '10.00',
          attachmentCount: 0,
          contentSha256: 'a'.repeat(64),
          submittedByName: 'Rana Estimator',
          tenderRevision: 1,
        },
        resubmission: { maximum: 0, used: 0, canStart: false },
      }),
    );
    expect(text(element)).toContain('A submitted bid cannot be changed here');
    expect(text(element)).not.toContain('Revise my bid');
  });

  it('lists what is missing in plain words with a way to each section', () => {
    const { fixture, element, page } = render(
      bidView({
        gaps: [
          { key: 'totalAmount', index: null },
          { key: 'requiredDocument', index: 0 },
        ],
      }),
    );
    page.goTo('review');
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('Enter the total bid amount.');
    expect(content).toContain('Attach the required document: ⁦Priced BOQ⁩.');
    expect(
      (
        [...element.querySelectorAll('button')].find(
          (button) => text(button).trim() === 'Submit bid',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('is read only once the deadline has passed and keeps the draft visible', async () => {
    const { fixture, element, page } = render(
      bidView({ canEdit: true, draft: { ...EMPTY_BID, totalAmount: '5.00' } }),
      invitationView({
        submissionDeadline: {
          utc: '2000-01-01T00:00:00Z',
          local: '2000-01-01T03:00',
          offset: '+03:00',
        },
      }),
    );
    expect(page.editable()).toBe(false);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((element.querySelector('#bid-total') as HTMLInputElement).disabled).toBe(true);
    expect((element.querySelector('#bid-total') as HTMLInputElement).value).toBe('5.00');
    expect(text(element)).toContain('The deadline has passed.');
  });

  it('prices the buyer schedule item by item with exact extensions and saves only the rates (CF-004)', () => {
    vi.useFakeTimers();
    const { http, element, page, fixture } = render(bidView(), {
      ...invitationView(),
      schedule: [
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
        {
          key: 'A.3',
          section: null,
          description: 'Spare filters',
          unit: 'nr',
          quantity: '40.000',
          type: 'Optional',
          provisionalAmount: null,
        },
        {
          key: 'A.4',
          section: null,
          description: 'Daywork',
          unit: 'hr',
          quantity: null,
          type: 'RateOnly',
          provisionalAmount: null,
        },
      ],
    });
    const schedule = element.querySelector('#bid-schedule') as HTMLElement;
    expect(text(schedule)).toContain('Fixed by the buyer');
    expect(text(schedule)).toContain('120.125');
    // 120.125 × 85.5 = 10 270.6875 is not a QAR amount: shown as such, never rounded.
    page.setRate('A.1', '85.5');
    fixture.detectChanges();
    expect(text(schedule)).toContain('Not an exact QAR amount — adjust the rate');
    expect(page.scheduleTotal()).toBeNull();
    page.setRate('A.1', '85.6');
    page.setRate('A.4', '150');
    page.setRate('A.3', '1.1234567');
    fixture.detectChanges();
    expect(text(schedule)).toContain('10,282.70');
    // Measured amounts and provisional sums count; optional and rate-only items never do.
    expect(page.scheduleTotal()).toBe('35283.20');
    expect(page.fieldError('itemRates.2')).toBe(
      'Rates have at most 6 decimal places. They are never rounded.',
    );
    page.setRate('A.3', '');
    page.useScheduleTotal();
    fixture.detectChanges();
    expect(page.form.totalAmount).toBe('35,283.20');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    const save = http.expectOne('/api/v1/tender-invitations/bid/draft');
    expect(save.request.body.content.itemRates).toEqual([
      { key: 'A.1', rate: '85.6' },
      { key: 'A.4', rate: '150' },
    ]);
    expect(save.request.body.content.totalAmount).toBe('35283.20');
    expect(bidGapLabel('itemUnpriced', 0, [], ['A.1'])).toBe(
      'Enter a rate for price schedule item \u2066A.1\u2069.',
    );
    vi.useRealTimers();
  });

  it('shows a file as being scanned or flagged, and offers its download only once clean (CF-070)', () => {
    const file = (id: string, fileName: string, scanState: 'Pending' | 'Clean' | 'Infected') => ({
      id,
      fileName,
      contentType: 'application/pdf',
      sizeBytes: 1024,
      requirementLabel: null,
      uploadedAtUtc: '2026-10-02T08:00:00Z',
      scanState,
    });
    const { element, page, fixture } = render(
      bidView({
        attachments: [
          file('a1', 'clean.pdf', 'Clean'),
          file('a2', 'held.pdf', 'Pending'),
          file('a3', 'bad.pdf', 'Infected'),
        ],
      }),
    );
    page.goTo('files');
    fixture.detectChanges();
    const items = [...element.querySelectorAll('.bw-files li')].map((item) =>
      text(item as HTMLElement),
    );
    const row = (name: string) => items.find((item) => item.includes(name)) ?? '';
    expect(row('clean.pdf')).toContain('Download');
    expect(row('held.pdf')).toContain('Being scanned for malware');
    expect(row('held.pdf')).not.toContain('Download');
    expect(row('bad.pdf')).toContain('Flagged by the malware scanner');
  });
});
