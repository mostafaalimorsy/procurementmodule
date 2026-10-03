import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';
import type { DecisionPack, PackState } from './decision.api';

// Red-team B-003-1 (CF-003 AC7a): the decision and award pack rendered in Arabic. A separate spec file: the translated template is
// cached on first render, so the Arabic catalogue must be loaded before the component is created in this module graph.
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

async function render(state: PackState) {
  const { award, decision, recommendation, submission } = await import('./decision.fixtures');
  const { DecisionPackPage } = await import('./decision-pack');
  const awarded = state === 'Awarded';
  const pack: DecisionPack = {
    header: {
      tenderReference: 'TND-2026-0009',
      tenderTitle: 'أعمال التكييف',
      tenderRevision: 2,
      companyName: 'شركة دلتا للمقاولات',
      generatedByName: 'منى',
      generatedAtUtc: '2026-10-04T09:00:00Z',
      decisionVersion: 'dv1',
      openingFingerprint: 'a'.repeat(64),
      recommendationFingerprint: 'b'.repeat(64),
      baselineFingerprint: awarded ? 'c'.repeat(64) : null,
    },
    state,
    decision: decision({
      recommendation: recommendation(),
      currentSubmission: state === 'Draft' ? null : submission(),
      award: awarded ? award() : null,
      shortlistBasis: null,
    }),
    openedBids: [
      {
        position: 1,
        subcontractorCode: 'ACME-01',
        subcontractorName: 'أكمي للأعمال الميكانيكية',
        bidReference: 'BID-AAAA-BBBB',
        revisionNumber: 1,
        currentRevisionNumber: 2,
        contentSha256: 'd'.repeat(64),
        withdrawnAfterOpening: false,
      },
    ],
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'ar' },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(DecisionPackPage);
  fixture.detectChanges();
  http.expectOne('/api/v1/tenders/t1/decision/pack').flush(pack);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** The pack's own English copy — none of it may reach the Arabic page. */
const ENGLISH_COPY = [
  'Decision and award pack',
  'Back to the decision',
  'Print or save as PDF',
  'Tender revision',
  'Generated',
  'Decision version',
  'Opening evidence',
  'Recommendation evidence',
  'Award baseline',
  'Bids opened',
  'Bid reference',
  'Revision opened',
  'Leveled total',
  'Total score',
  'Proposed firm',
  'Award value',
  'Approval trail',
  'Every bid',
  'Awarded firm',
  'Proposed duration',
  'not approved',
  'Draft',
];

describe('Decision and award pack in Arabic (red-team B-003-1)', () => {
  it('renders the Awarded pack with Arabic titles, no English pack copy, and evidence left-to-right in Latin digits', async () => {
    const element = await render('Awarded');
    const shown = text(element);
    for (const title of [
      'ملف القرار والترسية',
      'العطاءات المفتوحة',
      'سجل الاعتماد',
      'خط أساس الترسية',
      'أدلة الفتح (SHA-256)',
      'مراجعة المناقصة',
      'الشركة المرسى عليها',
    ])
      expect(shown).toContain(title);
    for (const english of ENGLISH_COPY) expect(shown).not.toContain(english);
    // An approved or awarded pack carries no watermark.
    expect(element.querySelector('.pack-watermark')).toBeNull();
    // References, revisions and the 64-character fingerprints are isolated left-to-right, with Latin digits.
    const ltr = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => text(node).trim());
    expect(ltr).toContain('TND-2026-0009');
    expect(ltr).toContain('2');
    expect(ltr).toContain('1 / 2');
    expect(ltr).toContain('BID-AAAA-BBBB');
    for (const hash of ['a', 'b', 'c', 'd'].map((digit) => digit.repeat(64)))
      expect(ltr).toContain(hash);
    // Amounts (the award value in the decision and in the baseline): an LTR isolate with the ISO code and Latin digits.
    const amounts = [...element.querySelectorAll('.pack-facts > div')]
      .filter((fact) => text(fact.querySelector('dt')!).trim() === 'قيمة الترسية')
      .map((fact) => text(fact.querySelector('dd bdi[dir="ltr"]')!).trim());
    expect(amounts).toHaveLength(2);
    for (const amount of amounts) {
      expect(amount).toMatch(/[A-Z]{3}/);
      expect(amount).toMatch(/\d/);
    }
    expect(shown).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('marks the Draft pack with the Arabic watermark and leaks no English', async () => {
    const element = await render('Draft');
    const watermark = element.querySelector('.pack-watermark');
    expect(text(watermark!).trim()).toBe('مسودة — غير معتمدة');
    const shown = text(element);
    expect(shown).toContain('ملف القرار والترسية');
    for (const english of ENGLISH_COPY) expect(shown).not.toContain(english);
    expect(shown).not.toMatch(/[٠-٩۰-۹]/);
    const ltr = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => text(node).trim());
    expect(ltr).toContain('a'.repeat(64));
    expect(ltr).toContain('TND-2026-0009');
  });
});
