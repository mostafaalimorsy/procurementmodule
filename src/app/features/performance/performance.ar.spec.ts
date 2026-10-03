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

function configure(step: string | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'ar' },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ awardId: 'a1' }) },
          queryParamMap: of(convertToParamMap(step ? { step } : {})),
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('Performance closeout in Arabic', () => {
  it('says awarded, actual and variance in Arabic while money, percentages and codes stay left-to-right in Latin digits', async () => {
    const { CloseoutPage } = await import('./closeout-page');
    const { recordedCloseout } = await import('./performance.fixtures');
    const http = configure();
    const page = TestBed.createComponent(CloseoutPage);
    page.detectChanges();
    http.expectOne('/api/v1/performance/closeouts/a1').flush(recordedCloseout());
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('المُرسى والفعلي والفرق');
    expect(shown).toContain('قيمة الترسية');
    expect(shown).toContain('التكلفة النهائية الفعلية');
    expect(shown).toContain('أعلى من قيمة الترسية');
    expect(shown).toContain('أطول من المُرسى');
    expect(shown).toContain('لم يُسجَّل عند الترسية — لا شيء للمقارنة به');
    // Numbers keep Latin digits and their own direction.
    expect(shown).toContain('555,000.00 QAR');
    expect(shown).toContain('+11.00 %');
    expect(shown).not.toMatch(/[٠-٩]/);
    const isolated = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => text(node));
    expect(isolated).toEqual(
      expect.arrayContaining(['TND-2026-0007', '500,000.00 QAR', '+11.00 %', '+20.00 %']),
    );
    expect(shown).not.toMatch(/Award value|Actual final cost|Variance|Closeout|Not captured/);
  });

  it('names the closeout steps, ratings and would-work-again choices in Arabic', async () => {
    const { CloseoutPage } = await import('./closeout-page');
    const { recordedCloseout } = await import('./performance.fixtures');
    const http = configure('feedback');
    const page = TestBed.createComponent(CloseoutPage);
    page.detectChanges();
    http.expectOne('/api/v1/performance/closeouts/a1').flush(recordedCloseout());
    page.detectChanges();
    const shown = text(page.nativeElement as HTMLElement);
    expect(shown).toContain('المراجعة والإغلاق');
    expect(shown).toContain('نعم — سنتعامل معهم مجددًا');
    expect(shown).toContain('مشروط — فقط بشروط محددة');
    expect(shown).not.toMatch(/Would you work|Review & close|Conditional/);
  });

  it('reads a closed section as Arabic values and names the reopening roles joined with «أو» (CF-101)', async () => {
    const { CloseoutPage } = await import('./closeout-page');
    const { PM_ACCESS, closedCloseout } = await import('./performance.fixtures');
    const http = configure('schedule');
    const page = TestBed.createComponent(CloseoutPage);
    page.detectChanges();
    http
      .expectOne('/api/v1/performance/closeouts/a1')
      .flush(closedCloseout({ ...PM_ACCESS, editExecution: false, editCommercial: false }));
    page.detectChanges();
    http
      .expectOne('/api/v1/access/role-holders?permission=Performance.Reopen')
      .flush({ permission: 'Performance.Reopen', roles: ['CompanyAdmin', 'ProcurementManager'] });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pf-panel input, .pf-panel textarea')).toHaveLength(0);
    const terms = [...element.querySelectorAll('dl.pf-readonly dt')].map((dt) => text(dt).trim());
    expect(terms).toEqual(
      expect.arrayContaining([
        'تاريخ البدء الفعلي',
        'التجهيز والتعبئة',
        'ملاحظة التجهيز (اختيارية)',
      ]),
    );
    const shown = text(element.querySelector('.pf-panel')!);
    expect(shown).toContain('غير مسجّل');
    const notice = text(element.querySelector('[data-testid="closed-notice"]')!);
    expect(notice).toContain('مسؤول الشركة أو مدير المشتريات');
    expect(notice).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('shows the private history with Arabic plural sample sizes', async () => {
    const { SubcontractorPerformanceView } = await import('./subcontractor-performance');
    const { history, mechanical } = await import('./performance.fixtures');
    for (const [size, phrase] of [
      [1, 'مشروع مكتمل واحد'],
      [2, 'مشروعان مكتملان'],
      [3, '3 مشاريع مكتملة'],
      [11, '11 مشروعًا مكتملًا'],
    ] as const) {
      TestBed.resetTestingModule();
      const http = configure();
      const view = TestBed.createComponent(SubcontractorPerformanceView);
      view.componentRef.setInput('subcontractorId', 's1');
      view.detectChanges();
      http.expectOne('/api/v1/performance/subcontractors/s1').flush(history([mechanical(size)]));
      view.detectChanges();
      const shown = text(view.nativeElement as HTMLElement);
      expect(shown).toContain(phrase);
      expect(shown).toContain('أداء المشاريع');
      expect(shown).not.toMatch(/completed project|Project performance/);
    }
  });
});
