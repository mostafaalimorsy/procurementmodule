import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { NegotiationComparison } from './negotiation-comparison';
import { NegotiationPage } from './negotiation-page';
import { comparison, negotiation, round } from './decision.fixtures';

/** CF-015: every tender page also reads its stage header; the header is not what these tests are about. */
function verifyAll(http: HttpTestingController): void {
  http.match((request) => request.url.endsWith('/stage')).forEach((request) => request.flush(null));
  http.verify();
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));

function configure() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ id: 't1' }) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    roles: ['ProcurementManager'],
    permissions: ['Evaluation.View', 'Negotiation.Manage'],
  });
  return TestBed.inject(HttpTestingController);
}

function type(element: HTMLElement, selector: string, value: string): void {
  const field = element.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

describe('Negotiation rounds', () => {
  it('shows each round and firm with its state in words, never by colour alone', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(negotiation({ rounds: [round()] }));
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('Round 1');
    expect(shown).toContain('Best and final offer (BAFO)');
    expect(shown).toContain('Round open for responses');
    expect(shown).toContain('Preparing a response');
    expect(shown).toContain('Accepted by mail server');
    expect(shown).toContain('Asked to revise: revision 1');
    expect(shown).toContain('Internal purpose (not sent to firms)');
    expect(shown).toContain('Instructions sent to the firms');
    // An open round before its deadline is closed early, with a reason.
    expect(button(element, 'Close early')).toBeDefined();
    verifyAll(http);
  });

  it('issues a round only to the chosen invitable firms, after validation and an explicit confirmation', async () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(negotiation());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'Issue a round')!.click();
    page.detectChanges();
    await settle();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const boxes = [...dialog.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, true, false]);
    // A firm whose invitation was revoked cannot be chosen, and the reason is stated.
    expect(boxes[2].disabled).toBe(true);
    expect(text(dialog)).toContain('invitation was revoked');
    expect(text(dialog)).toContain('Response in force: revision 2 (round 1)');

    button(dialog, 'Issue the round')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('State the internal purpose of the round');
    http.expectNone('/api/v1/tenders/t1/negotiation/rounds');

    type(dialog, '#round-purpose', 'Close the price gap');
    type(dialog, '#round-instructions', 'Confirm your best and final price.');
    type(dialog, '#round-deadline', '2026-10-12T12:00');
    boxes[1].click();
    page.detectChanges();
    expect(text(dialog)).toContain('Selected: 1');
    button(dialog, 'Issue the round')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Tick the confirmation');
    const confirm = dialog.querySelector('.tnd-close-confirm input') as HTMLInputElement;
    confirm.click();
    page.detectChanges();
    button(dialog, 'Issue the round')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/negotiation/rounds');
    expect(request.request.body).toEqual({
      type: 'Revision',
      scope: 'Commercial',
      purpose: 'Close the price gap',
      instructions: 'Confirm your best and final price.',
      responseDeadlineLocal: '2026-10-12T12:00',
      openingBidIds: ['b1'],
      confirmed: true,
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    request.flush(negotiation({ rounds: [round({ type: 'Revision' })] }));
    page.detectChanges();
    expect(text(element)).toContain('Round 1 was issued');
  });

  it('explains why a round cannot be issued now', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(
      negotiation({
        issueBlocker: 'negotiation.not_ready',
        issueBlockerReason: 'evaluation_refresh_required',
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(button(element, 'Issue a round')!.disabled).toBe(true);
    expect(text(element)).toContain("Take the last round's responses into the evaluation");
  });

  it('closes early only with a reason and a confirmation; after the deadline only a confirmation', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http
      .expectOne('/api/v1/tenders/t1/negotiation')
      .flush(negotiation({ rounds: [round(), round({ id: 'r0', number: 0, status: 'Closed' })] }));
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'Close early')!.click();
    page.detectChanges();
    let dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    button(dialog, 'Close the round')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Explain the reason');
    type(dialog, '#close-reason', 'All firms answered');
    button(dialog, 'Close the round')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Tick the confirmation to close the round before its deadline');
    (dialog.querySelector('.tnd-close-confirm input') as HTMLInputElement).click();
    button(dialog, 'Close the round')!.click();
    const early = http.expectOne('/api/v1/tenders/t1/negotiation/rounds/r1/close');
    expect(early.request.body).toEqual({
      reason: 'All firms answered',
      confirmed: true,
      version: 'rv1',
    });
    early.flush(negotiation({ rounds: [round({ deadlinePassed: true })] }));
    page.detectChanges();

    button(element, 'Close the round')!.click();
    page.detectChanges();
    dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('textarea')).toBeNull();
    button(dialog, 'Close the round')!.click();
    const late = http.expectOne('/api/v1/tenders/t1/negotiation/rounds/r1/close');
    expect(late.request.body.reason).toBeNull();
    late.flush(negotiation());
  });

  it('adds an attributable note for commercial readers', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(negotiation({ rounds: [round()] }));
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    type(element, '#note-text', 'Beta asked for a call');
    button(element, 'Add note')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/negotiation/notes');
    expect(request.request.body).toEqual({
      roundId: null,
      openingBidId: null,
      text: 'Beta asked for a call',
    });
    request.flush({
      id: 'n1',
      roundId: null,
      openingBidId: null,
      text: 'Beta asked for a call',
      authorName: 'Maha Manager',
      writtenAtUtc: '2026-10-05T12:00:00Z',
    });
    page.detectChanges();
    expect(text(element)).toContain('Beta asked for a call');
    expect(text(element)).toContain('Maha Manager');
  });
});

