import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';
import type { ApprovalMatrixRead as MatrixRead } from './decision.api';

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

/** The active rules and the default route as `GET /api/v1/approval-rules/read` returns them (inactive rules are never sent). */
function readMatrix(): MatrixRead {
  return {
    rules: [
      {
        name: 'Up to 5M',
        priority: 10,
        currency: 'QAR',
        minimumValue: '0.00',
        maximumValue: '5000000.00',
        projectId: null,
        category: null,
        requiredApprovals: 2,
        stepRoles: ['ApproverDirector', null],
        allowSelfApproval: false,
      },
      {
        name: 'Fit-out above 5M',
        priority: 20,
        currency: 'QAR',
        minimumValue: '5000000.00',
        maximumValue: null,
        projectId: null,
        category: 'Fit-out',
        requiredApprovals: 1,
        stepRoles: ['CompanyAdmin'],
        allowSelfApproval: true,
      },
    ],
    defaultRoute: {
      name: 'default',
      priority: 0,
      currency: null,
      minimumValue: null,
      maximumValue: null,
      projectId: null,
      category: null,
      requiredApprovals: 1,
      stepRoles: ['ApproverDirector'],
      allowSelfApproval: false,
    },
  };
}

const text = (element: Element) =>
  (element.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

describe('Approval routes in Arabic (CF-136)', () => {
  it('reads the rules and the default route in Arabic, amounts left-to-right in Latin digits, with no edit control', async () => {
    const { ApprovalMatrixRead } = await import('./approval-matrix-read');
    const { SessionService } = await import('../../core/auth/session.service');
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
      roles: ['ApproverDirector'],
      permissions: ['Decision.View', 'Award.Approve'],
    });
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(ApprovalMatrixRead);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules/read').flush(readMatrix());
    page.detectChanges();
    http.verify();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    for (const phrase of [
      'مسارات الاعتماد',
      'القواعد النشطة',
      'المسار الافتراضي',
      'دون اعتماد مستقل',
      'أي معتمد',
      'المعتمِد / المدير',
      '(يجوز لمقدّم القرار اعتماده)',
    ])
      expect(shown).toContain(phrase);
    const items = [...element.querySelectorAll('.matrix-read-list li')];
    expect(items.map((item) => text(item.querySelector('strong')!).trim())).toEqual([
      'Up to 5M',
      'Fit-out above 5M',
    ]);
    expect(text(items[0])).toContain('من QAR 0.00 حتى QAR 5,000,000.00');
    expect(text(items[1])).toContain('مسؤول الشركة');
    // Only the company's own rule names, codes and amounts are Latin; no English copy.
    expect(shown).not.toMatch(
      /Approval routes|Active rules|Default route|any approver|Approver \/ Director|up to|Without independent/,
    );
    expect(shown).not.toMatch(/[٠-٩]/);
    expect(element.querySelectorAll('button, input, select, textarea, form')).toHaveLength(0);
  });

  it('says in Arabic which rule applies to the decision (CF-136 AC6)', async () => {
    const { ApprovalMatrixRead } = await import('./approval-matrix-read');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ rule: 'Up to 5M' }) } },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(ApprovalMatrixRead);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules/read').flush(readMatrix());
    page.detectChanges();
    const marked = [
      ...(page.nativeElement as HTMLElement).querySelectorAll('[aria-current="true"]'),
    ];
    expect(marked).toHaveLength(1);
    expect(text(marked[0])).toContain('تنطبق على هذا القرار');
    expect(text(marked[0])).not.toContain('Applies to this decision');
  });
});
