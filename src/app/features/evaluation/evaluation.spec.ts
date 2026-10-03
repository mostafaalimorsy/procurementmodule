import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { hundredthsText, parseScore, weightHundredths } from './evaluation.api';
import { EvaluationCommercial } from './evaluation-commercial';
import { money, percentFrom, signedMoney } from './evaluation-format';
import { EvaluationPage } from './evaluation-page';
import { EvaluationPolicies } from './evaluation-policies';
import { EvaluationTechnical } from './evaluation-technical';
import {
  TECHNICAL_ONLY,
  commercial,
  commercialBid,
  opened,
  opening,
  overview,
  state,
  technical,
  technicalBid,
} from './evaluation.fixtures';

/** CF-015: every tender page also reads its stage header; the header is not what these tests are about. */
function verifyAll(http: HttpTestingController): void {
  http.match((request) => request.url.endsWith('/stage')).forEach((request) => request.flush(null));
  http.verify();
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));

function configure(
  permissions: readonly string[] = ['Evaluation.View'],
  query: Record<string, string> = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: 't1' }),
            queryParamMap: convertToParamMap(query),
          },
          queryParamMap: of(convertToParamMap(query)),
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
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

describe('Money and score helpers on the evaluation screens', () => {
  it('keep exact decimal strings, signs and hundredths without floating point', () => {
    expect(money('1250000.00', 'en')).toBe('1,250,000.00');
    expect(money('-100000.00', 'en')).toBe('−100,000.00');
    expect(money('1250000.005', 'en')).toBe('1,250,000.005');
    expect(money(null, 'en')).toBe('—');
    expect(signedMoney('75000.00', 'en')).toBe('+75,000.00');
    expect(percentFrom('2000000.00', '1250000.00')).toBe('+60.0');
    expect(percentFrom('1000000.00', '1250000.00')).toBe('−20.0');
    expect(percentFrom('1250000.00', '1250000.00')).toBe('0.0');
    expect(percentFrom('1.00', '3.00')).toBe('−66.7');
    expect(percentFrom('1.00', null)).toBeNull();
    // 33.33 + 33.33 + 33.34 is exactly 100 in hundredths (floating point would give 99.99999…).
    expect(
      ['33.33', '33.33', '33.34']
        .map((weight) => weightHundredths(weight)!)
        .reduce((a, b) => a + b),
    ).toBe(10000);
    expect(weightHundredths('12.345')).toBeNull();
    expect(weightHundredths('1,5')).toBeNull();
    expect(hundredthsText(3550)).toBe('35.5');
    expect(hundredthsText(10000)).toBe('100');
    expect(parseScore('7.5', 10)).toBe(7.5);
    expect(parseScore('10.1', 10)).toBeNull();
    expect(parseScore('7.25', 10)).toBeNull();
    expect(parseScore('100', 100)).toBe(100);
  });
});

describe('Bid opening', () => {
  it('keeps bids sealed before opening and opens only through an explicit confirmation that is not an award', async () => {
    const http = configure(['Evaluation.View', 'Evaluation.OpenBids']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opening());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ stage: 'NotOpened', evaluation: null, bids: [] }));
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('Submitted bids are sealed');
    expect(text(element)).toContain('Submitted bids that answered an older tender revision: 1');
    // Before opening there is no technical or commercial section at all.
    expect(element.querySelector('[role="tablist"]')).toBeNull();

    button(element, 'Open bids for evaluation')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('does not accept, recommend or award any bidder');
    expect(text(dialog)).toContain('prices only by commercial reviewers');
    button(dialog, 'Open bids')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/opening');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.confirmed).toBe(true);
    expect(request.request.body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    request.flush(opened());
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(overview());
    page.detectChanges();
    expect(text(element)).toContain('Opening record');
    expect(text(element)).toContain('Older than the revision in force');
    expect(text(element)).toContain('GAMA-01');
    verifyAll(http);
  });

  it('offers no opening action to a reader without the opening right', () => {
    const http = configure(['Evaluation.View']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opening({ canOpen: false }));
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(
      overview({
        stage: 'NotOpened',
        evaluation: null,
        bids: [],
        access: { ...overview().access, openBids: false },
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(button(element, 'Open bids for evaluation')).toBeUndefined();
    expect(text(element)).toContain('Procurement leadership opens the bids');
  });

  it('shows only the sections the user may read, and the tabs move with arrow keys', async () => {
    const http = configure();
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ access: { ...overview().access, viewCommercial: false, level: false } }));
    page.detectChanges();
    const tabs = [...(page.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')].map(
      (tab) => text(tab as HTMLElement).trim(),
    );
    expect(tabs).toEqual(['Overview', 'Technical evaluation', 'Deviations and gaps']);
    expect(
      (page.nativeElement as HTMLElement).querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent,
    ).toContain('Overview');
  });

  it('selects the first section a reader may see when a link asks for one they may not (CF-104)', () => {
    const http = configure(['Evaluation.View'], { tab: 'commercial' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ access: { ...overview().access, viewCommercial: false, level: false } }));
    page.detectChanges();
    const selected = [
      ...(page.nativeElement as HTMLElement).querySelectorAll('[role="tab"][aria-selected="true"]'),
    ];
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Overview');
    expect(page.componentInstance.tab()).toBe('overview');
    // CF-104 AC1: the address no longer names the section the reader cannot see.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { tab: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('opens the Commercial section for a commercial reader who follows a ?tab=commercial link, without rewriting it (CF-104 AC2)', () => {
    const http = configure(['Evaluation.View', 'Evaluation.ViewCommercial'], {
      tab: 'commercial',
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ access: { ...overview().access, viewCommercial: true } }));
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const tabs = [...element.querySelectorAll('[role="tab"]')].map((tab) =>
      text(tab as HTMLElement).trim(),
    );
    expect(tabs).toContain('Commercial leveling');
    const selected = [...element.querySelectorAll('[role="tab"][aria-selected="true"]')];
    expect(selected).toHaveLength(1);
    expect(text(selected[0] as HTMLElement).trim()).toBe('Commercial leveling');
    expect(page.componentInstance.tab()).toBe('commercial');
    // A permitted tab is shown as asked: the address is not rewritten.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers a bidder file for download only once the malware scanner found it clean (CF-070)', () => {
    const http = configure(['Evaluation.View', 'Evaluation.OpenBids']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    const view = opened();
    const bid = view.opening!.bids[0];
    const file = bid.files[0];
    http.expectOne('/api/v1/tenders/t1/opening').flush({
      ...view,
      opening: {
        ...view.opening!,
        bids: [
          {
            ...bid,
            files: [
              { ...file, id: 'f1', fileName: 'clean.pdf', scanState: 'Clean' },
              { ...file, id: 'f2', fileName: 'held.pdf', scanState: 'Pending' },
              { ...file, id: 'f3', fileName: 'flagged.pdf', scanState: 'Infected' },
            ],
          },
          ...view.opening!.bids.slice(1),
        ],
      },
    });
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(overview());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('.ev-file a[download]')].map((link) =>
      link.textContent?.trim(),
    );
    expect(links).toContain('clean.pdf');
    expect(links).not.toContain('held.pdf');
    expect(links).not.toContain('flagged.pdf');
    expect(text(element)).toContain('Being scanned for malware — available once clean.');
    expect(text(element)).toContain(
      'Withheld — flagged by the malware scanner. Kept as evidence; never served.',
    );
  });
});