describe('Original, revised and final comparison', () => {
  it('writes out every change and shows money exactly, left-to-right', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationComparison);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation/comparison').flush(comparison());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('Original submission');
    expect(shown).toContain('Round 1 — BAFO');
    expect(shown).toContain('Final — in force');
    expect(shown).toContain('Changed since the original');
    expect(shown).toContain('Same as the original');
    expect(shown).toContain('Added');
    expect(shown).toContain('Unchanged');
    expect(shown).toContain('Not in this revision');
    const markers = [...element.querySelectorAll('.dc-changed')].map((node) => text(node).trim());
    expect(markers).toContain('Changed');
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('2,000,000.00 QAR');
    expect(amounts).toContain('−200,000.00 QAR');
    expect(amounts).toContain('−10.0%');
  });

  it('names the currency of every priced-line amount and of each priced-line column (re-audit AB)', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationComparison);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation/comparison').flush(comparison());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const lines = [...element.querySelectorAll('table')].find((table) =>
      text(table.querySelector('caption')!).includes('Priced lines in each revision'),
    )!;
    const headers = [...lines.querySelectorAll('thead th.dc-num')].map((th) => text(th).trim());
    expect(headers).toEqual(['Original submission QAR', 'Round 1 — BAFO QAR']);
    const amounts = [...lines.querySelectorAll('tbody td.dc-num bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toEqual([
      '1,500,000.00 QAR',
      '1,300,000.00 QAR',
      '500,000.00 QAR',
      '500,000.00 QAR',
      '0.00 QAR',
    ]);
    // The total row of the revisions table names it too.
    expect(text(element)).toContain('1,800,000.00 QAR');
  });

  it('shows a technical-only reader no money at all', () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationComparison);
    page.detectChanges();
    const base = comparison();
    http.expectOne('/api/v1/tenders/t1/negotiation/comparison').flush({
      ...base,
      includesCommercial: false,
      bids: [
        {
          ...base.bids[0],
          originalTotal: null,
          finalTotal: null,
          absoluteChange: null,
          percentChange: null,
          fields: base.bids[0].fields.filter((field) => field.section === 'technical'),
          lines: [],
          lists: [],
          files: [],
          commercialChanged: null,
        },
      ],
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('You see the technical comparison only');
    expect(shown).not.toContain('Original total');
    expect(shown).not.toContain('Priced lines');
    expect(shown).not.toMatch(/\d{1,3}(,\d{3})+\.\d{2}/);
  });

  it('shows one bid at a time and switches bids from the picker', async () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationComparison);
    page.detectChanges();
    const base = comparison();
    http.expectOne('/api/v1/tenders/t1/negotiation/comparison').flush({
      ...base,
      bids: [
        base.bids[0],
        {
          ...base.bids[0],
          openingBidId: 'b2',
          position: 2,
          subcontractorCode: 'BETA-01',
          subcontractorName: 'Beta Contracting',
          originalTotal: '1900000.00',
          finalTotal: '1900000.00',
          absoluteChange: '0.00',
          percentChange: '0.0',
        },
      ],
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const title = () => text(element.querySelector('#comparison-bid-title')!);
    expect(title()).toContain('ACME-01');
    expect(title()).not.toContain('BETA-01');
    const picker = element.querySelector('#comparison-bid') as HTMLSelectElement;
    picker.value = 'b2';
    picker.dispatchEvent(new Event('change'));
    page.detectChanges();
    await settle();
    page.detectChanges();
    expect(title()).toContain('BETA-01');
    expect(title()).not.toContain('ACME-01');
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('1,900,000.00 QAR');
  });

  it('keeps the request key of a round when the issue dialog is closed and reopened after a lost answer', async () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(negotiation());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const issue = async () => {
      button(element, 'Issue a round')!.click();
      page.detectChanges();
      await settle();
      const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
      type(dialog, '#round-purpose', 'Close the price gap');
      type(dialog, '#round-instructions', 'Confirm your best and final price.');
      type(dialog, '#round-deadline', '2026-10-12T12:00');
      (dialog.querySelector('.tnd-close-confirm input') as HTMLInputElement).click();
      page.detectChanges();
      button(dialog, 'Issue the round')!.click();
      return { dialog, request: http.expectOne('/api/v1/tenders/t1/negotiation/rounds') };
    };
    const first = await issue();
    first.request.flush(null, { status: 0, statusText: 'Network' });
    page.detectChanges();
    button(first.dialog, 'Cancel')!.click();
    page.detectChanges();
    const retry = await issue();
    expect(retry.request.request.body.requestKey).toBe(first.request.request.body.requestKey);
    retry.request.flush(negotiation({ rounds: [round()] }));
  });

  it('marks a missing purpose invalid and required', async () => {
    const http = configure();
    const page = TestBed.createComponent(NegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/negotiation').flush(negotiation());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'Issue a round')!.click();
    page.detectChanges();
    await settle();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const purpose = dialog.querySelector('#round-purpose') as HTMLTextAreaElement;
    expect(purpose.getAttribute('aria-required')).toBe('true');
    button(dialog, 'Issue the round')!.click();
    page.detectChanges();
    expect(purpose.getAttribute('aria-invalid')).toBe('true');
    expect(purpose.getAttribute('aria-describedby')).toBe('negotiation-dialog-error');
    expect(dialog.querySelector('#negotiation-dialog-error')).not.toBeNull();
  });
});
