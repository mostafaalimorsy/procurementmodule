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

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function configure(permissions: readonly string[]) {
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
          queryParamMap: of(convertToParamMap({})),
        },
      },
    ],
  });
  return permissions;
}

describe('Evaluation in Arabic', () => {
  it('uses the procurement glossary, Latin digits and left-to-right money and codes with no English copy', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { EvaluationCommercial } = await import('./evaluation-commercial');
    const { EvaluationPage } = await import('./evaluation-page');
    const { commercial, opening, overview } = await import('./evaluation.fixtures');
    configure([]);
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Evaluation.View', 'Evaluation.OpenBids'],
    });
    const http = TestBed.inject(HttpTestingController);

    const page = TestBed.createComponent(EvaluationPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/opening').flush(opening());
    http
      .expectOne('/api/v1/tenders/t1/evaluation')
      .flush(overview({ stage: 'NotOpened', evaluation: null, bids: [] }));
    page.detectChanges();
    const pageText = text(page.nativeElement as HTMLElement);
    expect(pageText).toContain('العطاءات المقدّمة مختومة');
    expect(pageText).toContain('فتح العطاءات للتقييم');
    expect(pageText).not.toMatch(/Submitted bids|Open bids|sealed/);
    const reference = (page.nativeElement as HTMLElement).querySelector('.prj-eyebrow bdi');
    expect(reference?.getAttribute('dir')).toBe('ltr');

    const leveling = TestBed.createComponent(EvaluationCommercial);
    leveling.componentRef.setInput('tenderId', 't1');
    leveling.detectChanges();
    const base = commercial();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush({
      ...base,
      // Arabic counts take their plural form: 1 day, 6 months (few), 60 days (many).
      bids: [
        { ...base.bids[0], warrantyMonths: 6, durationDays: 1 },
        { ...base.bids[1], warrantyMonths: 12 },
      ],
    });
    leveling.detectChanges();
    const grid = (leveling.nativeElement as HTMLElement).querySelector('.ev-grid') as HTMLElement;
    const gridText = text(grid);
    expect(gridText).toContain('القيمة بعد التسوية');
    expect(gridText).toContain('مقارنةً بالوسيط');
    expect(gridText).toContain('غير مقدَّم');
    expect(gridText).not.toMatch(/Leveled total|vs median|Not provided/);
    // Money stays in Latin digits, grouped, and isolated left-to-right inside the Arabic layout.
    const amounts = [...grid.querySelectorAll('td.ev-num bdi[dir="ltr"]')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(amounts).toContain('2,000,000.00');
    expect(gridText).not.toMatch(/[٠-٩]/);
    expect(gridText).toContain('6 أشهر');
    expect(gridText).toContain('12 شهرًا');
    expect(gridText).toContain('يوم واحد');
    expect(gridText).toContain('60 يومًا');
    // The flag explains itself in Arabic with its numbers.
    expect(gridText).toContain('أعلى من الوسيط');
  });

  it('shows the estimate block, not-comparable note and valid-until in Arabic (red-team B7, G050)', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { EvaluationCommercial } = await import('./evaluation-commercial');
    const { commercial } = await import('./evaluation.fixtures');
    configure([]);
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Evaluation.View'],
    });
    const http = TestBed.inject(HttpTestingController);
    const leveling = TestBed.createComponent(EvaluationCommercial);
    leveling.componentRef.setInput('tenderId', 't1');
    leveling.detectChanges();
    const base = commercial();
    http.expectOne('/api/v1/tenders/t1/evaluation/commercial').flush({
      ...base,
      estimate: '500000.00',
      estimateCurrency: 'USD',
      estimateAtPublication: '450000.00',
      estimateChangedAfterPublication: true,
      estimateComparable: false,
      estimateNotComparableReason: 'currency',
      timeZoneId: 'Asia/Riyadh',
      bids: base.bids.map((bid) => ({
        ...bid,
        validUntilUtc: '2026-12-30T09:00:00Z',
        validityBasis: 'SubmissionDeadline',
        validityState: 'Lapsed' as const,
      })),
    });
    leveling.detectChanges();
    const element = leveling.nativeElement as HTMLElement;
    const block = text(element.querySelector('[data-testid="leveling-estimate"]') as HTMLElement);
    expect(block).toContain('تقدير حزمة العمل');
    expect(block).toContain('عند النشر:');
    expect(block).toContain('غير قابل للمقارنة: التقدير بعملة USD والعروض بعملة QAR');
    expect(block).not.toMatch(/Package estimate|At publication|Not comparable/);
    const grid = text(element.querySelector('.ev-grid') as HTMLElement);
    expect(grid).toContain('يومًا، حتى');
    expect(grid).toContain('\u2066Asia/Riyadh\u2069');
    expect(grid).not.toMatch(/days, until|Lapsed/);
    expect(grid).not.toMatch(/[٠-٩]/);
  });

  it('warns in Arabic plural forms how many invited firms have not submitted before an early close', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { EntitlementsService } = await import('../../core/auth/entitlements.service');
    const { TenderControl } = await import('../tendering/tender-control');
    const { published } = await import('../tendering/tendering.fixtures');
    configure([]);
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Tenders.View', 'Tenders.CloseEarly'],
    });
    void TestBed.inject(EntitlementsService);
    const http = TestBed.inject(HttpTestingController);
    for (const [notSubmitted, expected] of [
      [1, 'شركة مدعوة واحدة لم تقدّم عطاءً'],
      [2, 'شركتان مدعوتان لم تقدّما عطاءً'],
      [3, '3 شركات مدعوة لم تقدّم عطاءً'],
      [11, '11 شركة مدعوة لم تقدّم عطاءً'],
    ] as const) {
      const control = TestBed.createComponent(TenderControl);
      control.componentRef.setInput(
        'tender',
        published({ closureCounts: { invited: notSubmitted + 1, submitted: 1, notSubmitted } }),
      );
      control.detectChanges();
      // Only the receipts matter here; the addenda and clarification sections may keep loading.
      http
        .match((request) => request.url.endsWith('/bids'))
        .forEach((request) =>
          request.flush({
            invited: 0,
            inProgress: 0,
            submitted: 0,
            contentSealed: true,
            receipts: [],
          }),
        );
      const element = control.nativeElement as HTMLElement;
      const start = [...element.querySelectorAll('button')].find((candidate) =>
        text(candidate).includes('إغلاق المناقصة مبكرًا'),
      );
      expect(start).toBeDefined();
      start!.click();
      control.detectChanges();
      const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
      expect(text(dialog)).toContain(expected);
      expect(text(dialog)).not.toMatch(/invited firm|Close this tender/);
      control.destroy();
    }
  });
});
