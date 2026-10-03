import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { ApprovalMatrixPage } from './approval-matrix';
import { parsePassMark } from './decision.api';
import { matrix, recommendationPolicy } from './decision.fixtures';
import { RecommendationPolicies } from './recommendation-policies';
import { EntitlementsService } from '../../core/auth/entitlements.service';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));
const CURRENCIES = [
  { code: 'QAR', name: 'Qatari Riyal', minorUnits: 2 },
  { code: 'USD', name: 'US Dollar', minorUnits: 2 },
];

function configure() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    roles: ['CompanyAdmin'],
    permissions: ['Recommendation.ManagePolicy', 'Award.ManageApprovalMatrix'],
  });
  return TestBed.inject(HttpTestingController);
}

async function set(element: HTMLElement, selector: string, value: string) {
  const field = element.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
  await settle();
}

describe('Recommendation policies', () => {
  it('reads a technical pass mark with at most one decimal', () => {
    expect(parsePassMark('60')).toBe(60);
    expect(parsePassMark('72.5')).toBe(72.5);
    expect(parsePassMark('72.55')).toBeNull();
    expect(parsePassMark('100.1')).toBeNull();
  });

  it('offers the partial history rule with a disclosed neutral value when past performance is weighed', async () => {
    // CF-021 (ADR-127).
    const http = configure();
    const page = TestBed.createComponent(RecommendationPolicies);
    page.detectChanges();
    http.expectOne('/api/v1/recommendation-policies').flush([]);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'New policy')!.click();
    page.detectChanges();
    await settle();
    await set(element, '#rp-name', 'With history');
    button(element, 'Add criterion')!.click();
    button(element, 'Add criterion')!.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    await set(element, '#rp-kind-1', 'PastPerformance');
    await set(element, '#rp-weight-0', '80');
    await set(element, '#rp-weight-1', '20');
    page.detectChanges();
    await settle();
    page.detectChanges();
    expect(text(element)).toContain('How past performance applies');
    const partial = element.querySelector<HTMLInputElement>(
      'input[name="historyRule"][value="Partial"]',
    )!;
    partial.checked = true;
    partial.dispatchEvent(new Event('change'));
    page.detectChanges();
    await settle();
    page.detectChanges();
    await set(element, '#rp-neutral', '55.55');
    button(element, 'Save')!.click();
    page.detectChanges();
    expect(text(element)).toContain(
      'neutral history value is a number from 0 to 100 with at most one decimal',
    );
    await set(element, '#rp-neutral', '55');
    page.detectChanges();
    button(element, 'Save')!.click();
    const request = http.expectOne('/api/v1/recommendation-policies');
    expect(request.request.body).toEqual(
      expect.objectContaining({ historyRule: 'Partial', neutralHistoryScore: 55 }),
    );
  });

  it('uses each criterion once, totals the weights exactly and sends them as numbers', async () => {
    const http = configure();
    const page = TestBed.createComponent(RecommendationPolicies);
    page.detectChanges();
    http.expectOne('/api/v1/recommendation-policies').flush([]);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'New policy')!.click();
    page.detectChanges();
    await settle();
    await set(element, '#rp-name', 'Balanced award');
    button(element, 'Add criterion')!.click();
    button(element, 'Add criterion')!.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    // A kind used by another row cannot be chosen again.
    const second = element.querySelector('#rp-kind-1') as HTMLSelectElement;
    const commercial = [...second.options].find((option) => option.value === 'Commercial')!;
    expect(commercial.disabled).toBe(true);
    await set(element, '#rp-weight-0', '33.33');
    await set(element, '#rp-weight-1', '33.33');
    page.detectChanges();
    expect(text(element)).toContain('Total weight: 66.66 / 100');
    button(element, 'Save')!.click();
    page.detectChanges();
    expect(text(element)).toContain('must add up to exactly 100 (now 66.66)');
    await set(element, '#rp-weight-1', '66.67');
    await set(element, '#rp-pass', '60.5');
    page.detectChanges();
    button(element, 'Save')!.click();
    const request = http.expectOne('/api/v1/recommendation-policies');
    expect(request.request.body).toEqual({
      name: 'Balanced award',
      description: '',
      minimumTechnicalScore: 60.5,
      criteria: [
        { kind: 'Commercial', weight: 33.33 },
        { kind: 'Technical', weight: 66.67 },
      ],
      version: null,
      // CF-021 (ADR-127): the all-or-nothing rule unless the partial one is chosen.
      historyRule: 'AllOrNothing',
      neutralHistoryScore: null,
    });
    request.flush(recommendationPolicy());
    http.expectOne('/api/v1/recommendation-policies').flush([]);
  });

  it('offers past performance only when the plan includes it and flags a policy that needs review (CF-128)', async () => {
    const http = configure();
    TestBed.inject(EntitlementsService).load().subscribe();
    http
      .expectOne('/api/v1/company/features')
      .flush({ features: ['tendering', 'evaluation', 'award'] });
    const page = TestBed.createComponent(RecommendationPolicies);
    page.detectChanges();
    http.expectOne('/api/v1/recommendation-policies').flush([
      {
        id: 'p1',
        name: 'With history',
        description: null,
        status: 'Active',
        currentVersionNumber: 1,
        criteriaCount: 3,
        currentVersionLocked: true,
        weighsHistory: true,
        updatedAtUtc: '2026-10-01T09:00:00Z',
        version: 'v1',
        historyNotInPlan: true,
      },
    ]);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('needs review: past performance is not in your plan');
    button(element, 'New policy')!.click();
    page.detectChanges();
    await settle();
    button(element, 'Add criterion')!.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    const kind = element.querySelector('#rp-kind-0') as HTMLSelectElement;
    expect([...kind.options].find((option) => option.value === 'PastPerformance')!.disabled).toBe(
      true,
    );
    expect(text(element)).toContain(
      'Past performance is not in your plan, so a policy cannot weigh it.',
    );
  });

  it('says a used version is locked and that saving creates the next one', () => {
    const http = configure();
    const page = TestBed.createComponent(RecommendationPolicies);
    page.detectChanges();
    http.expectOne('/api/v1/recommendation-policies').flush([
      {
        id: 'pol1',
        name: 'Balanced award',
        description: null,
        status: 'Active',
        currentVersionNumber: 1,
        criteriaCount: 2,
        currentVersionLocked: true,
        weighsHistory: false,
        updatedAtUtc: '2026-10-01T09:00:00Z',
        version: 'pver1',
      },
    ]);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'Balanced award')!.click();
    http.expectOne('/api/v1/recommendation-policies/pol1').flush(recommendationPolicy());
    page.detectChanges();
    expect(text(element)).toContain('used by a recommendation (locked)');
    button(element, 'Edit')!.click();
    page.detectChanges();
    expect(text(element)).toContain('Saving creates version 2');
  });
});

