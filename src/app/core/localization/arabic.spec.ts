import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';
import { SessionService } from '../auth/session.service';

// Label catalogues are evaluated when their module loads, exactly as the inlined build does, so the
// Arabic catalogue is loaded first and every module under test is imported afterwards.
loadTranslations(arabicMessages.translations);
// The /ar/ build registers Arabic locale data automatically; plural categories come from it.
registerLocaleData(localeAr);
afterAll(() => clearTranslations());

describe('Arabic runtime catalogue', () => {
  it('explains known problem codes in Arabic with localized parameters', async () => {
    const { knownProductProblem } = await import('./product-problem');
    const lifecycle = knownProductProblem({
      code: 'project.transition_not_allowed',
      parameters: { from: 'Draft', to: 'Completed' },
    });
    expect(lifecycle).toContain('«مسودة»');
    expect(lifecycle).toContain('«مكتمل»');
    const quota = knownProductProblem({
      code: 'quota.exceeded',
      parameters: { quota: 'max_users', limit: '5' },
    });
    expect(quota).toContain('مقاعد');
    expect(quota).toContain('5');
    expect(quota).not.toMatch(/[A-Za-z]/);
  });

  it('names the roles of the permission matrix in Arabic, joined with «أو» (S-ROLES)', async () => {
    const { roleList } = await import('./labels');
    expect(roleList(['CompanyAdmin', 'ProcurementManager'], 'ar')).toBe(
      'مسؤول الشركة أو مدير المشتريات',
    );
  });

  it('never shows an English server detail in the Arabic build', async () => {
    const { HttpErrorResponse } = await import('@angular/common/http');
    const { problemMessage } = await import('./product-problem');
    const previous = $localize.locale;
    $localize.locale = 'ar';
    try {
      const message = problemMessage(
        new HttpErrorResponse({ status: 409, error: { detail: 'Reviewed English detail.' } }),
      );
      expect(message).not.toContain('Reviewed');
      expect(message).toMatch(/[؀-ۿ]/);
    } finally {
      $localize.locale = previous;
    }
  });

  it.each([
    [0, 'لا توجد حسابات'],
    [1, 'حساب واحد'],
    [2, 'حسابان'],
    [3, '3 حسابات'],
    [11, '11 حسابًا'],
    [100, '100 حساب'],
  ])('uses the Arabic plural form for %i accounts', async (count, expected) => {
    const { UsersAdmin } = await import('../../features/identity/users-admin');
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOCALE_ID, useValue: 'ar' },
        { provide: SessionService, useValue: { identity: () => null, hasPermission: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const users = Array.from({ length: count }, (_, index) => ({
      id: `u${index}`,
      email: `u${index}@example.com`,
      displayName: `User ${index}`,
      role: 'ProjectManager',
      status: 'Active',
      passwordResetRequired: false,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
    }));
    http.expectOne('/api/v1/admin/users').flush(users);
    http.expectOne('/api/v1/company/plan').flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    const counter = (fixture.nativeElement as HTMLElement).querySelector('.count');
    expect(counter?.textContent?.trim()).toBe(expected);
  });
});
