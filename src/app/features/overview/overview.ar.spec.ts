import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import { of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { HealthService } from './health.service';
import { Overview } from './overview';
import arabicMessages from '../../../locale/messages.ar.json';

// A separate spec file: Angular caches a component's translated template on first render, so the
// Arabic catalogue must be loaded before Overview is ever created in this module graph.
loadTranslations(arabicMessages.translations);
afterAll(() => clearTranslations());

const health = {
  live: signal<'checking' | 'healthy' | 'unavailable'>('healthy'),
  ready: signal<'checking' | 'healthy' | 'unavailable'>('unavailable'),
  checking: signal(false),
  check: vi.fn(),
};

function render() {
  TestBed.configureTestingModule({
    imports: [Overview],
    providers: [
      { provide: HealthService, useValue: health },
      { provide: SessionService, useValue: { identity: signal(null), hasPermission: () => false } },
      { provide: EntitlementsService, useValue: { has: () => false } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
    ],
  });
  const fixture = TestBed.createComponent(Overview);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Overview in Arabic', () => {
  it('renders the representative surface without English copy', () => {
    const element = render();
    // No-break spaces keep compound terms on one line; compare them as ordinary spaces.
    const text = (element.textContent ?? '').replace(/\u00a0/g, ' ');
    for (const expected of [
      'مساحة عملك',
      'أساس لقرارات أفضل',
      'في اختيار المقاولين من الباطن.',
      'سجّل الدخول للوصول إلى مساحة عمل المشتريات الخاصة بشركتك.',
      'ابدأ بحساب شركتك',
      'يمنحك مسؤول شركتك حق الوصول من خلال دعوة آمنة.',
      'تسجيل دخول الشركة',
      // CF-100: the public page shows only the outage banner, never the service diagnostics.
      'تعذّر الوصول إلى الخدمة الآن. ',
    ])
      expect(text).toContain(expected);
    // The only Latin content left is the structural step number, rendered in Latin digits.
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(element.querySelector('.section-number bdi[dir="ltr"]')?.textContent).toBe('01');
    // The term "subcontractors" never breaks across hero lines.
    expect(element.querySelector('h1')?.textContent).toContain('المقاولين\u00a0من\u00a0الباطن');
  });
});