describe('Recommendation policies for a reader (CF-133 AC3)', () => {
  it.each([['QuantitySurveyor'], ['ApproverDirector']])(
    'a %s with Decision.View reads a policy with no New, Edit, Activate or Make inactive control',
    (role) => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      (
        TestBed.inject(SessionService) as unknown as {
          currentIdentity: { set: (value: unknown) => void };
        }
      ).currentIdentity.set({
        userId: 'u1',
        tenantId: 't',
        roles: [role],
        permissions: ['Decision.View'],
      });
      const http = TestBed.inject(HttpTestingController);
      const page = TestBed.createComponent(RecommendationPolicies);
      page.detectChanges();
      http.expectOne('/api/v1/recommendation-policies').flush([
        {
          id: 'pol1',
          name: 'Balanced award',
          description: null,
          status: 'Active',
          currentVersionNumber: 1,
          criteriaCount: 2,
          currentVersionLocked: true,
          weighsHistory: false,
          updatedAtUtc: '2026-10-01T09:00:00Z',
          version: 'pver1',
        },
      ]);
      page.detectChanges();
      const element = page.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="policy-read-only"]')).not.toBeNull();
      expect(text(element)).toContain(
        'You can read these policies. A Procurement Manager or Company Admin changes them.',
      );
      button(element, 'Balanced award')!.click();
      http.expectOne('/api/v1/recommendation-policies/pol1').flush(recommendationPolicy());
      page.detectChanges();
      http.verify();
      // The policy itself is readable: its criteria, weights and lock state.
      expect(text(element)).toContain('used by a recommendation (locked)');
      const labels = [...element.querySelectorAll('button')].map((each) => text(each).trim());
      for (const control of ['New policy', 'Edit', 'Activate', 'Make inactive'])
        expect(labels).not.toContain(control);
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('input, select, textarea')).toBeNull();
    },
  );
});

