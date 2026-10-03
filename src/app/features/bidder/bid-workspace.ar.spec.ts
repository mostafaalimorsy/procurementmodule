import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';

// The Arabic catalogue must be loaded before the components are created in this module graph.
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

describe('The bid workspace in Arabic', () => {
  it('reads right to left while amounts, codes and references stay left to right, with Arabic plurals and no English copy', async () => {
    const { BidWorkspace } = await import('./bid-workspace');
    const { bidView, invitationView } = await import('./bid-workspace.spec.fixtures');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    TestBed.inject(HttpTestingController);
    const deadline = new Date(Date.now() + (2 * 24 + 3) * 3_600_000 + 5 * 60_000).toISOString();
    const fixture = TestBed.createComponent(BidWorkspace);
    fixture.componentRef.setInput('token', 't');
    fixture.componentRef.setInput(
      'invitation',
      invitationView({
        submissionDeadline: { utc: deadline, local: '2099-10-15T14:00', offset: '+03:00' },
      }),
    );
    fixture.componentRef.setInput(
      'initial',
      bidView({ draft: { ...bidView().draft, totalAmount: '1250000.50' } }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain('عطاؤكم');
    expect(content).toContain('التسعير بعملة');
    expect(content).toContain('يومان');
    expect(content).toContain('3 ساعات');
    expect(content).toContain('إجمالي قيمة العطاء');
    expect(content).not.toMatch(/Your bid|Priced in|Total bid amount|Save draft|Submit bid/);
    // The amount stays a left-to-right number with Latin digits; the ISO code is not translated or mirrored.
    const total = element.querySelector('#bid-total') as HTMLInputElement;
    expect(total.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('.bw-money')?.textContent).toContain('QAR');
    expect(element.querySelector('.bw-ref bdi[dir="ltr"]')?.textContent).toBe('BID-7K4Q-M2XD');
    await fixture.whenStable();
    expect(fixture.componentInstance.form.totalAmount).toMatch(/^1.250.000\.50$/);
  });

  it('prices the schedule in Arabic: labels in Arabic, item codes, quantities, rates and amounts left to right (CF-004)', async () => {
    const { BidWorkspace } = await import('./bid-workspace');
    const { bidView, invitationView } = await import('./bid-workspace.spec.fixtures');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BidWorkspace);
    fixture.componentRef.setInput('token', 't');
    fixture.componentRef.setInput(
      'invitation',
      invitationView({
        schedule: [
          {
            key: 'A.1',
            section: null,
            description: 'توريد مجاري الهواء',
            unit: 'م2',
            quantity: '120.125',
            type: 'Measured',
            provisionalAmount: null,
          },
          {
            key: 'A.2',
            section: null,
            description: 'مبلغ احتياطي للأعمال',
            unit: null,
            quantity: null,
            type: 'ProvisionalSum',
            provisionalAmount: '25000.50',
          },
        ],
      }),
    );
    fixture.componentRef.setInput('initial', bidView());
    fixture.detectChanges();
    fixture.componentInstance.setRate('A.1', '٨٥٫٦');
    fixture.detectChanges();
    const schedule = fixture.nativeElement.querySelector('#bid-schedule') as HTMLElement;
    const content = text(schedule);
    expect(content).toContain('جدول الأسعار');
    expect(content).toContain('يحدده المشتري');
    expect(content).toContain('مبلغ احتياطي');
    expect(content).not.toMatch(/Price schedule|Fixed by the buyer|Rate|Amount/);
    // Arabic-Indic digits are read as the same exact rate; the amount is exact and stays left to right.
    expect(fixture.componentInstance.scheduleTotal()).toBe('35283.20');
    expect(schedule.querySelector('#bid-rate-0')?.getAttribute('dir')).toBe('ltr');
    expect(schedule.querySelector('.bw-code')?.getAttribute('dir')).toBe('ltr');
    expect(
      [...schedule.querySelectorAll('.bw-amount')].map((node) => node.getAttribute('dir')),
    ).toContain('ltr');
    expect(content).toContain('10,282.70');
  });
});