describe('Withdrawal after opening (CF-049)', () => {
  it('records a firm withdrawal with a reason and an evidence reference, and shows it on the register', () => {
    const http = configure(['Evaluation.View', 'Evaluation.Complete']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    const view = opened();
    http.expectOne('/api/v1/tenders/t1/opening').flush(view);
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(overview());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const bid = view.opening!.bids[0];
    button(element, 'The firm withdrew')!.click();
    page.detectChanges();
    const component = page.componentInstance;
    component.withdrawalReason = 'Key staff left the firm';
    component.withdrawalReference = 'Letter 2026/114';
    component.recordWithdrawal(bid.id);
    const request = http.expectOne(`/api/v1/tenders/t1/opening/bids/${bid.id}/withdrawal`);
    expect(request.request.body).toMatchObject({
      reason: 'Key staff left the firm',
      evidenceReference: 'Letter 2026/114',
    });
    expect(typeof request.request.body.requestKey).toBe('string');
    request.flush({
      ...view,
      opening: {
        ...view.opening!,
        bids: [
          {
            ...bid,
            withdrawal: {
              stage: 'AfterOpening',
              recordedAtUtc: '2026-10-08T10:00:00Z',
              recordedByName: 'Maha Manager',
              revisionInForce: 1,
              reason: 'Key staff left the firm',
              evidenceReference: 'Letter 2026/114',
            },
          },
          ...view.opening!.bids.slice(1),
        ],
      },
    });
    page.detectChanges();
    expect(text(element)).toContain('Withdrawn by the firm — recorded by Maha Manager');
    expect(text(element)).toContain('Letter 2026/114');
  });

  it('offers no withdrawal action to a reader who prepares neither the evaluation nor the decision', () => {
    const http = configure(['Evaluation.View']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(overview());
    page.detectChanges();
    expect(button(page.nativeElement as HTMLElement, 'The firm withdrew')).toBeUndefined();
  });
});

describe('Confidentiality in the client', () => {
  it('never requests commercial data for a technical-only reader, from a commercial deep link or the gaps tab', async () => {
    const http = configure(
      ['Evaluation.View', 'Evaluation.ViewTechnical', 'Evaluation.TechnicalScore'],
      { tab: 'commercial' },
    );
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(overview({ access: TECHNICAL_ONLY }));
    page.detectChanges();
    await settle();
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const flushTechnical = () =>
      http
        .match('/api/v1/tenders/t1/evaluation/technical')
        .forEach((request) => request.flush(technical()));
    flushTechnical();
    http.expectNone('/api/v1/tenders/t1/evaluation/commercial');
    const gaps = [...element.querySelectorAll('[role="tab"]')].find((tab) =>
      text(tab as HTMLElement).includes('Deviations and gaps'),
    ) as HTMLElement;
    gaps.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    flushTechnical();
    page.detectChanges();
    http.expectNone('/api/v1/tenders/t1/evaluation/commercial');
    expect(text(element)).not.toMatch(/QAR|1,250,000|Leveled total/);
    verifyAll(http);
  });
});

describe('Technical evaluation', () => {
  it('shows the technical answer without prices, validates scores on the device and saves each entry', async () => {
    const http = configure([
      'Evaluation.View',
      'Evaluation.ViewTechnical',
      'Evaluation.TechnicalScore',
    ]);
    const component = TestBed.createComponent(EvaluationTechnical);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/technical').flush(technical());
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    expect(text(element)).toContain('Two crews; shop drawings in week 2');
    expect(text(element)).toContain('Files visible to commercial readers only: 2');
    expect(text(element)).not.toMatch(/QAR|total amount|payment/i);

    const score = element.querySelector('#score-c1') as HTMLInputElement;
    score.value = '7,5';
    score.dispatchEvent(new Event('input'));
    component.detectChanges();
    button(element, 'Save draft')!.click();
    component.detectChanges();
    expect(text(element)).toContain('Enter each score as a number from 0 to 10');
    http.expectNone('/api/v1/tenders/t1/evaluation/technical/b1/scorecard');

    score.value = '7.5';
    score.dispatchEvent(new Event('input'));
    const comment = element.querySelector('#comment-c1') as HTMLTextAreaElement;
    comment.value = 'Clear logistics';
    comment.dispatchEvent(new Event('input'));
    component.detectChanges();
    button(element, 'Save draft')!.click();
    const save = http.expectOne('/api/v1/tenders/t1/evaluation/technical/b1/scorecard');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body.entries).toEqual([
      { criterionId: 'c1', score: 7.5, comment: 'Clear logistics', evidence: null },
      { criterionId: 'c2', score: null, comment: null, evidence: null },
    ]);
    expect(save.request.body.version).toBeNull();
  });

  it('keeps typed entries when submitting is refused after the save, and the next save names the saved version', async () => {
    const http = configure([
      'Evaluation.View',
      'Evaluation.ViewTechnical',
      'Evaluation.TechnicalScore',
    ]);
    const component = TestBed.createComponent(EvaluationTechnical);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/technical').flush(technical());
    component.detectChanges();
    await component.whenStable();
    const element = component.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const field = element.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    };
    type('#score-c1', '7.5');
    type('#score-c2', '6');
    component.detectChanges();
    button(element, 'Submit scorecard')!.click();
    const save = http.expectOne('/api/v1/tenders/t1/evaluation/technical/b1/scorecard');
    expect(save.request.body.version).toBeNull();
    save.flush({
      id: 's1',
      openingBidId: 'b1',
      status: 'Draft',
      submissionCount: 0,
      submittedAtUtc: null,
      entries: save.request.body.entries,
      weightedTotal: 6.9,
      gaps: [{ key: 'commentRequired', subjectId: 'c1' }],
      updatedAtUtc: '2026-10-03T11:00:00Z',
      version: 'v2',
    });
    const submit = http.expectOne('/api/v1/tenders/t1/evaluation/technical/b1/scorecard/submit');
    expect(submit.request.body.version).toBe('v2');
    submit.flush(
      { status: 400, code: 'evaluation.scorecard_incomplete' },
      { status: 400, statusText: 'Bad Request' },
    );
    component.detectChanges();
    await component.whenStable();
    component.detectChanges();
    // Nothing typed is lost, and no false "saved elsewhere" message appears.
    expect((element.querySelector('#score-c1') as HTMLInputElement).value).toBe('7.5');
    expect(text(element)).not.toContain('saved elsewhere');
    type('#comment-c1', 'Clear logistics');
    component.detectChanges();
    button(element, 'Submit scorecard')!.click();
    const again = http.expectOne('/api/v1/tenders/t1/evaluation/technical/b1/scorecard');
    expect(again.request.body.version).toBe('v2');
    expect(again.request.body.entries[0]).toMatchObject({ score: 7.5, comment: 'Clear logistics' });
  });

  it('explains why a commercial reader cannot score a commercial-blind evaluation', async () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationTechnical);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/technical').flush(
      technical({
        canScore: false,
        scoreBlockedReason: 'blind_scoring_required',
        bids: [technicalBid()],
      }),
    );
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    expect(text(element)).toContain('requires commercial-blind technical scoring');
    expect(button(element, 'Save draft')).toBeUndefined();
    // ngModel applies the disabled state after the first change detection settles.
    await component.whenStable();
    component.detectChanges();
    expect((element.querySelector('#score-c1') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('Commercial leveling', () => {
  it('shows each bid against the tender VAT basis and requested terms, and a bid on another basis as not compared (CF-055)', () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    const view = commercial();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush({
      ...view,
      pricing: { treatment: 'ExclusiveOfVat', vatRatePercent: '15.00', note: null },
      requestedTerms: {
        retentionPercent: '10.00',
        advancePaymentPercent: null,
        performanceSecurityPercent: null,
        bidBondRequired: false,
        paymentTermsNote: null,
      },
      bids: view.bids.map((bid, index) => ({
        ...bid,
        pricing:
          index === 0
            ? { confirmed: true, treatment: null, vatRatePercent: null }
            : { confirmed: false, treatment: 'InclusiveOfVat', vatRatePercent: '15.00' },
        terms: {
          retentionPercent: index === 0 ? '10.00' : '5.00',
          advancePaymentPercent: null,
          performanceSecurityPercent: null,
          bidBondProvided: null,
        },
        vatComparable: index === 0,
      })),
    });
    component.detectChanges();
    const grid = text(
      (component.nativeElement as HTMLElement).querySelector('.ev-grid') as HTMLElement,
    );
    expect(grid).toContain('tender: Exclusive of VAT 15.00%');
    expect(grid).toContain("Confirms the tender's basis");
    expect(grid).toContain('Inclusive of VAT 15.00%');
    expect(grid).toContain('Not compared until a VAT-basis adjustment is recorded');
    expect(grid).toContain('requested: 10.00%');
    expect(grid).toContain('differs from the request');
  });

  it('shows submitted and leveled values side by side with variance in words and a neutral order the user can change', () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush(commercial());
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    const grid = element.querySelector('.ev-grid') as HTMLElement;
    expect(text(grid)).toContain('2,000,000.00');
    expect(text(grid)).toContain('1,900,000.00');
    expect(text(grid)).toContain('−100,000.00');
    expect(text(grid)).toContain('+52.0% vs median');
    expect(text(grid)).toContain('Not provided');
    expect(text(element)).not.toMatch(/recommended|winner|best/i);
    const headers = () =>
      [...grid.querySelectorAll('thead th .tnd-code')].map((cell) => cell.textContent?.trim());
    expect(headers()).toEqual(['ACME-01', 'BETA-01']);
    const order = element.querySelector('#leveling-order') as HTMLSelectElement;
    order.value = 'leveledAscending';
    order.dispatchEvent(new Event('change'));
    component.detectChanges();
    expect(headers()).toEqual(['BETA-01', 'ACME-01']);
  });

  it('records a whole-bid adjustment with a reason, refusing a decimal comma first, and the drawer returns focus', async () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush(commercial());
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    document.body.appendChild(element);
    const opener = [...element.querySelectorAll('.ev-grid thead button')][1] as HTMLButtonElement;
    opener.focus();
    opener.click();
    component.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const amount = dialog.querySelector('#scope-amount') as HTMLInputElement;
    amount.value = '75,5';
    amount.dispatchEvent(new Event('input'));
    const reason = dialog.querySelector('#scope-reason') as HTMLTextAreaElement;
    reason.value = 'Crane hire priced by the main contractor';
    reason.dispatchEvent(new Event('input'));
    component.detectChanges();
    button(dialog, 'Record adjustment')!.click();
    component.detectChanges();
    expect(text(dialog)).toContain('use a point for decimals');
    http.expectNone('/api/v1/tenders/t1/evaluation/commercial/b2/adjustments');

    amount.value = '75000';
    amount.dispatchEvent(new Event('input'));
    component.detectChanges();
    button(dialog, 'Record adjustment')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/evaluation/commercial/b2/adjustments');
    expect(request.request.body).toMatchObject({
      kind: 'Scope',
      direction: 'Add',
      amount: '75000.00',
      category: 'MissingScope',
      reason: 'Crane hire priced by the main contractor',
    });
    request.flush(commercial());
    component.detectChanges();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    component.detectChanges();
    await settle();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    element.remove();
  });

  it('levels the price schedule by item key and shows missing scope and other quantities (CF-004)', () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    const view = commercial();
    const priced = (amount: string, rate: string, quantity: string, differs = false) => ({
      state: 'priced' as const,
      quantity,
      rate,
      amount,
      quantityDiffers: differs,
    });
    const missing = {
      state: 'missing' as const,
      quantity: null,
      rate: null,
      amount: null,
      quantityDiffers: false,
    };
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush({
      ...view,
      bids: view.bids.map((bid, index) => ({
        ...bid,
        flags:
          index === 0
            ? [
                {
                  key: 'missingScope',
                  section: 'Commercial',
                  severity: 'Warning',
                  parameters: { count: '1', items: 'A.5' },
                },
              ]
            : [],
      })),
      schedule: [
        {
          key: 'A.1',
          section: null,
          description: 'Supply duct',
          unit: 'm2',
          quantity: '130.000',
          type: 'Measured',
          inForce: true,
          bids: [
            priced('10282.70', '85.600000', '120.125', true),
            priced('10400.00', '80.000000', '130.000'),
          ],
        },
        {
          key: 'A.5',
          section: null,
          description: 'Fire dampers',
          unit: 'nr',
          quantity: '10.000',
          type: 'Measured',
          inForce: true,
          bids: [missing, priced('999.90', '99.990000', '10.000')],
        },
      ],
    });
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain('Price schedule by item');
    expect(content).toContain('10,282.70');
    expect(content).toContain('rate 85.60');
    expect(content).toContain('on quantity 120.125');
    expect(content).toContain('Missing scope');
    expect(content).toContain('130 m2');
    expect(content).toContain(
      'Missing scope: \u20661\u2069 schedule items in force are not priced in this bid (it answered an earlier revision): \u2066A.5\u2069.',
    );
    verifyAll(http);
  });
});

