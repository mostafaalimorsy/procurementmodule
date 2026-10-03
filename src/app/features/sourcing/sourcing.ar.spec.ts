import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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

describe('Sourcing in Arabic', () => {
  it('uses the procurement glossary, keeps identifiers left-to-right and shows no English copy', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { EntitlementsService } = await import('../../core/auth/entitlements.service');
    const { SourcingDetailPage } = await import('./sourcing-detail');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'src1' } } } },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementOfficer'],
      permissions: ['Sourcing.View', 'Sourcing.Manage', 'Sourcing.Prequalify'],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(EntitlementsService).load().subscribe();
    http
      .expectOne('/api/v1/company/features')
      .flush({ features: ['projects', 'subcontractor_directory', 'sourcing'] });
    const fixture = TestBed.createComponent(SourcingDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([]);
    http.expectOne('/api/v1/sourcing/src1').flush({
      id: 'src1',
      workPackage: {
        id: 'wp1',
        code: 'HVAC-01',
        title: 'أعمال التكييف',
        category: null,
        status: 'Active',
        projectId: 'p1',
        projectCode: 'TOWER',
        projectName: 'برج واحد',
        projectStatus: 'Active',
      },
      status: 'Open',
      lockReason: null,
      canApprove: false,
      canReopen: false,
      trades: [{ id: 't1', code: 'HVAC', name: 'تكييف', isActive: true }],
      candidates: [
        {
          id: 'c1',
          subcontractorId: 's1',
          code: 'ACME-01',
          legalName: 'شركة أكمي',
          tradingName: null,
          countryCode: 'EG',
          city: 'القاهرة',
          directoryStatus: 'Blocked',
          trades: [{ id: 't1', code: 'HVAC', name: 'تكييف', matchesSourcing: true }],
          result: 'NotQualified',
          criteria: {
            tradeFit: 'Met',
            geographicCoverage: 'Met',
            capacity: 'NotMet',
            experience: 'Met',
            compliance: 'NotAssessed',
            risk: 'Met',
            pastPerformance: 'NotAssessed',
          },
          rationale: 'لا توجد طاقة كافية هذا العام.',
          assessedAtUtc: '2026-09-21T08:00:00Z',
          assessedByName: 'نادية',
          isShortlisted: false,
          isRemoved: false,
          addedAtUtc: '2026-09-20T10:00:00Z',
          removedAtUtc: null,
        },
      ],
      currentApproval: null,
      approvals: [],
      createdAtUtc: '2026-09-20T09:00:00Z',
      updatedAtUtc: '2026-09-21T09:00:00Z',
      version: 'v1',
    });
    http
      .expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery')
      .flush({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0 });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const content = (element.textContent ?? '').replace(/\s+/g, ' ');
    for (const expected of [
      'التوريد',
      'المرشحون',
      'غير مؤهَّل',
      'التخصصات محل التوريد',
      'إضافة مرشحين من الدليل',
      'التأهيل المسبق',
      'إيقاف الدراسة',
      'محظور',
      'المبرّر',
      'أجرِ التأهيل المسبق للمرشحين',
    ])
      expect(content).toContain(expected);
    for (const english of [
      'Candidates',
      'Not qualified',
      'Prequalify',
      'Next step',
      'Stop considering',
    ])
      expect(content).not.toContain(english);
    // Identifiers keep their own direction inside the Arabic page.
    const codes = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => node.textContent);
    expect(codes).toContain('HVAC-01');
    expect(codes).toContain('ACME-01');
    http.verify();
  });
});
