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

// A separate spec file: the translated template is cached on first render, so the Arabic catalogue must be loaded before the
// components are created in this module graph.
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

function configure() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'ar' },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('Subcontractor intelligence in Arabic', () => {
  it('says every metric in Arabic while rates, percentages and references stay left-to-right in Latin digits', async () => {
    const { SubcontractorIntelligenceView } = await import('./subcontractor-intelligence');
    const { fullProfile } = await import('./intelligence.fixtures');
    const http = configure();
    const view = TestBed.createComponent(SubcontractorIntelligenceView);
    view.componentRef.setInput('subcontractorId', 's1');
    view.detectChanges();
    http
      .expectOne((candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1')
      .flush(fullProfile());
    view.detectChanges();
    // CF-026: the profile then reads its busiest category.
    for (const next of http.match(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    ))
      next.flush(fullProfile());
    view.detectChanges();
    await view.whenStable();
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const shown = text(element);
    for (const phrase of [
      'تحليلات المقاول من الباطن',
      'موثوقية الاستجابة',
      'نسبة الترسية',
      'موقع السعر',
      'أدلة محدودة',
      'أداء التنفيذ',
      'الأوامر التغييرية',
      'المطالبات',
      'النزاعات',
      'الصحة والسلامة والبيئة (مقياس داخلي من 1 إلى 5)',
      'عيّنة صغيرة',
    ])
      expect(shown).toContain(phrase);
    for (const english of [
      'Response reliability',
      'Award rate',
      'Limited evidence',
      'Delivery performance',
      'valid invitations',
      'Similar',
    ])
      expect(shown).not.toContain(english);
    // Numbers and references: Latin digits, isolated left-to-right.
    const isolated = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(isolated).toContain('50.0 %');
    expect(isolated).toContain('−4.76 %');
    expect(isolated).toContain('TND-2026-0001');
    expect(shown).not.toMatch(/[٠-٩]/);
  });
});

describe('My work in Arabic (CF-010)', () => {
  it('keys each award of a tender apart and names declined and withdrawn awards in Arabic (red-team G077)', async () => {
    const { SubcontractorIntelligenceView } = await import('./subcontractor-intelligence');
    const { fullProfile } = await import('./intelligence.fixtures');
    const base = fullProfile();
    const row = base.awards.items[0];
    const profile = {
      ...base,
      awards: {
        ...base.awards,
        awardsDeclined: 1,
        awardsWithdrawn: 1,
        items: [
          { ...row, awardId: 'aw1', awardState: 'Declined' },
          { ...row, awardId: 'aw2', awardState: 'Accepted', disposition: 'Reject' },
          { ...row, tenderId: 't9', awardId: 'aw9', awardState: 'Withdrawn' },
        ],
      },
    };
    const http = configure();
    const view = TestBed.createComponent(SubcontractorIntelligenceView);
    view.componentRef.setInput('subcontractorId', 's1');
    view.detectChanges();
    for (const request of http.match(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    ))
      request.flush(profile);
    view.detectChanges();
    for (const next of http.match(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    ))
      next.flush(profile);
    view.detectChanges();
    await view.whenStable();
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const chips = [
      ...element.querySelectorAll('section[aria-labelledby="intel-awards"] li .prj-chip'),
    ].map((chip) => text(chip).trim());
    expect(chips).toEqual(['ترسية مرفوضة', 'لم يُختر', 'ترسية مسحوبة']);
    expect(text(element)).toContain('ترسيات رفضتها الشركة: 1 · ترسيات مسحوبة: 1');
    expect(text(element)).not.toMatch(/Award declined|Award withdrawn|awards declined/);
  });

  it('names the overdue round and the due date in Arabic', async () => {
    const { MyWorkPanel } = await import('./my-work');
    const { BusinessFormat } = await import('../../core/localization/business-format');
    const http = configure();
    const panel = TestBed.createComponent(MyWorkPanel);
    panel.detectChanges();
    const base = {
      recordId: 'r2',
      tenderId: 't5',
      reference: 'TND-2026-0005',
      title: null,
      sinceUtc: '2026-09-29T10:00:00Z',
      reason: null,
    };
    const due = '2026-10-04T10:00:00Z';
    http.expectOne('/api/v1/dashboard/my-work').flush({
      generatedAtUtc: '2026-10-01T10:00:00Z',
      items: [
        { ...base, kind: 'round.past_deadline', step: 2, dueAtUtc: '2026-09-29T10:00:00Z' },
        { ...base, kind: 'evaluation.leveling', recordId: 'l1', step: null, dueAtUtc: due },
        { ...base, kind: 'evaluation.leveling', recordId: 'l2', step: null },
      ],
      total: 3,
      kinds: {},
    });
    panel.detectChanges();
    const element = panel.nativeElement as HTMLElement;
    const rows = [...element.querySelectorAll('.my-work-list li')];
    expect(rows.length).toBe(3);
    const link = rows[0].querySelector('a')!;
    expect(text(link).trim()).toBe('جولة التفاوض 2 تجاوزت موعدها — أغلقها');
    expect(link.getAttribute('href')).toBe('/tenders/t5/negotiation');
    expect(text(rows[0])).toContain('متأخر يومين');
    expect(text(rows[1])).toContain(`مستحق في ${TestBed.inject(BusinessFormat).dateTime(due)}`);
    expect(text(rows[1])).not.toContain('متأخر');
    expect(text(rows[2])).not.toContain('مستحق في');
    expect(text(rows[2])).not.toContain('متأخر');
    const shown = text(element);
    expect(shown).not.toMatch(/Negotiation round|past its deadline|Overdue|\bDue\b/);
    expect(shown).not.toMatch(/[٠-٩]/);
  });

  it('names a closed round to refresh and a reopened closeout in Arabic (B-001-5)', async () => {
    const { MyWorkPanel } = await import('./my-work');
    const http = configure();
    const panel = TestBed.createComponent(MyWorkPanel);
    panel.detectChanges();
    const base = {
      tenderId: 't7',
      reference: 'TND-2026-0007',
      title: null,
      sinceUtc: '2026-09-29T10:00:00Z',
    };
    http.expectOne('/api/v1/dashboard/my-work').flush({
      generatedAtUtc: '2026-10-01T10:00:00Z',
      items: [
        { ...base, kind: 'evaluation.refresh_required', recordId: 't7', reason: null, step: 2 },
        { ...base, kind: 'closeout.reopened', recordId: 'a5', reason: 'assigned', step: null },
      ],
      total: 2,
      kinds: {},
    });
    panel.detectChanges();
    const element = panel.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('.my-work-list li > a')];
    expect(links.map((link) => [text(link).trim(), link.getAttribute('href')])).toEqual([
      ['أُغلقت جولة — أدرج ردودها في التقييم', '/tenders/t7/evaluation'],
      ['أعيد فتح الإغلاق للتصحيح — صحّحه واعتمده مجددًا', '/closeouts/a5'],
    ]);
    const shown = text(element);
    expect(shown).not.toMatch(/Round closed|reopened|finalize|refresh_required/);
    expect(shown).not.toMatch(/[٠-٩]/);
  });
});

describe('Dashboard, search and audit in Arabic', () => {
  it('names attention, evidence and audit areas in Arabic', async () => {
    const { DashboardView } = await import('./dashboard');
    const { adminDashboard } = await import('./intelligence.fixtures');
    const http = configure();
    const dashboard = TestBed.createComponent(DashboardView);
    dashboard.detectChanges();
    http.expectOne('/api/v1/dashboard').flush(adminDashboard());
    dashboard.detectChanges();
    const shown = text(dashboard.nativeElement as HTMLElement);
    for (const phrase of [
      'شركتك اليوم',
      'ما يحتاج إلى متابعة',
      'ترسيات بلا إغلاق',
      'أين توجد أدلتك',
      'قرار بانتظار الموافقة',
    ])
      expect(shown).toContain(phrase);
    for (const english of [
      'Needs attention',
      'Where your evidence is',
      'Awards without a closeout',
    ])
      expect(shown).not.toContain(english);

    const { AuditLogPage } = await import('../audit/audit-log');
    const page = TestBed.createComponent(AuditLogPage);
    page.detectChanges();
    http.expectOne('/api/v1/admin/audit/facets').flush({ actions: [], actors: [] });
    http
      .expectOne((candidate) => candidate.url === '/api/v1/admin/audit')
      .flush({
        items: [
          {
            id: 'e1',
            occurredAtUtc: '2026-09-29T09:00:00Z',
            actorKind: 'System',
            actorName: null,
            actorAccountId: null,
            action: 'invitation.email_sent',
            area: 'Tendering',
            targetType: 'tender_invitation',
            reference: 'TND-2026-0001',
            details: [],
          },
        ],
        page: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1,
      });
    page.detectChanges();
    const audit = text(page.nativeElement as HTMLElement);
    for (const phrase of ['سجل التدقيق', 'النظام', 'المناقصات والعطاءات', 'تصدير CSV'])
      expect(audit).toContain(phrase);
    expect(audit).not.toContain('Audit log');
  });

  it('reads every emitted audit action in Arabic only, with no English or raw code (CF-100 AC1)', async () => {
    const { auditActionLabel, EMITTED_AUDIT_ACTIONS } = await import('../audit/audit-labels');
    // The two named by the finding, then every action the backend writes.
    for (const action of [
      'retrospective.confirmed',
      'invitation.email_sent',
      ...EMITTED_AUDIT_ACTIONS,
    ]) {
      const label = auditActionLabel(action);
      expect(label, action).not.toMatch(/[A-Za-z]{3,}/);
      expect(label, action).not.toContain(action);
    }
    expect(auditActionLabel('retrospective.confirmed')).toBe('أُكّدت نتيجة سابقة');
    expect(auditActionLabel('invitation.email_sent')).toBe('أُرسل بريد الدعوة');
    // An action added later reads as its object plus "event", in Arabic.
    expect(auditActionLabel('tender.future_action')).toBe('حدث المناقصة');
    expect(auditActionLabel('unknown_object.happened')).toBe('حدث مسجَّل');
  });
});