describe('Commercial adjustment retries', () => {
  it('reuses the request key when the outcome is unknown and uses a new one after a refusal', () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush(commercial());
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    ([...element.querySelectorAll('.ev-grid thead button')][1] as HTMLButtonElement).click();
    component.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const fill = (selector: string, value: string) => {
      const field = dialog.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    };
    fill('#scope-amount', '75000');
    fill('#scope-reason', 'Crane hire priced by the main contractor');
    component.detectChanges();
    const url = '/api/v1/tenders/t1/evaluation/commercial/b2/adjustments';
    const record = () => {
      button(dialog, 'Record adjustment')!.click();
      return http.expectOne(url);
    };
    const first = record();
    const key = first.request.body.requestKey;
    // No response: the adjustment may have been recorded, so the retry must be recognisable.
    first.error(new ProgressEvent('error'));
    component.detectChanges();
    const second = record();
    expect(second.request.body.requestKey).toBe(key);
    second.flush(
      { status: 409, code: 'evaluation.adjustment_invalid' },
      { status: 409, statusText: 'Conflict' },
    );
    component.detectChanges();
    // A refusal recorded nothing: the next attempt is a new request.
    expect(record().request.body.requestKey).not.toBe(key);
  });
});

describe('Adjustments after a revised response (CF-090)', () => {
  it('flags an adjustment the revised response no longer counts and re-applies it or confirms it no longer applies', () => {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    const base = commercialBid();
    const waiting = {
      ...base.adjustments[0],
      appliesToCurrentResponse: false,
      carryReviewRequired: true,
      carry: null,
    };
    const revised = commercialBid({
      currentRevisionNumber: 2,
      currentRound: 1,
      commercialChangedSinceOpening: true,
      adjustments: [waiting],
      notCarriedCount: 1,
      notCarriedTotal: '-100000.00',
    });
    http
      .expectOne('/api/v1/tenders/t1/evaluation/commercial')
      .flush(commercial({ bids: [revised, commercial().bids[1]] }));
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    expect(text(element)).toContain('1 adjustment waits for review');
    ([...element.querySelectorAll('.ev-grid thead button')][0] as HTMLButtonElement).click();
    component.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('Revision 2 changed this bid');
    expect(text(dialog)).toContain('Needs review: recorded on revision 1');
    const url = '/api/v1/tenders/t1/evaluation/commercial/adjustments/a1/carry';

    // "It no longer applies" asks for a reason before anything is sent.
    button(dialog, 'It no longer applies')!.click();
    component.detectChanges();
    button(dialog, 'Confirm not applicable')!.click();
    component.detectChanges();
    http.expectNone(url);
    expect(text(dialog)).toContain('Explain the reason');
    const reason = dialog.querySelector('#carry-a1') as HTMLTextAreaElement;
    reason.value = 'Firm now prices the line correctly';
    reason.dispatchEvent(new Event('input'));
    component.detectChanges();
    button(dialog, 'Confirm not applicable')!.click();
    const confirm = http.expectOne(url);
    expect(confirm.request.body).toEqual({
      outcome: 'NotApplicable',
      reason: 'Firm now prices the line correctly',
      requestKey: expect.any(String),
    });
    confirm.flush(
      { status: 409, code: 'evaluation.adjustment_carry_not_needed' },
      { status: 409, statusText: 'Conflict' },
    );
    component.detectChanges();
    expect(text(dialog)).toContain('needs no review any more');

    // Re-applying sends no reason; the settled review is shown.
    button(dialog, 'Cancel')!.click();
    component.detectChanges();
    button(dialog, 'Re-apply to revision 2')!.click();
    const reapply = http.expectOne(url);
    expect(reapply.request.body.outcome).toBe('Reapplied');
    expect(reapply.request.body.reason).toBeNull();
    reapply.flush(
      commercial({
        bids: [
          commercialBid({
            currentRevisionNumber: 2,
            adjustments: [
              {
                ...waiting,
                carryReviewRequired: false,
                carry: {
                  outcome: 'Reapplied',
                  reason: null,
                  newAdjustmentId: 'a2',
                  reviewedByName: 'Qusai QS',
                  reviewedAtUtc: '2026-10-04T09:00:00Z',
                },
              },
              {
                ...base.adjustments[0],
                id: 'a2',
                revisionNumber: 2,
                carriedFromAdjustmentId: 'a1',
              },
            ],
            notCarriedCount: 0,
            notCarriedTotal: null,
          }),
          commercial().bids[1],
        ],
      }),
    );
    component.detectChanges();
    expect(text(dialog)).toContain('Re-applied to the revised response by Qusai QS');
    expect(text(dialog)).toContain('Re-applied from an earlier revision');
    expect(button(dialog, 'Re-apply to revision')).toBeUndefined();
  });
});