describe('Approval matrix', () => {
  it('lists rules in the order they are checked and explains the default route', () => {
    const http = configure();
    const page = TestBed.createComponent(ApprovalMatrixPage);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules').flush(matrix());
    http
      .expectOne((request) => request.url === '/api/v1/projects')
      .flush({
        items: [],
        page: 1,
        pageSize: 100,
        totalCount: 0,
        totalPages: 0,
      });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    // Amounts are isolated left-to-right inside the sentence (the isolation marks are invisible).
    const shown = text(element).replace(/[\u2066-\u2069]/g, '');
    expect(shown).toContain(
      'When no rule matches, the default route asks for one approval by an Approver/Director',
    );
    expect(shown).toContain('Up to 5M');
    expect(shown).toContain('from 0.00 (inclusive) up to 5,000,000.00 (exclusive)');
    expect(shown).toContain('Step 1: Approver / Director');
    expect(shown).toContain('Step 2: Any approver');
    expect(shown).toContain('Any project');
  });

  it('creates a rule with one role per step and a warning for self-approval', async () => {
    const http = configure();
    const page = TestBed.createComponent(ApprovalMatrixPage);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules').flush(matrix({ rules: [] }));
    http
      .expectOne((request) => request.url === '/api/v1/projects')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne('/api/v1/company/currencies').flush(CURRENCIES);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('No approval rule yet');
    button(element, 'New rule')!.click();
    page.detectChanges();
    await settle();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    await set(dialog, '#rule-name', 'Large awards');
    page.detectChanges();
    await set(dialog, '#rule-currency', 'QAR');
    page.detectChanges();
    // Values are read with the currency's own decimals: three places are refused for QAR.
    await set(dialog, '#rule-min', '5000000.125');
    button(dialog, 'Save rule')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Enter values as plain digits');
    await set(dialog, '#rule-min', '5000000');
    const approvals = dialog.querySelector('#rule-approvals') as HTMLSelectElement;
    approvals.value = approvals.options[2].value;
    approvals.dispatchEvent(new Event('change'));
    page.detectChanges();
    await settle();
    page.detectChanges();
    expect(dialog.querySelectorAll('[id^="rule-step-"]').length).toBe(2);
    await set(dialog, '#rule-step-0', 'ApproverDirector');
    (dialog.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click();
    page.detectChanges();
    expect(text(dialog)).toContain('Self-approval removes the independent check');
    // ADR-084: without an explicit confirmation and a reason the rule is not sent.
    button(dialog, 'Save rule')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('needs your confirmation and the reason');
    http.expectNone('/api/v1/approval-rules');
    (dialog.querySelectorAll('input[type="checkbox"]')[2] as HTMLInputElement).click();
    await set(dialog, '#rule-weakening-reason', 'Framework call-offs');
    page.detectChanges();
    button(dialog, 'Save rule')!.click();
    const request = http.expectOne('/api/v1/approval-rules');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Large awards',
      priority: 10,
      active: true,
      currency: 'QAR',
      minimumValue: '5000000',
      maximumValue: null,
      projectId: null,
      category: null,
      requiredApprovals: 2,
      stepRoles: ['ApproverDirector', null],
      allowSelfApproval: true,
      weakeningConfirmed: true,
      weakeningReason: 'Framework call-offs',
    });
    request.flush(matrix());
  });

  it('edits a rule with its version, keeping the other steps', async () => {
    const http = configure();
    const page = TestBed.createComponent(ApprovalMatrixPage);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules').flush(matrix());
    http
      .expectOne((request) => request.url === '/api/v1/projects')
      .flush({
        items: [{ id: 'pr1', code: 'TWR-1', name: 'Tower One' }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1,
      });
    http.expectOne('/api/v1/company/currencies').flush(CURRENCIES);
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    button(element, 'Edit')!.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('Edit approval rule');
    expect((dialog.querySelector('#rule-name') as HTMLInputElement).value).toBe('Up to 5M');
    expect((dialog.querySelector('#rule-currency') as HTMLSelectElement).value).toBe('QAR');
    await set(dialog, '#rule-project', 'pr1');
    await set(dialog, '#rule-max', '4000000.00');
    button(dialog, 'Save rule')!.click();
    const request = http.expectOne('/api/v1/approval-rules/rule1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      name: 'Up to 5M',
      priority: 10,
      active: true,
      currency: 'QAR',
      minimumValue: '0',
      maximumValue: '4000000',
      projectId: 'pr1',
      category: null,
      requiredApprovals: 2,
      stepRoles: ['ApproverDirector', null],
      allowSelfApproval: false,
      weakeningConfirmed: false,
      weakeningReason: null,
      version: 'ruv1',
    });
    request.flush(matrix());
    page.detectChanges();
    expect(text(element)).toContain('Approval rule saved');
  });
});

describe('The exact recommendation policy version used (CF-133 AC5)', () => {
  it('opens the policy at the version a recommendation used, not the current one', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ policy: 'pol1', version: '1' }) },
          },
        },
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
      permissions: ['Decision.View'],
    });
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(RecommendationPolicies);
    page.detectChanges();
    http.expectOne('/api/v1/recommendation-policies').flush([]);
    const first = recommendationPolicy();
    const current = {
      ...first.current,
      id: 'pv2',
      number: 2,
      minimumTechnicalScore: 70,
      criteria: [{ id: 'c9', position: 1, kind: 'Commercial' as const, weight: 100 }],
    };
    http.expectOne('/api/v1/recommendation-policies/pol1').flush(
      recommendationPolicy({
        currentVersionNumber: 2,
        current,
        versions: [first.current, current],
      }),
    );
    page.detectChanges();
    await settle();
    const used = (page.nativeElement as HTMLElement).querySelector(
      '[data-testid="policy-used-version"]',
    ) as HTMLElement;
    expect(text(used)).toContain('Version 1 — used by this recommendation');
    expect(text(used)).toContain('technical pass mark 60 / 100');
    expect(text(used)).toContain('60%');
    expect(text(used)).toContain('40%');
    expect(text(used)).not.toContain('100%');
  });
});
