import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bidderRound } from '../decision/decision.fixtures';
import { BidderNegotiation } from './bidder-negotiation.api';
import { TenderNegotiationPage } from './tender-negotiation';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));

function render(view: BidderNegotiation | null, hash = '#token=round-secret') {
  window.history.replaceState(null, '', `/tender-negotiation${hash}`);
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TenderNegotiationPage);
  fixture.detectChanges();
  if (view) {
    const open = http.expectOne('/api/v1/tender-invitations/negotiation');
    expect(open.request.body).toEqual({ token: 'round-secret' });
    open.flush(view);
    fixture.detectChanges();
  }
  return { http, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('Negotiation round page for the selected firm', () => {
  it('takes the round link from the fragment, removes it from the address bar and shows the open round', () => {
    const { element, http } = render(bidderRound());
    expect(window.location.hash).toBe('');
    const shown = text(element);
    expect(shown).toContain('Delta Construction asks for your best and final offer');
    expect(shown).toContain('Round 1');
    expect(shown).toContain('This round is open');
    expect(shown).toContain('Please confirm your best and final price.');
    // The exact deadline in the tender's zone with its offset, and a countdown by the server's clock.
    expect(shown).toContain('Asia/Qatar');
    expect(shown).toContain('UTC+03:00');
    expect(shown).toContain('Time left:');
    expect(shown).toContain("By the server's clock");
    // Its own offer in force, in exact money with the ISO code.
    expect(shown).toContain('Your offer in force');
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('2,000,000.00 QAR');
    expect(button(element, 'Prepare a revised response')).toBeDefined();
    expect(button(element, 'Decline to revise')).toBeDefined();
    // Nothing about any other firm, rank, score or decision.
    expect(shown).not.toMatch(/rank|score|recommend|winner|competitor/i);
    http.verify();
  });

  it('starts a revised response, saves the draft with its version and submits with a receipt', async () => {
    const { element, http, fixture } = render(bidderRound());
    button(element, 'Prepare a revised response')!.click();
    const start = http.expectOne('/api/v1/tender-invitations/negotiation/start');
    expect(start.request.body).toEqual({ token: 'round-secret' });
    const draft = {
      ...bidderRound().currentSubmission,
      totalAmount: '1800000.00',
      lines: [{ description: 'Supply of AHUs', amount: '1800000.00' }],
    };
    start.flush(
      bidderRound({
        status: 'Started',
        draft,
        draftVersion: 'dv1',
        draftSavedAtUtc: '2099-10-01T09:05:00Z',
        editable: true,
      }),
    );
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(text(element)).toContain('Your revised response — round 1');
    expect(text(element)).toContain('Response deadline');

    // Review and submit: the workspace saves nothing new, confirms, and submits with an idempotency key.
    button(element, 'Review')!.click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const confirm = element.querySelector('.bw-choice input') as HTMLInputElement;
    confirm.click();
    fixture.detectChanges();
    expect(text(element)).toContain('I confirm this revised response is complete');
    button(element, 'Submit bid')!.click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('It becomes your response to round 1');
    button(dialog, 'Submit bid now')!.click();
    const submit = http.expectOne('/api/v1/tender-invitations/negotiation/submit');
    expect(submit.request.body).toEqual({
      token: 'round-secret',
      draftVersion: 'dv1',
      attachmentIds: [],
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      confirmed: true,
    });
    submit.flush(
      bidderRound({
        status: 'Submitted',
        draft,
        draftFiles: [],
        receipt: {
          reference: 'BID-AAAA-BBBB',
          revisionNumber: 2,
          submittedAtUtc: '2099-10-02T09:00:00Z',
          currency: 'QAR',
          totalAmount: '1800000.00',
          attachmentCount: 0,
          contentSha256: 'e'.repeat(64),
          submittedByName: 'Rana Estimator',
          tenderRevision: 2,
        },
      }),
    );
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const shown = text(element);
    expect(shown).toContain('Revised response received');
    expect(shown).toContain('It is not an approval or an award');
    expect(shown).toContain('BID-AAAA-BBBB');
    const fingerprint = element.querySelector('.rnd-fingerprint') as HTMLElement;
    expect(fingerprint.getAttribute('dir')).toBe('ltr');
    expect(fingerprint.textContent).toBe('e'.repeat(64));
    expect(button(element, 'Prepare a revised response')).toBeUndefined();
  });

  it('shows the technical answers read-only in a Commercial round (CF-091)', async () => {
    const { element, http, fixture } = render(bidderRound({ scope: 'Commercial' }));
    button(element, 'Prepare a revised response')!.click();
    http.expectOne('/api/v1/tender-invitations/negotiation/start').flush(
      bidderRound({
        scope: 'Commercial',
        status: 'Started',
        draft: bidderRound().currentSubmission,
        draftVersion: 'dv1',
        draftSavedAtUtc: '2099-10-01T09:05:00Z',
        editable: true,
      }),
    );
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    // The commercial step stays open.
    expect((element.querySelector('fieldset.bw-scope-lock') as HTMLFieldSetElement).disabled).toBe(
      false,
    );
    button(element, '2. Technical')!.click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(text(element)).toContain('Not open for revision in this round');
    expect((element.querySelector('fieldset.bw-scope-lock') as HTMLFieldSetElement).disabled).toBe(
      true,
    );
  });

  it('uses the round bid requirements: required documents in gap-index order, the technical proposal and the firm', async () => {
    const { element, http, fixture } = render(bidderRound());
    button(element, 'Prepare a revised response')!.click();
    http.expectOne('/api/v1/tender-invitations/negotiation/start').flush(
      bidderRound({
        status: 'Started',
        draft: bidderRound().currentSubmission,
        draftVersion: 'dv1',
        editable: true,
        // The server's index refers to the tender's required documents: 1 is the method statement.
        gaps: [{ key: 'requiredDocument', index: 1 }],
      }),
    );
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    // The requested validity is stated as the invitation portal states it.
    expect(text(element)).toContain('The tender asks for 90 days.');
    button(element, 'Technical')!.click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('textarea[aria-required="true"]')).not.toBeNull();
    button(element, 'Files')!.click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const files = text(element);
    expect(files).toContain('Priced BOQ');
    expect(files).toContain('Method statement');
    button(element, 'Review')!.click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const review = text(element).replace(/[\u2066-\u2069]/g, '');
    expect(review).toContain('Attach the required document: Method statement.');
    expect(review).not.toContain('Attach the required document: Priced BOQ.');
    expect(review).toContain('Acme Mechanical');
    expect(review).toContain('I confirm this revised response is complete');
  });

  it('is read-only after the deadline, and after the buyer closes or cancels the round', () => {
    for (const [state, message] of [
      ['deadline_passed', 'The response deadline has passed'],
      ['closed', 'The buyer closed this round'],
      ['cancelled', 'The buyer cancelled this round'],
      ['withdrawn', 'The buyer removed your firm from this round'],
    ] as const) {
      TestBed.resetTestingModule();
      const { element } = render(bidderRound({ state }));
      expect(text(element)).toContain(message);
      expect(button(element, 'Prepare a revised response')).toBeUndefined();
      expect(button(element, 'Decline to revise')).toBeUndefined();
      expect(text(element)).not.toContain('Time left:');
    }
  });

  it('declines to revise with an optional comment', () => {
    const { element, http, fixture } = render(bidderRound());
    button(element, 'Decline to revise')!.click();
    fixture.detectChanges();
    const comment = element.querySelector('#round-decline-comment') as HTMLTextAreaElement;
    comment.value = 'Our price is final';
    comment.dispatchEvent(new Event('input'));
    button(element, 'Send: I will not revise')!.click();
    const request = http.expectOne('/api/v1/tender-invitations/negotiation/decline');
    expect(request.request.body).toEqual({ token: 'round-secret', comment: 'Our price is final' });
    request.flush(bidderRound({ status: 'Declined', declineComment: 'Our price is final' }));
    fixture.detectChanges();
    expect(text(element)).toContain('Your earlier offer stays in force');
    expect(text(element)).toContain('You told the buyer you will not revise');
    // The firm can still change its mind before the deadline.
    expect(button(element, 'Prepare a revised response')).toBeDefined();
  });

  it('explains an unusable link without calling the server when there is no token', () => {
    const { element, http } = render(null, '');
    http.expectNone('/api/v1/tender-invitations/negotiation');
    expect(text(element)).toContain('This link cannot be used');
  });
});