describe('Scorecard policies', () => {
  it('lets a reader see the policies without offering any change (CF-133)', () => {
    const http = configure(['Evaluation.View']);
    const component = TestBed.createComponent(EvaluationPolicies);
    component.detectChanges();
    http.expectOne('/api/v1/evaluation-policies').flush([]);
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="policy-read-only"]')).not.toBeNull();
    expect(button(element, 'New policy')).toBeUndefined();
  });

  /** CF-133 AC1 (B-133-1): a populated list, opened — the per-row controls must be absent too, not just "New policy". */
  function openPolicy(permissions: readonly string[]) {
    const http = configure(permissions);
    const component = TestBed.createComponent(EvaluationPolicies);
    component.detectChanges();
    const summary = {
      id: 'p1',
      name: 'MEP technical',
      description: null,
      status: 'Active' as const,
      currentVersionNumber: 2,
      criteriaCount: 2,
      scaleMaximum: 10,
      blindTechnicalScoring: true,
      currentVersionLocked: true,
      updatedAtUtc: '2026-09-20T10:00:00Z',
      version: 'pv2',
    };
    http.expectOne('/api/v1/evaluation-policies').flush([summary]);
    component.detectChanges();
    const element = component.nativeElement as HTMLElement;
    button(element, 'MEP technical')!.click();
    const current = {
      id: 'v2',
      number: 2,
      scaleMaximum: 10,
      blindTechnicalScoring: true,
      createdAtUtc: '2026-09-20T10:00:00Z',
      createdByName: 'Maha Manager',
      lockedAtUtc: '2026-09-25T10:00:00Z',
      criteria: [
        {
          id: 'c1',
          position: 1,
          name: 'Technical approach',
          category: 'Technical',
          weight: 60,
          guidance: null,
          commentRequired: true,
          evidenceRequired: false,
        },
        {
          id: 'c2',
          position: 2,
          name: 'Programme',
          category: 'Schedule',
          weight: 40,
          guidance: null,
          commentRequired: false,
          evidenceRequired: false,
        },
      ],
    };
    http.expectOne('/api/v1/evaluation-policies/p1').flush({
      id: 'p1',
      name: 'MEP technical',
      description: null,
      status: 'Active',
      currentVersionNumber: 2,
      current,
      versions: [current, { ...current, id: 'v1', number: 1, lockedAtUtc: null }],
      updatedAtUtc: '2026-09-20T10:00:00Z',
      version: 'pv2',
    });
    component.detectChanges();
    http.verify();
    return element;
  }

  it('shows a reader an opened policy with no Edit, Activate or Make inactive control (CF-133 AC1)', () => {
    const element = openPolicy(['Evaluation.View']);
    const shown = text(element);
    expect(element.querySelector('[data-testid="policy-read-only"]')).not.toBeNull();
    expect(shown).toContain('Technical approach');
    expect(shown).toContain('Programme');
    expect(shown).toContain('Version history');
    const labels = [...element.querySelectorAll('button')].map((each) => text(each).trim());
    for (const control of [
      'New policy',
      'Start from an example',
      'Edit',
      'Activate',
      'Make inactive',
    ])
      expect(labels).not.toContain(control);
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('input, select, textarea')).toBeNull();
  });

  it('still offers the per-row changes to a policy manager (CF-133 AC4)', () => {
    const element = openPolicy(['Evaluation.View', 'Evaluation.ManagePolicy']);
    expect(element.querySelector('[data-testid="policy-read-only"]')).toBeNull();
    const labels = [...element.querySelectorAll('button')].map((each) => text(each).trim());
    expect(labels).toContain('Edit');
    expect(labels).toContain('Make inactive');
    expect(labels).toContain('New policy');
  });

  it('adds weights in hundredths and refuses to save unless they total exactly 100', () => {
    const http = configure(['Evaluation.View', 'Evaluation.ManagePolicy']);
    const component = TestBed.createComponent(EvaluationPolicies);
    component.detectChanges();
    http.expectOne('/api/v1/evaluation-policies').flush([]);
    const policies = component.componentInstance;
    policies.startNew();
    policies.form.name = 'MEP technical';
    for (const weight of ['33.33', '33.33', '33.33']) {
      policies.addCriterion();
      const last = policies.form.criteria[policies.form.criteria.length - 1];
      last.name = `Criterion ${weight}${policies.form.criteria.length}`;
      last.weight = weight;
    }
    component.detectChanges();
    expect(policies.totalText()).toBe('99.99');
    policies.save();
    component.detectChanges();
    expect(text(component.nativeElement as HTMLElement)).toContain(
      'must add up to exactly 100 (now 99.99)',
    );
    http.expectNone('/api/v1/evaluation-policies');
    policies.form.criteria[2].weight = '33.34';
    policies.save();
    const create = http.expectOne('/api/v1/evaluation-policies');
    expect(create.request.method).toBe('POST');
    expect(
      create.request.body.criteria.map((criterion: { weight: number }) => criterion.weight),
    ).toEqual([33.33, 33.33, 33.34]);
  });

  it('starts from a labelled example that saves only when the manager saves it (CF-013)', () => {
    const http = configure(['Evaluation.View', 'Evaluation.ManagePolicy']);
    const component = TestBed.createComponent(EvaluationPolicies);
    component.detectChanges();
    http.expectOne('/api/v1/evaluation-policies').flush([]);
    component.detectChanges();
    button(component.nativeElement as HTMLElement, 'Start from an example')!.click();
    component.detectChanges();
    const policies = component.componentInstance;
    expect(policies.form.name).toBe('Example — technical scorecard');
    expect(policies.form.blindTechnicalScoring).toBe(true);
    expect(policies.form.criteria.map((criterion) => criterion.category)).toEqual([
      'Technical',
      'Methodology',
      'Schedule',
      'Resources',
      'Hse',
    ]);
    expect(policies.totalText()).toBe('100');
    http.expectNone('/api/v1/evaluation-policies');
    policies.save();
    expect(text(component.nativeElement as HTMLElement)).toContain('saved as inactive');
    const create = http.expectOne('/api/v1/evaluation-policies');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.criteria.length).toBe(5);
    // Re-audit R-14: the example is created Inactive; a hand-made policy is not.
    expect(create.request.body.initialStatus).toBe('Inactive');
  });
});

