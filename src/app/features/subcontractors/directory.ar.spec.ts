import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';

// A separate spec file: the translated template is cached on first render, so the Arabic catalogue
// must be loaded before the component is ever created in this module graph.
loadTranslations(arabicMessages.translations);
const localize = $localize as { locale?: string };
const previousLocale = localize.locale;
localize.locale = 'ar';
afterAll(() => {
  clearTranslations();
  localize.locale = previousLocale;
});

describe('Subcontractor detail in Arabic', () => {
  it('uses the directory glossary, keeps identifiers left-to-right and shows no English copy', async () => {
    // Imported after the catalogue is loaded, so module-level label catalogues are built in Arabic.
    const { SessionService } = await import('../../core/auth/session.service');
    const { SubcontractorDetailPage } = await import('./subcontractor-detail');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' } } } },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['Subcontractors.View', 'Subcontractors.ChangeStatus', 'Subcontractors.Block'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubcontractorDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1').flush({
      id: 's1',
      code: 'ACME-01',
      legalName: 'شركة أكمي للمقاولات',
      tradingName: null,
      commercialRegistrationNumber: 'CR12345',
      taxRegistrationNumber: '300123456700003',
      countryCode: 'EG',
      city: 'القاهرة',
      status: 'Blocked',
      statusReason: 'مخالفة سلامة',
      notes: null,
      imported: true,
      trades: [{ id: 't1', code: 'HVAC', name: 'تكييف', isActive: false }],
      contacts: [
        {
          id: 'c1',
          name: 'نادية فؤاد',
          jobTitle: null,
          email: 'nadia@acme.example',
          phone: '+20 100',
          isPrimary: true,
        },
      ],
      allowedNextStatuses: ['Inactive'],
      createdAtUtc: '2026-09-01T00:00:00Z',
      updatedAtUtc: '2026-09-02T00:00:00Z',
      createdBy: 'u1',
      updatedBy: 'u1',
      version: 'v1',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = (element.textContent ?? '').replace(/ /g, ' ');
    for (const expected of [
      'محظور',
      'سبب الحظر',
      'رفع الحظر',
      'الاسم القانوني',
      'رقم السجل التجاري',
      'رقم التسجيل الضريبي',
      'جهة الاتصال الرئيسية',
      'التخصصات',
      '(موقوف)',
      'أُضيف عبر استيراد إلى الدليل.',
      'القاهرة، مصر',
    ])
      expect(text).toContain(expected);
    for (const english of [
      'Blocked',
      'Legal name',
      'Primary contact',
      'Contacts',
      'Lift block',
      'retired',
    ])
      expect(text).not.toContain(english);
    const identifiers = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      node.textContent?.trim(),
    );
    for (const identifier of [
      'ACME-01',
      'CR12345',
      '300123456700003',
      'nadia@acme.example',
      '+20 100',
      'HVAC',
    ])
      expect(identifiers).toContain(identifier);
    // Gregorian date with Latin digits, even in Arabic.
    expect(text).toMatch(/2026/);
  });

  it('explains an import preview in Arabic with file columns and codes kept left-to-right', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { SubcontractorImportPage } = await import('./subcontractor-import');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['Subcontractors.View', 'Subcontractors.Import'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('#import-file')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['code,legal_name\nA-1,x'], 'd.csv')],
    });
    input.dispatchEvent(new Event('change'));
    fixture.componentInstance.validRows = false;
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    http.expectOne('/api/v1/subcontractors/import/preview').flush({
      sha256: 'a'.repeat(64),
      format: 'Csv',
      counts: { rows: 2, create: 1, unchanged: 0, differs: 0, errors: 1, warnings: 0 },
      capacity: { usage: 3, limit: 10, required: 1, sufficient: true },
      fileIssues: [],
      rows: [
        {
          row: 2,
          code: 'NEW-1',
          legalName: 'شركة جديدة',
          outcome: 'Create',
          differingFields: [],
          issues: [],
        },
        {
          row: 4,
          code: 'SAME-1',
          legalName: 'شركة قائمة',
          outcome: 'Differs',
          differingFields: ['city', 'trades'],
          issues: [
            {
              severity: 'Warning',
              code: 'import.existing_trade_ignored',
              column: 'trades',
              parameters: { trade: 'NOPE', state: 'unknown' },
            },
          ],
        },
        {
          row: 3,
          code: 'BAD-1',
          legalName: 'شركة',
          outcome: 'Error',
          differingFields: [],
          issues: [
            {
              severity: 'Error',
              code: 'import.trade_retired',
              column: 'trades',
              parameters: { trade: 'OLD' },
            },
          ],
        },
      ],
      canConfirm: false,
    });
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.imp-filter')!.click();
    fixture.detectChanges();
    const page = (element.textContent ?? '').replace(/\s+/g, ' ');
    for (const expected of [
      'استيراد المقاولين من الباطن',
      'المراجعة قبل الاستيراد',
      'صفوف بها أخطاء',
      'الأماكن المتبقية في باقتك: 7.',
      'التخصص OLD موقوف ولا يمكن تعيينه.',
      // Field names are listed with the Arabic conjunction, not an English comma.
      'في: المدينة والتخصصات.',
      'التخصص NOPE غير موجود في هذه الشركة. سيتم تجاهله: هذا الرمز موجود بالفعل في دليلك، والاستيراد لا يغيّر المقاولين من الباطن الموجودين أبدًا.',
      'خطأ',
      'لا يمكن استيراد أي شيء ما دام في أي صف خطأ.',
    ])
      expect(page).toContain(expected);
    for (const english of [
      'Review before importing',
      'Rows with errors',
      'is retired',
      'Error',
      'is ignored',
    ])
      expect(page).not.toContain(english);
    const identifiers = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      node.textContent?.trim(),
    );
    for (const identifier of ['BAD-1', 'trades', 'code', 'legal_name'])
      expect(identifiers).toContain(identifier);
    http.verify();
  });

  it('summarises an invalid submit with the Arabic plural (CF-020)', async () => {
    const { registerLocaleData } = await import('@angular/common');
    const { default: localeAr } = await import('@angular/common/locales/ar');
    registerLocaleData(localeAr);
    const { SessionService } = await import('../../core/auth/session.service');
    const { SubcontractorForm } = await import('./subcontractor-form');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['Subcontractors.View', 'Subcontractors.Create', 'Subcontractors.Edit'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubcontractorForm);
    fixture.autoDetectChanges();
    http.expectOne('/api/v1/trades').flush([]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await (async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
    })();
    const summary = element.querySelector('.prj-error-summary')!;
    const count = summary.querySelectorAll('a').length;
    expect(count).toBeGreaterThanOrEqual(2);
    const title = summary.querySelector('.prj-error-summary-title')!.textContent!.trim();
    expect(title).toBe(count === 2 ? 'حقلان يحتاجان إلى مراجعة' : `${count} حقول تحتاج إلى مراجعة`);
    expect(title).not.toMatch(/[A-Za-z]/);
  });

  it('lists the live work in the block dialog in Arabic, with tender references left-to-right (red-team G044)', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { SubcontractorDetailPage } = await import('./subcontractor-detail');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' } } } },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['Subcontractors.View', 'Subcontractors.ChangeStatus', 'Subcontractors.Block'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubcontractorDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1').flush({
      id: 's1',
      code: 'ACME-01',
      legalName: 'شركة أكمي للمقاولات',
      tradingName: null,
      commercialRegistrationNumber: null,
      taxRegistrationNumber: null,
      countryCode: 'EG',
      city: null,
      status: 'Active',
      statusReason: null,
      notes: null,
      imported: false,
      trades: [],
      contacts: [],
      allowedNextStatuses: ['Inactive', 'Blocked'],
      createdAtUtc: '2026-09-01T00:00:00Z',
      updatedAtUtc: '2026-09-02T00:00:00Z',
      createdBy: 'u1',
      updatedBy: 'u1',
      version: 'v1',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const action = fixture.componentInstance
      .actions(fixture.componentInstance.subcontractor()!)
      .find((item) => item.to === 'Blocked')!;
    fixture.componentInstance.ask(action);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1/engagements').flush({
      invitations: [
        {
          tenderId: 't9',
          tenderReference: 'TND-2026-0009',
          tenderTitle: 'تكييف البرج',
          decisionState: null,
        },
        {
          tenderId: 't10',
          tenderReference: 'TND-2026-0010',
          tenderTitle: 'مبردات',
          decisionState: null,
        },
      ],
      decisions: [
        {
          tenderId: 't7',
          tenderReference: 'TND-2026-0007',
          tenderTitle: 'مجاري الهواء',
          decisionState: 'PendingApproval',
        },
      ],
    });
    fixture.detectChanges();
    const live = element.querySelector('[data-testid="block-live"]') as HTMLElement;
    const shown = (live.textContent ?? '').replace(/\s+/g, ' ');
    expect(shown).toContain('أعمال جارية مع هذه الشركة');
    expect(shown).toContain('دعوتان مفتوحتان');
    expect(shown).toContain('قرار معلّق واحد');
    expect(shown).toContain('أبلغ مدير المشتريات');
    expect(shown).not.toMatch(/open invitation|pending decision|Live work|Blocking does not/);
    const references = [...live.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(references).toEqual(['TND-2026-0009', 'TND-2026-0010', 'TND-2026-0007']);
  });
});
