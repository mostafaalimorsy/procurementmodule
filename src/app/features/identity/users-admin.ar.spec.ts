import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';

// A separate spec file: the translated template is cached on first render, so the Arabic catalogue must be loaded before the
// components are created in this module graph. CF-035 AC1 (red-team G019/D7): a member's additional roles, in Arabic.
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

const security = {
  mfaRequiredRoles: [],
  alwaysRequired: ['CompanyAdmin'],
  isDefault: true,
  version: null,
  idleTimeoutMinutes: 60,
};

async function render(permissions: (permission: string) => boolean = () => true) {
  const { UsersAdmin } = await import('./users-admin');
  const { SessionService } = await import('../../core/auth/session.service');
  TestBed.configureTestingModule({
    imports: [UsersAdmin],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LOCALE_ID, useValue: 'ar' },
      {
        provide: SessionService,
        useValue: {
          identity: () => ({ companyName: 'Delta', userId: 'u1' }),
          hasPermission: permissions,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(UsersAdmin);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  for (const request of http.match(() => true))
    request.flush(
      request.request.url === '/api/v1/company/security'
        ? security
        : request.request.url === '/api/v1/admin/users'
          ? [
              {
                id: 'u2',
                email: 'omar@delta.example',
                displayName: 'Omar Officer',
                role: 'ProcurementOfficer',
                additionalRoles: ['CommercialQs'],
                status: 'Active',
                passwordResetRequired: false,
                mfaEnrolled: true,
                createdAtUtc: '2026-09-01T00:00:00Z',
                updatedAtUtc: '2026-09-02T00:00:00Z',
              },
            ]
          : null,
    );
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const row = element.querySelector('tbody tr')!;
  const box = (label: string) =>
    [...row.querySelectorAll<HTMLLabelElement>('label.extra-role')]
      .find((item) => item.textContent!.trim() === label)!
      .querySelector('input') as HTMLInputElement;
  return { fixture, http, element, row, box };
}

describe('A member with additional roles, in Arabic (CF-035 AC1)', () => {
  it('shows both role labels in Arabic on the row of a reader who cannot change roles', async () => {
    const { row } = await render((permission) => permission !== 'Users.ChangeRole');
    expect(text(row)).toContain('مهندس / موظف مشتريات');
    expect(row.querySelector('.extra-role-chip')!.textContent!.trim()).toBe(
      '+ الشؤون التجارية / حصر الكميات',
    );
    expect(text(row)).not.toMatch(/Procurement|Commercial/);
  });

  it('edits at most three roles in total under "يحمل أيضًا" and explains a refused pairing in Arabic', async () => {
    const { fixture, http, element, row, box } = await render();
    expect(row.querySelector('legend')!.textContent!.trim()).toBe('يحمل أيضًا');
    expect(box('الشؤون التجارية / حصر الكميات').checked).toBe(true);

    box('مدير المشروع').checked = true;
    box('مدير المشروع').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const unchecked = [...row.querySelectorAll<HTMLInputElement>('label.extra-role input')].filter(
      (input) => !input.checked,
    );
    expect(unchecked.length).toBeGreaterThan(0);
    expect(unchecked.every((input) => input.disabled)).toBe(true);

    // Swap the Project Manager for a Technical Evaluator: the server refuses it beside a price-seeing role.
    box('مدير المشروع').checked = false;
    box('مدير المشروع').dispatchEvent(new Event('change'));
    box('مقيّم فني').checked = true;
    box('مقيّم فني').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    [...row.querySelectorAll('button')].find((button) => text(button).includes('حفظ'))!.click();
    const request = http.expectOne('/api/v1/admin/users/u2/role');
    expect(request.request.body).toEqual({
      role: 'ProcurementOfficer',
      additionalRoles: ['CommercialQs', 'TechnicalEvaluator'],
    });
    request.flush(
      {
        code: 'user.roles_conflict',
        parameters: { first: 'TechnicalEvaluator', second: 'CommercialQs' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    const alert = text(element.querySelector('[role="alert"]')!);
    expect(alert).toContain(
      'لا يمكن أن يجمع شخص واحد بين مقيّم فني والشؤون التجارية / حصر الكميات',
    );
    expect(alert).not.toMatch(/[A-Za-z]{3,}/);
  });
});

describe('The sign-in security card, in Arabic', () => {
  it('names both groups, the controls and Save in Arabic, and isolates the range numbers', async () => {
    const { element } = await render();
    const card = element.querySelector('[data-testid="sign-in-security"]')!;
    expect(
      [...card.querySelectorAll('fieldset > legend')].map((legend) => text(legend).trim()),
    ).toEqual(['الأدوار التي تسجّل الدخول بتطبيق مصادقة', 'مهلة الجلسة']);
    expect(text(card.querySelector('label[for="idle-minutes"]')!).trim()).toBe(
      'تسجيل الخروج بعد هذا العدد من الدقائق دون نشاط',
    );
    expect(text(card)).toContain('مطلوب دائمًا');
    // The range sits in left-to-right isolates, so it cannot be reordered inside the Arabic sentence.
    const numbers = [...card.querySelectorAll('#idle-minutes-help bdi')];
    expect(numbers.map((bdi) => [bdi.getAttribute('dir'), bdi.textContent])).toEqual([
      ['ltr', '15'],
      ['ltr', '480'],
    ]);
    expect(text(card.querySelector('#security-save')!).trim()).toBe('حفظ أمان تسجيل الدخول');
    expect(text(card)).not.toMatch(/Sign|Session|Save|Always|minutes/);
  });
});