describe('Declared criteria at evaluation start (CF-040)', () => {
  it('preselects the declared policy and asks for a reason before evaluating against another one', () => {
    const http = configure(['Evaluation.View', 'Evaluation.ManagePolicy']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    const option = {
      currentVersionNumber: 2,
      criteriaCount: 2,
      scaleMaximum: 10,
      blindTechnicalScoring: false,
    };
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(
      overview({
        stage: 'NotStarted',
        evaluation: null,
        policyOptions: [
          {
            ...option,
            policyId: 'p1',
            name: 'Declared MEP',
            declared: true,
            declaredVersionNumber: 1,
          },
          { ...option, policyId: 'p2', name: 'Programme heavy' },
        ],
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('Declared MEP (declared at publication, version 1)');
    const component = page.componentInstance;
    expect(component.policyChoice).toBe('p1');
    expect(element.querySelector('#evaluation-deviation')).toBeNull();

    const select = element.querySelector('#evaluation-policy') as HTMLSelectElement;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    page.detectChanges();
    expect(element.querySelector('#evaluation-deviation')).not.toBeNull();
    button(element, 'Start evaluation')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/tenders/t1/evaluation');
    expect(text(element)).toContain('Explain the reason');
    const reason = element.querySelector('#evaluation-deviation') as HTMLTextAreaElement;
    reason.value = 'Client asked to weigh the programme';
    reason.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(element, 'Start evaluation')!.click();
    const start = http.expectOne('/api/v1/tenders/t1/evaluation');
    expect(start.request.body).toEqual({
      policyId: 'p2',
      version: null,
      deviationReason: 'Client asked to weigh the programme',
      panelMinimum: null,
    });
    start.flush(
      overview({
        evaluation: state({
          criteriaDeclaration: 'deviated',
          declaredPolicyName: 'Declared MEP',
          declaredPolicyVersionNumber: 1,
          policyDeviationReason: 'Client asked to weigh the programme',
        }),
      }),
    );
    page.detectChanges();
    expect(text(element)).toContain(
      'Not the declared criteria (Declared MEP, version 1): Client asked to weigh the programme',
    );
  });
});

describe('Evaluation panel (CF-043)', () => {
  it('assigns evaluators, shows their progress and the divergence spread, and removes one', () => {
    const http = configure(['Evaluation.View', 'Evaluation.ManagePolicy', 'Evaluation.Complete']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    const base = overview();
    const bidId = base.bids[0].openingBidId;
    const panel = {
      minimum: 2,
      divergenceThresholdPoints: 10,
      moderationRequired: true,
      assignments: [],
      candidates: [
        { memberId: 'm1', name: 'Tariq TE', seesCommercial: false },
        { memberId: 'm2', name: 'Pam PM', seesCommercial: true },
      ],
      canAssign: true,
      assignedToMe: false,
    };
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(
      overview({
        panel,
        bids: [{ ...base.bids[0], scoreSpread: '40', divergent: true, moderated: false }],
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('Each bid needs 2 current submitted scorecard(s)');
    expect(text(element)).toContain('Divergent scores');
    expect(text(element)).toContain('Pam PM (also sees prices)');
    const select = element.querySelector('#panel-member') as HTMLSelectElement;
    select.value = 'm1';
    select.dispatchEvent(new Event('change'));
    page.detectChanges();
    button(element, 'Add to panel')!.click();
    const assign = http.expectOne('/api/v1/tenders/t1/evaluation/assignments');
    expect(assign.request.body).toEqual({ memberId: 'm1' });
    assign.flush(
      overview({
        panel: {
          ...panel,
          candidates: [panel.candidates[1]],
          assignments: [
            {
              id: 'a1',
              memberName: 'Tariq TE',
              assignedAtUtc: '2026-10-04T09:00:00Z',
              assignedByName: 'Pam PM',
              isMe: false,
              bids: [{ openingBidId: bidId, status: 'Draft' }],
              submittedCount: 0,
              version: 'v1',
            },
          ],
        },
      }),
    );
    page.detectChanges();
    expect(text(element)).toContain('Tariq TE');
    expect(text(element)).toContain('Draft');
    button(element, 'Remove')!.click();
    const remove = http.expectOne('/api/v1/tenders/t1/evaluation/assignments/a1/remove');
    expect(remove.request.body).toEqual({ version: 'v1' });
    remove.flush(overview({ panel }));
    page.detectChanges();
    expect(text(element)).toContain('No evaluator is assigned yet');
  });
});

describe('Negotiation rounds in the evaluation (Part 10)', () => {
  it('takes a closed round in only after a confirmation, and marks revised and superseded evidence', async () => {
    const http = configure(['Evaluation.View', 'Evaluation.Complete']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    const base = overview();
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(
      overview({
        latestClosedRound: 1,
        canRefresh: true,
        bids: [{ ...base.bids[0], currentRevisionNumber: 2, currentRound: 1 }],
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('Negotiation round 1 closed');
    expect(text(element)).toContain('Revised in round 1 (revision 2)');
    button(element, 'Take in round 1 responses')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('Nothing is selected or awarded');
    button(dialog, 'Take in responses')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/evaluation/refresh');
    expect(request.request.body).toEqual({ version: 'ev1' });
    request.flush(overview({ latestClosedRound: 1, evaluation: state({ round: 1 }) }));
    page.detectChanges();
    expect(text(element)).toContain('Up to negotiation round 1');
    expect(button(element, 'Take in round 1 responses')).toBeUndefined();

    const technicalPage = TestBed.createComponent(EvaluationTechnical);
    technicalPage.componentRef.setInput('tenderId', 't1');
    technicalPage.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/technical').flush(
      technical({
        bids: [
          technicalBid({
            currentRound: 1,
            currentRevisionNumber: 2,
            rescoreRequired: true,
            submittedScorecards: [
              {
                id: 's1',
                openingBidId: 'b1',
                number: 1,
                evaluatorName: 'Tariq Technical',
                mine: true,
                submittedAtUtc: '2026-10-03T12:00:00Z',
                weightedTotal: 80,
                scaleMaximum: 10,
                scores: [],
                revisionNumber: 1,
                scoresCurrentResponse: false,
              },
            ],
          }),
        ],
      }),
    );
    technicalPage.detectChanges();
    await settle();
    technicalPage.detectChanges();
    const technicalText = text(technicalPage.nativeElement as HTMLElement);
    expect(technicalText).toContain('Revised in negotiation round 1');
    expect(technicalText).toContain('this bid needs a new submitted scorecard');
    expect(technicalText).toContain('Superseded (revision 1) — no longer counts');
  });
});

describe('What follows a completed evaluation (CF-007)', () => {
  function completed(features: string[], permissions: string[], latestClosedRound = 0, round = 0) {
    const http = configure(['Evaluation.View', ...permissions]);
    (
      TestBed.inject(EntitlementsService) as unknown as {
        current: { set: (value: unknown) => void };
      }
    ).current.set(features);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http.expectOne('/api/v1/tenders/t1/evaluation').flush(
      overview({
        stage: 'Completed',
        latestClosedRound,
        evaluation: state({
          status: 'Completed',
          round,
          completedAtUtc: '2026-10-01T09:00:00Z',
          completedByName: 'Maha Manager',
        }),
      }),
    );
    page.detectChanges();
    return text(page.nativeElement as HTMLElement);
  }

  it('never promises the decision stage on a plan without the award', () => {
    const shown = completed([], ['Decision.View']);
    expect(shown).toContain('Evaluation is the last stage in your plan');
    expect(shown).not.toContain('ready for the decision stage');
  });

  it('names a closed round still to be taken in, and its owner', () => {
    const shown = completed(['award'], ['Decision.View'], 1, 0);
    expect(shown).toContain('must be taken into the evaluation first (owner: Procurement Manager)');
    expect(shown).not.toContain('ready for the decision stage');
  });

  it('hands over neutrally to a reader who cannot open the decision, and offers the decision to one who can', () => {
    expect(completed(['award'], [])).toContain('handed to procurement leadership');
    TestBed.resetTestingModule();
    expect(completed(['award'], ['Decision.View'])).toContain('ready for the decision stage');
  });
});

describe('The exact policy version an evaluation used (CF-133 AC5)', () => {
  it('links the evaluation to its policy version, for readers of the policies', () => {
    const http = configure(['Evaluation.View']);
    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ evaluation: state({ policyVersionNumber: 2 }) }));
    page.detectChanges();
    const link = (page.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="policy-version-link"]',
    )!;
    expect(link.getAttribute('href')).toBe('/evaluation-policies?policy=p1&version=2');
    expect(text(link).trim()).toBe('MEP technical');
    expect(link.getAttribute('title')).toBe('Open version 2 of this policy');
  });

  it('opens the policy at the version used, not the current one', async () => {
    const http = configure(['Evaluation.View'], { policy: 'p1', version: '2' });
    const component = TestBed.createComponent(EvaluationPolicies);
    component.detectChanges();
    const criterion = (id: string, name: string, weight: number) => ({
      id,
      position: 1,
      name,
      category: 'Technical',
      weight,
      guidance: null,
      commentRequired: false,
      evidenceRequired: false,
    });
    const version = (number: number, criteria: ReturnType<typeof criterion>[]) => ({
      id: `v${number}`,
      number,
      scaleMaximum: 10,
      blindTechnicalScoring: false,
      createdAtUtc: '2026-09-01T09:00:00Z',
      createdByName: 'Maha Manager',
      lockedAtUtc: '2026-09-02T09:00:00Z',
      criteria,
    });
    const v2 = version(2, [criterion('c2', 'Method statement v2', 100)]);
    const v3 = version(3, [criterion('c3', 'Current approach', 100)]);
    http.expectOne('/api/v1/evaluation-policies').flush([
      {
        id: 'p1',
        name: 'MEP technical',
        description: null,
        status: 'Active',
        currentVersionNumber: 3,
        criteriaCount: 1,
        scaleMaximum: 10,
        blindTechnicalScoring: false,
        currentVersionLocked: false,
        updatedAtUtc: '2026-09-03T09:00:00Z',
        version: 'pv',
      },
    ]);
    http.expectOne('/api/v1/evaluation-policies/p1').flush({
      id: 'p1',
      name: 'MEP technical',
      description: null,
      status: 'Active',
      currentVersionNumber: 3,
      current: v3,
      versions: [version(1, [criterion('c1', 'First', 100)]), v2, v3],
      updatedAtUtc: '2026-09-03T09:00:00Z',
      version: 'pv',
    });
    component.detectChanges();
    await settle();
    const used = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="policy-used-version"]',
    ) as HTMLElement;
    expect(used).not.toBeNull();
    expect(text(used)).toContain('Version 2 — used by this evaluation');
    expect(text(used)).toContain('Method statement v2');
    expect(text(used)).not.toContain('Current approach');
    expect(used.querySelectorAll('button, input, select, textarea')).toHaveLength(0);
  });
});

describe('Leveling estimate and validity facts (red-team B7: G036, G037, G050)', () => {
  function level(view: ReturnType<typeof commercial>) {
    const http = configure();
    const component = TestBed.createComponent(EvaluationCommercial);
    component.componentRef.setInput('tenderId', 't1');
    component.detectChanges();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush(view);
    component.detectChanges();
    return component.nativeElement as HTMLElement;
  }
  const withValidity = (bids: ReturnType<typeof commercial>['bids']) =>
    bids.map((bid, index) => ({
      ...bid,
      validUntilUtc: '2026-12-30T09:00:00Z',
      validityBasis: 'SubmissionDeadline',
      validityState: index === 0 ? ('Valid' as const) : ('Lapsed' as const),
    }));

  it('shows the estimate, its value at publication, the changed flag and each bid against it', () => {
    const base = commercial();
    const element = level({
      ...base,
      estimate: '1800000.00',
      estimateCurrency: 'QAR',
      estimateAtPublication: '1700000.00',
      estimateChangedAfterPublication: true,
      estimateComparable: true,
      bids: base.bids.map((bid, index) => ({
        ...bid,
        estimateVariancePercent: index === 0 ? '5.56' : '-2.25',
      })),
    });
    const block = text(element.querySelector('[data-testid="leveling-estimate"]') as HTMLElement);
    expect(block).toContain('Package estimate');
    expect(block).toContain('1,800,000.00 QAR');
    expect(block).toContain('At publication: 1,700,000.00 QAR');
    expect(block).toContain('The package estimate was changed after this tender was published');
    const row = element.querySelector('[data-testid="estimate-variance-row"]') as HTMLElement;
    expect(text(row)).toContain('Leveled total against the estimate');
    const cells = [...row.querySelectorAll<HTMLElement>('td bdi[dir="ltr"]')].map((cell) =>
      text(cell).trim(),
    );
    expect(cells).toEqual(['+5.56 %', '-2.25 %']);
  });

  it('says "not comparable (currency)" and shows no variance when the estimate is in another currency', () => {
    const element = level({
      ...commercial(),
      estimate: '500000.00',
      estimateCurrency: 'USD',
      estimateAtPublication: '500000.00',
      estimateComparable: false,
      estimateNotComparableReason: 'currency',
    });
    const block = text(element.querySelector('[data-testid="leveling-estimate"]') as HTMLElement);
    expect(block).toContain('500,000.00 USD');
    expect(block).toContain(
      'Not comparable: the estimate is in USD, the bids in QAR. Nothing is converted.',
    );
    expect(element.querySelector('[data-testid="estimate-variance-row"]')).toBeNull();
    expect(text(element)).not.toContain('Leveled total against the estimate');
  });

  it('renders nothing estimate-related for a reader who does not receive the estimate', () => {
    const element = level(commercial());
    expect(element.querySelector('[data-testid="leveling-estimate"]')).toBeNull();
    expect(element.querySelector('[data-testid="estimate-variance-row"]')).toBeNull();
    for (const absent of ['Package estimate', 'At publication', 'Not comparable'])
      expect(text(element)).not.toContain(absent);
  });

  it('shows valid-until in the tender time zone, its basis and a lapsed bid', () => {
    const base = commercial();
    const element = level({ ...base, timeZoneId: 'Asia/Qatar', bids: withValidity(base.bids) });
    const grid = text(element.querySelector('.ev-grid') as HTMLElement);
    expect(grid).toContain('until Dec 30, 2026, 12:00 (Asia/Qatar, UTC+03:00)');
    expect(grid).toContain('Lapsed');
    expect(text(element)).toContain('Validity runs from the submission deadline');
  });
});
