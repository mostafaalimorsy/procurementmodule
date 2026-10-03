import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import { of } from 'rxjs';
import arabicMessages from '../../../locale/messages.ar.json';

// A separate spec file: the translated template is cached on first render, so the Arabic catalogue must be loaded before
// the components are created in this module graph.
registerLocaleData(localeAr);
loadTranslations(arabicMessages.translations);
const localize = $localize as { locale?: string };
const previousLocale = localize.locale;
localize.locale = 'ar';
afterAll(() => {
  clearTranslations();
  localize.locale = previousLocale;
});

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');

function configure(tab: string | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'ar' },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ id: 't1' }) },
          queryParamMap: of(convertToParamMap(tab ? { tab } : {})),
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('Decision and negotiation in Arabic', () => {
  it('ranks by "ترتيب التوصية", keeps money and codes left-to-right with Latin digits and no English copy', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { decision } = await import('./decision.fixtures');
    const http = configure('recommendation');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(decision());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('ترتيب التوصية 1');
    expect(shown).toContain('السجل غير كافٍ');
    expect(shown).toContain('الأداء السابق: غير متاح');
    expect(shown).toContain('الأدلة الحالية (هذه المناقصة)');
    expect(shown).not.toMatch(/Recommendation rank|Historical performance|winner/);
    expect(shown).not.toMatch(/[٠-٩]/);
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('1,800,000.00 QAR');
    expect(amounts).toContain('ACME-01');
    // Localized dates (Arabic month names) are never forced left-to-right: only codes, money and hashes are.
    const arabicInLtr = [...element.querySelectorAll('[dir="ltr"]')].filter((node) =>
      /[\u0600-\u06FF]/.test(node.textContent ?? ''),
    );
    expect(arabicInLtr).toEqual([]);
    expect(shown).toMatch(/أكتوبر 2026/);
  });

  it('writes the approval route, the outcomes and the award in Arabic', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { pending } = await import('./decision.fixtures');
    const http = configure('approval');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http
      .expectOne('/api/v1/tenders/t1/decision')
      .flush(pending({ approvalBlocker: 'self_approval' }));
    page.detectChanges();
    const shown = text(page.nativeElement as HTMLElement);
    expect(shown).toContain('مسار الموافقة');
    expect(shown).toContain('الخطوة 1: المعتمِد / المدير');
    expect(shown).toContain('الخطوة 2: أي معتمِد');
    expect(shown).toContain('غير مختار (رُفض العطاء)');
    expect(shown).toContain('احتياطي، الترتيب 1');
    expect(shown).toContain('لا تسمح قاعدة الموافقة بالموافقة الذاتية');
    expect(shown).not.toMatch(/Approval route|Not selected|Reserve, order/);
  });

  it('says in Arabic that a round past its deadline must be closed (CF-010)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { decision } = await import('./decision.fixtures');
    const http = configure();
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      decision({
        readiness: { state: 'NegotiationOpen', gaps: ['negotiation_deadline_passed'] },
      }),
    );
    page.detectChanges();
    const note = (page.nativeElement as HTMLElement).querySelector(
      '.tnd-attention-box[role="note"]',
    ) as HTMLElement;
    expect(text(note)).toContain(
      'جولة تفاوض تجاوزت موعد الرد وما زالت مفتوحة. أغلقها لإدخال ردودها.',
    );
    expect(text(note)).not.toContain('لا تزال جولة تفاوض مفتوحة. أغلقها أو ألغها أولًا.');
    expect(text(note)).not.toMatch(/negotiation|deadline|Close it/i);
  });

  it('reads the default approval route in Arabic, with no Latin "default" (CF-099)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { pending, submission } = await import('./decision.fixtures');
    const http = configure('approval');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    const base = submission();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      pending({
        currentSubmission: submission({
          route: {
            ...base.route,
            ruleName: 'default',
            isDefault: true,
            requiredApprovals: 1,
            steps: [{ step: 1, role: 'ApproverDirector', approval: null }],
          },
        }),
      }),
    );
    page.detectChanges();
    const shown = text(page.nativeElement as HTMLElement);
    expect(shown).toContain('مسار الموافقة');
    expect(shown).toContain('المسار الافتراضي');
    expect(shown).toContain(
      'لا تطابق أي قاعدة اعتماد، لذا يُطبَّق المسار الافتراضي: اعتماد واحد من معتمد/مدير.',
    );
    expect(shown).not.toMatch(/default/i);
    expect(shown).not.toContain('No approval rule matches');
  });

  it('reads a rule literally named "default" as a named rule when the server says it is not the default route (CF-099 AC3)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { pending, submission } = await import('./decision.fixtures');
    const http = configure('approval');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    const base = submission();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      pending({
        currentSubmission: submission({
          route: { ...base.route, ruleName: 'default', isDefault: false },
        }),
      }),
    );
    page.detectChanges();
    const shown = text(page.nativeElement as HTMLElement);
    expect(shown).toContain('القاعدة');
    expect(shown).toContain('default');
    expect(shown).not.toContain('المسار الافتراضي');
    expect(shown).not.toContain('لا تطابق أي قاعدة اعتماد');
  });

  it('marks in Arabic a route approved without independent approval (CF-034 AC5)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { pending, submission } = await import('./decision.fixtures');
    const http = configure('approval');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    const base = submission();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      pending({
        currentSubmission: submission({
          route: { ...base.route, requiredApprovals: 0, steps: [] },
        }),
      }),
    );
    page.detectChanges();
    const chip = (page.nativeElement as HTMLElement).querySelector('.prj-chip.tnd-attention');
    expect(chip).not.toBeNull();
    expect(text(chip as HTMLElement)).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('shows the award baseline governance context in Arabic, right to left, with the zone kept left-to-right (red-team B4)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { pending, submission, award } = await import('./decision.fixtures');
    const { LocaleService } = await import('../../core/localization/locale.service');
    const http = configure('award');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      pending({
        status: 'Awarded',
        currentSubmission: submission({ outcome: 'Awarded' }),
        timeZoneId: 'Asia/Qatar',
        award: award({
          baseline: {
            ...award().baseline,
            routeWithoutIndependentApproval: true,
            limitedCompetition: true,
            competitionCategory: 'Urgency',
            competitionReason: 'سبب المنافسة',
            overBudget: true,
            overBudgetReason: 'سبب تجاوز التقدير',
            validityBasis: 'SubmissionDeadline',
            validUntilUtc: '2026-12-30T09:00:00Z',
            validityExtendedUntil: '2027-01-31',
            validityExtensionChannel: 'Email',
            validityExtensionReference: 'MAIL-77',
            shortlistBasis: [
              {
                approvalId: 'sa1',
                round: 1,
                fastPath: true,
                approvedByName: 'عمر',
                approvedAtUtc: '2026-09-20T08:00:00Z',
              },
            ],
          },
        }),
      }),
    );
    page.detectChanges();
    expect(TestBed.inject(LocaleService).direction).toBe('rtl');
    const baseline = (page.nativeElement as HTMLElement).querySelector(
      'app-award-baseline',
    ) as HTMLElement;
    const shown = text(baseline);
    expect(shown).toContain('اعتُمد دون اعتماد مستقل');
    expect(shown).toContain('منافسة محدودة');
    expect(shown).toContain('أعلى من تقدير حزمة العمل');
    expect(shown).toContain('مدّد المقاول صلاحية العرض حتى');
    expect(shown).toContain('MAIL-77');
    expect(shown).toContain('اعتُمدت القائمة المختصرة عبر المسار السريع للقيم المنخفضة');
    const validity = text(baseline.querySelector('[data-testid="baseline-validity"]')!);
    expect(validity).toContain('يومًا، حتى');
    // The zone and its offset are isolated left-to-right inside the Arabic sentence; digits stay Latin.
    expect(validity).toContain('\u2066Asia/Qatar\u2069');
    expect(validity).toContain('\u2066UTC+03:00\u2069');
    expect(validity).not.toMatch(/[٠-٩]/);
    for (const english of [
      'Approved without independent approval',
      'Limited competition',
      'Above the package estimate',
      'extended validity',
      'fast path',
      'days, until',
    ])
      expect(shown).not.toContain(english);
  });

  it('marks a first place without enough competition as not market-tested, in Arabic (CF-038 AC1)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { decision, recommendation, controls } = await import('./decision.fixtures');
    const http = configure('recommendation');
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(
      decision({
        recommendation: { ...recommendation(), limitedCompetition: true, minimumCompliantBids: 3 },
        controls: controls({ eligible: 2, minimumCompliantBids: 3, limitedCompetition: true }),
      }),
    );
    page.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    page.detectChanges();
    const chip = (page.nativeElement as HTMLElement).querySelector(
      '[data-testid="not-market-tested"]',
    ) as HTMLElement;
    expect(text(chip).trim()).toBe('لم يُختبر في السوق');
    expect(chip.getAttribute('title')).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('shows the selected firm its round in Arabic with Arabic plural forms and a left-to-right deadline offset', async () => {
    const { TenderNegotiationPage } = await import('../bidder/tender-negotiation');
    const { bidderRound } = await import('./decision.fixtures');
    window.history.replaceState(null, '', '/tender-negotiation#token=round-secret');
    const http = configure();
    const page = TestBed.createComponent(TenderNegotiationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tender-invitations/negotiation').flush(
      bidderRound({
        responseDeadline: {
          utc: '2099-10-03T11:00:00Z',
          local: '2099-10-03T14:00',
          offset: '+03:00',
        },
        serverNowUtc: '2099-10-01T09:00:00Z',
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('عرضكم الأفضل والنهائي');
    expect(shown).toContain('هذه الجولة مفتوحة');
    expect(shown).toContain('الموعد النهائي للرد');
    expect(shown).toContain('UTC+03:00');
    // The countdown follows the server's clock: two days (dual form) and some hours left.
    expect(shown).toContain('يومان');
    expect(shown).not.toMatch(/Time left|days|Prepare a revised response/);
    expect(shown).not.toMatch(/[٠-٩]/);
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('2,000,000.00 QAR');
  });

  it('prepares the next decision after a released award in Arabic (red-team G076)', async () => {
    const { DecisionPage } = await import('./decision-page');
    const { award, candidate, decision, recommendation, FULL_DECISION_ACCESS } =
      await import('./decision.fixtures');
    const draftFor = (proposedOpeningBidId: string, awardValue: string) => ({
      recommendationId: 'rec1',
      proposedOpeningBidId,
      isOverride: false,
      overrideReason: null,
      awardValue,
      valueReason: null,
      rationale: null,
      dispositions: [],
      suggestedAwardValue: awardValue,
      updatedAtUtc: '2026-10-12T11:00:00Z',
      preparedByName: 'Maha Manager',
      competitionCategory: null,
      competitionReason: null,
      overBudgetReason: null,
    });
    const released = (overrides: Record<string, unknown> = {}) =>
      decision({
        status: 'Draft',
        decisionVersion: 'dv1',
        recommendation: recommendation({
          candidates: [
            ...recommendation().candidates,
            candidate({
              openingBidId: 'b4',
              subcontractorCode: 'DELT-01',
              subcontractorName: 'Delta Builders',
              leveledTotal: '2100000.00',
              rank: 3,
              flags: [],
            }),
          ],
        }),
        award: award({
          subcontractorCode: 'ACME-01',
          subcontractorName: 'Acme Mechanical',
          sequence: 1,
          state: 'Declined',
        }),
        promotionSuggestion: { openingBidId: 'b2', source: 'reserve_rank_1' },
        ...overrides,
      });
    const open = async (view: ReturnType<typeof decision>) => {
      TestBed.resetTestingModule();
      const http = configure('decision');
      const page = TestBed.createComponent(DecisionPage);
      page.detectChanges();
      http.expectOne('/api/v1/tenders/t1/decision').flush(view);
      page.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
      page.detectChanges();
      return { page, element: page.nativeElement as HTMLElement };
    };
    const submit = (element: HTMLElement) =>
      [...element.querySelectorAll('button')]
        .find((button) => text(button).includes('تقديم للموافقة'))!
        .click();

    // The suggestion is pre-selected and its source named; the previous awardee is disabled with a note.
    const first = await open(released());
    const select = first.element.querySelector('#decision-proposed') as HTMLSelectElement;
    expect(select.value).toBe('b2');
    const acme = [...select.options].find((option) => option.value === 'b1')!;
    expect(acme.disabled).toBe(true);
    expect(text(acme)).toContain('(رُفضت ترسيتها السابقة أو سُحبت)');
    const shown = text(first.element);
    expect(shown).toContain('مقترح بعد انتهاء الترسية السابقة');
    expect(shown).toContain('أول احتياطي أبقته تلك الترسية.');
    expect(shown).toContain('لا يمكن اقتراح شركة رُفضت ترسيتها على هذه المناقصة أو سُحبت مرة أخرى');
    expect(shown).not.toMatch(/Suggested after|earlier award|cannot be proposed again/);

    // The next-ranked firm is submitted without an override reason by a reader without the override right.
    const next = await open(
      released({
        access: { ...FULL_DECISION_ACCESS, override: false },
        draft: draftFor('b2', '1950000.00'),
        promotionSuggestion: { openingBidId: 'b2', source: 'next_ranked' },
      }),
    );
    expect(text(next.element)).toContain('العطاء المؤهل التالي في الترتيب.');
    expect(next.element.querySelector('#decision-override')).toBeNull();
    submit(next.element);
    next.page.detectChanges();
    expect(next.element.querySelector('[role="dialog"]')).not.toBeNull();

    // A lower firm still needs the override reason.
    const lower = await open(released({ draft: draftFor('b4', '2100000.00') }));
    expect(text(lower.element)).toContain('يُسجَّل القرار تجاوزًا للتوصية');
    submit(lower.element);
    lower.page.detectChanges();
    expect(text(lower.element)).toContain('اذكر سبب اقتراح شركة ليست في الترتيب الأول');
    expect(lower.element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('explains the reserved approval rule name in Arabic (red-team Y)', async () => {
    const { knownProductProblem } = await import('../../core/localization/product-problem');
    expect(
      knownProductProblem({ code: 'approval_rule.name_reserved', parameters: { name: 'default' } }),
    ).toBe('الاسم «default» محجوز للمسار الافتراضي الذي يُطبَّق عند عدم مطابقة أي قاعدة.');
  });

  it('explains Part 10 refusals in Arabic, with ranges written out in words', async () => {
    const { knownProductProblem } = await import('../../core/localization/product-problem');
    const message = knownProductProblem({
      code: 'decision.override_reason_required',
      parameters: { field: 'overrideReason', min: '3', max: '1000' },
    });
    expect(message).toContain('من 3 إلى 1000');
    expect(message).not.toMatch(/[A-Za-z]/);
    expect(
      knownProductProblem({
        code: 'negotiation.response_closed',
        parameters: { reason: 'withdrawn' },
      }),
    ).toContain('أزال المشتري شركتكم');
  });
});
