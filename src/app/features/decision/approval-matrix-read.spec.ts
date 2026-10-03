import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { ApprovalMatrixRead } from './approval-matrix-read';
import { ApprovalMatrixRead as MatrixRead } from './decision.api';

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

function render(matrix: MatrixRead, roles: readonly string[], permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles, permissions });
  const http = TestBed.inject(HttpTestingController);
  const page = TestBed.createComponent(ApprovalMatrixRead);
  page.detectChanges();
  http.expectOne('/api/v1/approval-rules/read').flush(matrix);
  page.detectChanges();
  http.verify();
  return page.nativeElement as HTMLElement;
}

/** CF-136 AC5: approvers and submitters read the routes that govern their work, exactly as the API sends them, and can change nothing. */
describe('Approval routes for approvers (CF-136)', () => {
  it.each([
    ['ApproverDirector', 'Award.Approve'],
    ['ProcurementManager', 'Decision.Submit'],
  ])('shows a %s every active rule in priority order and the default route', (role, permission) => {
    const element = render(readMatrix(), [role], ['Decision.View', permission]);
    expect(text(element.querySelector('h1')!)).toContain('Approval routes');
    const items = [...element.querySelectorAll('.matrix-read-list li')];
    expect(items.map((item) => text(item.querySelector('strong')!).trim())).toEqual([
      'Up to 5M',
      'Fit-out above 5M',
    ]);
    expect(text(items[0])).toContain('QAR 0.00 up to QAR 5,000,000.00');
    expect(text(items[0])).toContain('1. Approver / Director → 2. any approver');
    expect(text(items[0])).not.toContain('Without independent approval');
    expect(text(items[1])).toContain('from QAR 5,000,000.00 · Fit-out');
    expect(text(items[1])).toContain('1. Company Admin (the submitter may approve)');
    expect(text(items[1])).toContain('Without independent approval');
    const defaultRoute = element.querySelector('[aria-labelledby="matrix-read-default"]')!;
    expect(text(defaultRoute)).toContain('Default route');
    expect(text(defaultRoute)).toContain('1. Approver / Director');
  });

  it('offers no control that changes the matrix and no way into the edit page', () => {
    const element = render(readMatrix(), ['ApproverDirector'], ['Decision.View', 'Award.Approve']);
    expect(element.querySelectorAll('button, input, select, textarea, form')).toHaveLength(0);
    const hrefs = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs.some((href) => /\/approval-matrix(?!\/read)/.test(href ?? ''))).toBe(false);
    expect(text(element)).not.toMatch(/\b(Edit|Delete|New rule|Add rule|Save)\b/);
  });

  it('says every decision follows the default route when no rule is active', () => {
    const element = render(
      { ...readMatrix(), rules: [] },
      ['ApproverDirector'],
      ['Decision.View', 'Award.Approve'],
    );
    expect(element.querySelectorAll('.matrix-read-list li')).toHaveLength(0);
    expect(text(element)).toContain('No rule is active: every decision follows the default route.');
    expect(text(element)).toContain('1. Approver / Director');
  });

  it('names a route that needs no approval', () => {
    const matrix = readMatrix();
    const element = render(
      {
        ...matrix,
        rules: [{ ...matrix.rules[0], requiredApprovals: 0, stepRoles: [] }],
      },
      ['ApproverDirector'],
      ['Decision.View', 'Award.Approve'],
    );
    const item = element.querySelector('.matrix-read-list li')!;
    expect(text(item)).toContain('No approval required');
    expect(text(item)).toContain('Without independent approval');
  });
});

/** CF-136 AC6: a decision's "See this rule" link opens the routes with its rule highlighted. */
describe('The rule a decision was routed by (CF-136 AC6)', () => {
  function renderFor(rule: string | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(rule ? { rule } : {}) } },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(ApprovalMatrixRead);
    page.detectChanges();
    http.expectOne('/api/v1/approval-rules/read').flush(readMatrix());
    page.detectChanges();
    return page.nativeElement as HTMLElement;
  }
  const current = (element: HTMLElement) => [...element.querySelectorAll('[aria-current="true"]')];

  it('highlights exactly the named rule, saying it applies', () => {
    const element = renderFor('Fit-out above 5M');
    const marked = current(element);
    expect(marked).toHaveLength(1);
    expect(text(marked[0].querySelector('strong')!).trim()).toBe('Fit-out above 5M');
    expect(text(marked[0])).toContain('Applies to this decision');
    expect(element.querySelectorAll('.matrix-read-matched')).toHaveLength(1);
  });

  it('highlights the default route for "default", and nothing for a rule no longer active', () => {
    const element = renderFor('default');
    const marked = current(element);
    expect(marked).toHaveLength(1);
    expect(marked[0].id).toBe('matrix-default-route');
    expect(text(marked[0])).toContain('Applies to this decision');
    TestBed.resetTestingModule();
    expect(current(renderFor('Retired rule'))).toHaveLength(0);
    TestBed.resetTestingModule();
    expect(current(renderFor(null))).toHaveLength(0);
  });
});
