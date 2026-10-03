import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { featureGuard } from '../../core/auth/feature.guard';
import { SessionService } from '../../core/auth/session.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import { INTELLIGENCE_FEATURES } from '../intelligence/intelligence.api';
import { PackageBuilder } from '../platform/package-builder';
import { EntitlementCatalogue } from '../platform/platform-api.service';
import { Paged } from '../subcontractors/subcontractors.api';
import { SourcingDetailPage } from './sourcing-detail';
import { SourcingList } from './sourcing-list';
import {
  Criteria,
  DiscoveryItem,
  NOT_ASSESSED,
  SourcingCandidate,
  SourcingDetail,
  SourcingSummary,
  rationaleRequired,
  summarizeCriteria,
} from './sourcing.api';
import { WorkPackageSourcing } from './work-package-sourcing';

const MANAGER = [
  'Sourcing.View',
  'Sourcing.Manage',
  'Sourcing.Prequalify',
  'Sourcing.ApproveShortlist',
];
const OFFICER = ['Sourcing.View', 'Sourcing.Manage', 'Sourcing.Prequalify'];
const VIEWER = ['Sourcing.View'];
const FEATURES = ['projects', 'subcontractor_directory', 'sourcing'];

const ALL_MET: Criteria = {
  tradeFit: 'Met',
  geographicCoverage: 'Met',
  capacity: 'Met',
  experience: 'Met',
  compliance: 'Met',
  risk: 'Met',
  pastPerformance: 'NotAssessed',
};

function candidate(overrides: Partial<SourcingCandidate> = {}): SourcingCandidate {
  return {
    id: 'c1',
    subcontractorId: 's1',
    code: 'ACME-01',
    legalName: 'Acme Mechanical',
    tradingName: null,
    countryCode: 'EG',
    city: 'Cairo',
    directoryStatus: 'Active',
    trades: [{ id: 't1', code: 'HVAC', name: 'HVAC', matchesSourcing: true }],
    result: 'Pending',
    criteria: NOT_ASSESSED,
    rationale: null,
    assessedAtUtc: null,
    assessedByName: null,
    isShortlisted: false,
    isRemoved: false,
    addedAtUtc: '2026-09-20T10:00:00Z',
    removedAtUtc: null,
    ...overrides,
  };
}

function sourcing(overrides: Partial<SourcingDetail> = {}): SourcingDetail {
  return {
    id: 'src1',
    workPackage: {
      id: 'wp1',
      code: 'HVAC-01',
      title: 'HVAC installation',
      category: 'Mechanical',
      status: 'Active',
      projectId: 'p1',
      projectCode: 'TOWER',
      projectName: 'Tower One',
      projectStatus: 'Active',
    },
    status: 'Open',
    lockReason: null,
    canApprove: false,
    canReopen: false,
    trades: [{ id: 't1', code: 'HVAC', name: 'HVAC', isActive: true }],
    candidates: [],
    currentApproval: null,
    approvals: [],
    createdAtUtc: '2026-09-20T09:00:00Z',
    updatedAtUtc: '2026-09-21T09:00:00Z',
    version: 'v1',
    ...overrides,
  };
}

function paged<T>(items: T[]): Paged<T> {
  return {
    items,
    page: 1,
    pageSize: 10,
    totalCount: items.length,
    totalPages: items.length ? 1 : 0,
  };
}

const discovered: DiscoveryItem = {
  subcontractorId: 's2',
  code: 'BETA',
  legalName: 'Beta Cooling',
  tradingName: null,
  countryCode: null,
  city: 'Giza',
  directoryStatus: 'Active',
  trades: [{ id: 't1', code: 'HVAC', name: 'HVAC', matchesSourcing: true }],
  matchesSourcingTrades: true,
  candidateState: 'none',
};

function configure(permissions: readonly string[], features: readonly string[] = FEATURES) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'sourcing/:id', children: [] },
        { path: 'sourcing', children: [] },
        { path: '', children: [] },
      ]),
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
    roles: ['ProcurementManager'],
    permissions,
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(EntitlementsService).load().subscribe();
  http.expectOne('/api/v1/company/features').flush({ features });
  return http;
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const buttons = (element: HTMLElement) =>
  [...element.querySelectorAll('button')].map((button) => text(button).trim());

function renderDetail(permissions: readonly string[], detail: SourcingDetail) {
  const http = configure(permissions);
  const fixture = TestBed.createComponent(SourcingDetailPage);
  fixture.detectChanges();
  http.expectOne('/api/v1/trades').flush([]);
  http.expectOne('/api/v1/sourcing/src1').flush(detail);
  fixture.detectChanges();
  return { http, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('sourcing rules shared with the server', () => {
  it('requires a rationale to reject, or to qualify despite an unmet criterion', () => {
    expect(rationaleRequired('NotQualified', ALL_MET)).toBe(true);
    expect(rationaleRequired('Qualified', ALL_MET)).toBe(false);
    expect(rationaleRequired('Qualified', { ...ALL_MET, capacity: 'NotMet' })).toBe(true);
    expect(rationaleRequired('Pending', { ...ALL_MET, capacity: 'NotMet' })).toBe(false);
    expect(summarizeCriteria({ ...ALL_MET, risk: 'NotMet' })).toEqual({
      met: 5,
      notMet: 1,
      notAssessed: 1,
    });
  });

  it('explains every sourcing refusal with its parameters instead of a generic failure', () => {
    expect(
      knownProductProblem({
        code: 'sourcing.subcontractor_not_active',
        parameters: { code: 'DORM', status: 'Inactive' },
      }),
    ).toContain('is Inactive in the directory');
    expect(
      knownProductProblem({
        code: 'sourcing.rationale_required',
        parameters: { result: 'Qualified' },
      }),
    ).toContain('although a criterion is not met');
    expect(
      knownProductProblem({
        code: 'sourcing.shortlist_member_not_active',
        parameters: { codes: 'BETA, GAMMA', count: 2 },
      }),
    ).toContain('BETA, GAMMA');
    expect(
      knownProductProblem({
        code: 'platform.feature_requires_feature',
        parameters: { feature: 'sourcing', required: 'subcontractor_directory' },
      }),
    ).toBe('Sourcing can only be included together with Subcontractor directory.');
  });
});

describe('sourcing list', () => {
  it('lists sourcing as cards, filters by status on the server and explains an empty list', () => {
    const http = configure(VIEWER);
    const fixture = TestBed.createComponent(SourcingList);
    fixture.detectChanges();
    const summary: SourcingSummary = {
      id: 'src1',
      workPackage: sourcing().workPackage,
      status: 'ShortlistApproved',
      candidateCount: 3,
      qualifiedCount: 2,
      shortlistedCount: 1,
      approvalCount: 1,
      updatedAtUtc: '2026-09-21T09:00:00Z',
    };
    http.expectOne((request) => request.url === '/api/v1/sourcing').flush(paged([summary]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('HVAC installation');
    expect(text(element)).toContain('Shortlist approved');
    expect(element.querySelector('a[href="/sourcing/src1"]')).not.toBeNull();

    fixture.componentInstance.status = 'Open';
    fixture.componentInstance.applyFilter();
    const filtered = http.expectOne((request) => request.url === '/api/v1/sourcing');
    expect(filtered.request.params.getAll('status')).toEqual(['Open']);
    filtered.flush(paged([]));
    fixture.detectChanges();
    expect(text(element)).toContain('No sourcing matches this filter');
    http.verify();
  });

  it('searches the list and starts sourcing from a picker of live work packages (CF-103)', () => {
    const http = configure([...VIEWER, 'Sourcing.Manage']);
    const fixture = TestBed.createComponent(SourcingList);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/sourcing').flush(paged([]));
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.search = 'WP-12';
    page.applyFilter();
    expect(
      http.expectOne((request) => request.url === '/api/v1/sourcing').request.params.get('search'),
    ).toBe('WP-12');
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Start sourcing'))!
      .click();
    http.expectOne('/api/v1/sourcing/startable').flush([
      {
        id: 'wp9',
        code: 'WP-ELEC',
        title: 'Electrical riser',
        projectCode: 'P-1',
        projectName: 'Tower',
        tradeId: 't9',
      },
    ]);
    fixture.detectChanges();
    expect(text(element)).toContain('Electrical riser');
    page.start(page.startable()![0]);
    expect(
      http.expectOne((request) => request.method === 'POST' && request.url === '/api/v1/sourcing')
        .request.body,
    ).toEqual({
      workPackageId: 'wp9',
      tradeIds: ['t9'],
    });
  });

  it('offers no start action without the sourcing right', () => {
    const http = configure(VIEWER);
    const fixture = TestBed.createComponent(SourcingList);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/sourcing').flush(paged([]));
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.some((item) => item.textContent?.trim() === 'Start sourcing')).toBe(false);
  });
});

describe('sourcing detail', () => {
  it('lets an officer gather, prequalify and shortlist, but leaves approval to a manager', () => {
    const detail = sourcing({
      candidates: [
        candidate({ id: 'c1', result: 'Qualified', criteria: ALL_MET }),
        candidate({
          id: 'c2',
          subcontractorId: 's3',
          code: 'DORM',
          legalName: 'Dormant Co',
          directoryStatus: 'Inactive',
          result: 'Pending',
        }),
      ],
    });
    const { http, fixture, element } = renderDetail(OFFICER, detail);
    // Candidate discovery offers active firms only by default.
    const search = http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery');
    expect(search.request.params.getAll('status')).toEqual(['Active']);
    search.flush(paged([discovered]));
    fixture.detectChanges();

    const content = text(element);
    expect(content).toContain('Put the qualified candidates who should proceed on the shortlist.');
    expect(content).toContain(
      'Inactive in the directory, so it cannot be qualified or shortlisted.',
    );
    expect(content).toContain('Performs a sourced trade');
    expect(buttons(element)).toContain('Add to shortlist');
    expect(buttons(element)).not.toContain('Approve shortlist');

    // Shortlisting sends the version the screen shows and keeps what the server returns.
    fixture.componentInstance.setShortlisted(detail.candidates[0], true);
    const shortlist = http.expectOne('/api/v1/sourcing/src1/candidates/c1/shortlist');
    expect(shortlist.request.body).toEqual({ shortlisted: true, version: 'v1' });
    shortlist.flush(
      sourcing({
        version: 'v2',
        canApprove: true,
        candidates: [candidate({ result: 'Qualified', criteria: ALL_MET, isShortlisted: true })],
      }),
    );
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    fixture.detectChanges();
    expect(text(element)).toContain(
      'The shortlist is ready for approval by a Procurement Manager.',
    );
    expect(buttons(element)).not.toContain('Approve shortlist');

    fixture.componentInstance.add(discovered);
    const add = http.expectOne('/api/v1/sourcing/src1/candidates');
    expect(add.request.body).toEqual({ subcontractorId: 's2', version: 'v2' });
    http.verify();
  });

  it('shows a reader the whole decision trail but no action', () => {
    const detail = sourcing({
      candidates: [
        candidate({
          result: 'NotQualified',
          criteria: { ...ALL_MET, capacity: 'NotMet' },
          rationale: 'No capacity this year.',
          assessedByName: 'Nadia Officer',
          assessedAtUtc: '2026-09-21T08:00:00Z',
        }),
      ],
    });
    const { http, element } = renderDetail(VIEWER, detail);
    // No discovery for someone who cannot add candidates.
    http.expectNone((request) => request.url === '/api/v1/sourcing/src1/discovery');
    const content = text(element);
    expect(content).toContain('Not qualified');
    expect(content).toContain('No capacity this year.');
    expect(content).toContain('Assessed by Nadia Officer');
    expect(content).toContain('Criteria: 5 met · 1 not met · 1 not assessed');
    expect(buttons(element)).toEqual([]);
    http.verify();
  });

  it('refuses to send a rejection without a rationale, then records the checklist and decision', () => {
    const detail = sourcing({ candidates: [candidate()] });
    const { http, fixture, element } = renderDetail(OFFICER, detail);
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    const page = fixture.componentInstance;
    page.openAssess(detail.candidates[0]);
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(element.querySelectorAll('fieldset.src-criterion').length).toBe(8);
    // Each checklist question is its own named radio group, so keyboard and screen-reader users get
    // proper grouping, and answering one question never changes another.
    const radios = [
      ...element.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="radio"]'),
    ];
    expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(8);
    expect(radios.every((radio) => !!radio.getAttribute('name'))).toBe(true);
    radios
      .find(
        (radio) =>
          radio.name === 'criterion-tradeFit' && radio.labels?.[0]?.textContent?.trim() === 'Met',
      )!
      .click();
    fixture.detectChanges();
    expect(page.assessCriteria.tradeFit).toBe('Met');
    expect(page.assessCriteria.capacity).toBe('NotAssessed');
    expect(page.assessResult).toBe('Pending');

    page.assessCriteria = { ...ALL_MET, capacity: 'NotMet' };
    page.assessResult = 'NotQualified';
    page.confirmDialog();
    fixture.detectChanges();
    http.expectNone('/api/v1/sourcing/src1/candidates/c1/prequalification');
    expect(text(element)).toContain('A rationale is required for this decision.');

    // Typing a rationale clears the refusal instead of leaving a stale error on screen.
    const rationale = element.querySelector<HTMLTextAreaElement>('#assess-rationale')!;
    rationale.value = '  No HVAC capacity this year.  ';
    rationale.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text(element)).not.toContain('A rationale is required for this decision.');
    page.confirmDialog();
    const request = http.expectOne('/api/v1/sourcing/src1/candidates/c1/prequalification');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      result: 'NotQualified',
      criteria: { ...ALL_MET, capacity: 'NotMet' },
      rationale: 'No HVAC capacity this year.',
      version: 'v1',
    });
    http.verify();
  });

  it('locks an approved shortlist, marks a firm blocked since approval and asks why it is reopened', () => {
    const approval = {
      id: 'a1',
      round: 1,
      approvedAtUtc: '2026-09-21T10:00:00Z',
      approvedByName: 'Maha Manager',
      revokedAtUtc: null,
      revokedByName: null,
      revocationReason: null,
      members: [
        {
          subcontractorId: 's1',
          code: 'ACME-01',
          legalName: 'Acme Mechanical',
          statusAtApproval: 'Active' as const,
          currentDirectoryStatus: 'Blocked' as const,
          criteria: ALL_MET,
          rationale: null,
          assessedAtUtc: null,
          assessedByName: null,
        },
      ],
    };
    const detail = sourcing({
      status: 'ShortlistApproved',
      lockReason: 'sourcing.shortlist_approved_read_only',
      canReopen: true,
      currentApproval: approval,
      approvals: [approval],
      candidates: [candidate({ result: 'Qualified', criteria: ALL_MET, isShortlisted: true })],
    });
    const { http, fixture, element } = renderDetail(MANAGER, detail);
    http.expectNone((request) => request.url === '/api/v1/sourcing/src1/discovery');
    const content = text(element);
    // CF-007: this plan has no tendering, so the approved shortlist is the record, not a step towards tendering.
    expect(content).toContain(
      'This shortlist is approved and stays as the record of who qualified',
    );
    expect(content).not.toContain('proceed to tendering');
    expect(content).toContain('approved by Maha Manager');
    expect(content).toContain('Now Blocked in the directory');
    expect(buttons(element)).toEqual(['Reopen shortlist']);

    const page = fixture.componentInstance;
    page.openReopen();
    page.reopenReason = 'x';
    page.confirmDialog();
    fixture.detectChanges();
    http.expectNone('/api/v1/sourcing/src1/reopen');
    expect(text(element)).toContain(
      'Explain why the approved shortlist is being reopened (at least 3 characters).',
    );
    page.reopenReason = 'Client added a zone.';
    page.confirmDialog();
    const reopen = http.expectOne('/api/v1/sourcing/src1/reopen');
    expect(reopen.request.body).toEqual({ reason: 'Client added a zone.', version: 'v1' });
    http.verify();
  });

  it('reloads instead of overwriting when someone else changed the sourcing', () => {
    const detail = sourcing({
      canApprove: true,
      candidates: [candidate({ result: 'Qualified', criteria: ALL_MET, isShortlisted: true })],
    });
    const { http, fixture, element } = renderDetail(MANAGER, detail);
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    fixture.componentInstance.open({ kind: 'approve' });
    fixture.componentInstance.confirmDialog();
    http
      .expectOne('/api/v1/sourcing/src1/approve')
      .flush({ code: 'concurrency.stale' }, { status: 409, statusText: 'Conflict' });
    http.expectOne('/api/v1/sourcing/src1').flush(sourcing({ version: 'v9' }));
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    fixture.detectChanges();
    expect(text(element)).toContain('Someone else changed this sourcing.');
    expect(fixture.componentInstance.sourcing()?.version).toBe('v9');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    http.verify();
  });

  it('explains that a firm blocked after shortlisting stops the approval, and never offers Qualified for it', () => {
    const blocked = candidate({
      result: 'Qualified',
      criteria: ALL_MET,
      isShortlisted: true,
      directoryStatus: 'Blocked',
    });
    // The server reports the shortlist as not approvable while a shortlisted firm is not Active.
    const { http, fixture, element } = renderDetail(
      MANAGER,
      sourcing({ canApprove: false, candidates: [blocked] }),
    );
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    fixture.detectChanges();
    const content = text(element);
    expect(content).toContain('A shortlisted subcontractor is no longer active in the directory.');
    expect(content).toContain('No longer active in the directory. Take it off the shortlist');
    expect(buttons(element)).not.toContain('Approve shortlist');
    expect(buttons(element)).toContain('Take off shortlist');

    fixture.componentInstance.openAssess(blocked);
    fixture.detectChanges();
    const options = [
      ...element.querySelectorAll<HTMLInputElement>('input[name="assess-result"]'),
    ].map((radio) => radio.labels?.[0]?.textContent?.trim());
    expect(options).toEqual(['Not qualified', 'Not yet decided']);
    expect(fixture.componentInstance.assessResult).toBe('Pending');
    expect(text(element)).toContain(
      'Qualified is not available: this subcontractor is Blocked in the directory.',
    );
    expect(text(element)).toContain('Saving this decision takes the candidate off the shortlist.');
    http.verify();
  });

  it('shows a paused work package as frozen with the reason from the server', () => {
    const detail = sourcing({
      lockReason: 'sourcing.work_package_on_hold',
      workPackage: { ...sourcing().workPackage, status: 'OnHold' },
      candidates: [candidate({ result: 'Qualified', criteria: ALL_MET })],
    });
    const { http, element } = renderDetail(MANAGER, detail);
    http.expectNone((request) => request.url === '/api/v1/sourcing/src1/discovery');
    expect(text(element)).toContain('The work package is on hold. Resume it to continue sourcing.');
    expect(buttons(element)).toEqual([]);
    http.verify();
  });

  it('lets the preparer mark the shortlist ready for approval and shows who marked it (CF-130)', () => {
    const detail = sourcing({
      canApprove: true,
      candidates: [
        candidate({ id: 'c1', result: 'Qualified', criteria: ALL_MET, isShortlisted: true }),
      ],
    });
    const { http, fixture, element } = renderDetail(OFFICER, detail);
    http.match(() => true).forEach((request) => request.flush(paged([])));
    const mark = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Mark ready for approval'),
    )!;
    mark.click();
    const request = http.expectOne('/api/v1/sourcing/src1/request-approval');
    expect(request.request.body).toEqual({ version: detail.version });
    request.flush({
      ...detail,
      approvalRequestedAtUtc: '2026-10-01T08:00:00Z',
      approvalRequestedByName: 'Omar Officer',
      requireIndependentApproval: true,
    });
    fixture.detectChanges();
    expect(text(element)).toContain('Ready for approval — marked by Omar Officer');
    expect(text(element)).toContain(
      'approved by someone other than who prepared or last changed it',
    );
    expect(
      [...element.querySelectorAll('button')].some((item) =>
        item.textContent?.includes('Mark ready for approval'),
      ),
    ).toBe(false);
  });
});

describe('work package sourcing panel', () => {
  function render(permissions: readonly string[], status: string, features = FEATURES) {
    const http = configure(permissions, features);
    const fixture = TestBed.createComponent(WorkPackageSourcing);
    fixture.componentRef.setInput('workPackageId', 'wp1');
    fixture.componentRef.setInput('packageStatus', status);
    fixture.detectChanges();
    return { http, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('starts sourcing for a live package and opens it', async () => {
    const { http, fixture, element } = render(OFFICER, 'Active');
    const lookup = http.expectOne((request) => request.url === '/api/v1/sourcing');
    expect(lookup.request.params.get('workPackageId')).toBe('wp1');
    lookup.flush(paged([]));
    fixture.detectChanges();
    expect(buttons(element)).toEqual(['Start sourcing']);
    expect(text(element)).not.toContain('candidates ·');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.start();
    const start = http.expectOne('/api/v1/sourcing');
    expect(start.request.body).toEqual({ workPackageId: 'wp1', tradeIds: [] });
    start.flush(sourcing());
    expect(navigate).toHaveBeenCalledWith(['/sourcing', 'src1']);
    http.verify();
  });

  it('explains that a draft package is not sourced yet, and says when the plan lacks sourcing', () => {
    const draft = render(VIEWER, 'Draft');
    draft.http.expectOne((request) => request.url === '/api/v1/sourcing').flush(paged([]));
    draft.fixture.detectChanges();
    expect(text(draft.element)).toContain('Sourcing starts once the work package is active.');
    expect(buttons(draft.element)).toEqual([]);
    TestBed.resetTestingModule();

    const unpurchased = render(OFFICER, 'Active', ['projects', 'subcontractor_directory']);
    unpurchased.http.expectNone((request) => request.url === '/api/v1/sourcing');
    // CF-105: named, not silent — a member is pointed to their Company Admin.
    expect(text(unpurchased.element)).toContain('Sourcing is not included in your company plan.');
    expect(text(unpurchased.element)).toContain('Ask your Company Admin');
    expect(buttons(unpurchased.element)).toEqual([]);
  });
});

describe('guards and plan terms', () => {
  it('requires every feature a route names', async () => {
    const http = configure(VIEWER, ['projects', 'sourcing']);
    const snapshot = {
      data: { permission: 'Sourcing.View', feature: FEATURES },
    } as unknown as ActivatedRouteSnapshot;
    const outcome = TestBed.runInInjectionContext(() => featureGuard(snapshot, {} as never));
    const decided = firstValueFrom(isObservable(outcome) ? outcome : of(outcome));
    // The guard re-reads the session and the plan; answer both as the server would.
    http.expectOne('/api/v1/session').flush({
      userId: 'u1',
      tenantId: 't',
      email: 'viewer@example.com',
      displayName: 'Viewer',
      companyName: 'Delta',
      roles: ['TechnicalEvaluator'],
      permissions: VIEWER,
      passwordResetRequired: false,
    });
    http.expectOne('/api/v1/company/features').flush({ features: ['projects', 'sourcing'] });
    expect(String(await decided)).toContain('plan=unavailable');
  });

  it('asks the operator to include what sourcing depends on instead of unticking anything', () => {
    TestBed.configureTestingModule({ providers: [] });
    const catalogue: EntitlementCatalogue = {
      features: [
        { key: 'projects', available: true, requiresFeatures: [] },
        { key: 'subcontractor_directory', available: true, requiresFeatures: [] },
        {
          key: 'sourcing',
          available: true,
          requiresFeatures: ['projects', 'subcontractor_directory'],
        },
      ],
      limits: [],
    };
    const fixture = TestBed.createComponent(PackageBuilder);
    fixture.componentRef.setInput('catalogue', catalogue);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Requires Projects and Subcontractor directory.');
    const sourcingBox = element.querySelector<HTMLInputElement>('input[name="feature-sourcing"]')!;
    sourcingBox.click();
    fixture.detectChanges();
    expect(text(element)).toContain('Also include Projects and Subcontractor directory.');
    expect(sourcingBox.getAttribute('aria-invalid')).toBe('true');
    element.querySelector<HTMLInputElement>('input[name="feature-projects"]')!.click();
    element
      .querySelector<HTMLInputElement>('input[name="feature-subcontractor_directory"]')!
      .click();
    fixture.detectChanges();
    expect(text(element)).not.toContain('Also include');
    expect(sourcingBox.checked).toBe(true);
  });
});

describe('bulk sourcing and the fast path (CF-057)', () => {
  const second: DiscoveryItem = { ...discovered, subcontractorId: 's3', code: 'GAMMA' };

  it('adds the ticked directory firms in one request and prequalifies ticked candidates together', () => {
    const { http, fixture, element } = renderDetail(
      OFFICER,
      sourcing({
        candidates: [candidate(), candidate({ id: 'c2', subcontractorId: 's9', code: 'DELTA' })],
      }),
    );
    http
      .expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery')
      .flush(paged([discovered, second]));
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.togglePick(discovered, true);
    page.togglePick(second, true);
    fixture.detectChanges();
    expect(buttons(element)).toContain('Add selected (2)');
    // Without approval rights (and with the fast path off) the fast path is not offered.
    expect(buttons(element).some((label) => label.includes('fast path'))).toBe(false);
    page.addPicked();
    const add = http.expectOne('/api/v1/sourcing/src1/candidates/bulk');
    expect(add.request.body).toEqual({ subcontractorIds: ['s2', 's3'], version: 'v1' });
    add.flush(
      sourcing({
        version: 'v2',
        candidates: [candidate(), candidate({ id: 'c2', subcontractorId: 's9', code: 'DELTA' })],
      }),
    );
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    fixture.detectChanges();
    expect(page.picked().size).toBe(0);

    const [first, other] = page.active();
    page.toggleCandidate(first, true);
    page.toggleCandidate(other, true);
    page.openAssessPicked();
    fixture.detectChanges();
    expect(text(document.body)).toContain('Prequalify 2 candidates');
    page.assessResult = 'Qualified';
    page.assessCriteria = { ...ALL_MET };
    page.confirmDialog();
    const assess = http.expectOne('/api/v1/sourcing/src1/candidates/prequalification');
    expect(assess.request.body).toEqual({
      candidateIds: ['c1', 'c2'],
      result: 'Qualified',
      criteria: ALL_MET,
      rationale: null,
      version: 'v2',
    });
    assess.flush(sourcing({ version: 'v3' }));
    http.expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery').flush(paged([]));
    http.verify();
  });

  it('approves ticked approved vendors on the fast path with a reason when the company allows it', () => {
    const { http, fixture, element } = renderDetail(
      MANAGER,
      sourcing({ fastPathUnavailable: null }),
    );
    http
      .expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery')
      .flush(paged([discovered]));
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.togglePick(discovered, true);
    fixture.detectChanges();
    expect(buttons(element)).toContain('Approve selected on the fast path (1)');
    page.openFastPath();
    page.confirmDialog();
    // A reason is required before anything is sent.
    expect(page.reasonMissing()).toBe(true);
    page.fastPathRationale = 'Urgent small repair';
    page.confirmDialog();
    const fast = http.expectOne('/api/v1/sourcing/src1/fast-path');
    expect(fast.request.body).toEqual({
      subcontractorIds: ['s2'],
      rationale: 'Urgent small repair',
      version: 'v1',
    });
    const approval = {
      id: 'a1',
      round: 1,
      approvedAtUtc: '2026-09-30T10:00:00Z',
      approvedByName: 'Maha Manager',
      revokedAtUtc: null,
      revokedByName: null,
      revocationReason: null,
      members: [],
      fastPath: true,
    };
    fast.flush(
      sourcing({
        status: 'ShortlistApproved',
        lockReason: 'sourcing.shortlist_approved',
        currentApproval: approval,
        approvals: [approval],
        version: 'v2',
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Low-value fast path');
    http.match(() => true).forEach((request) => request.flush(paged([])));
  });
});

describe('prequalification evidence (CF-033)', () => {
  const evidence = (overrides: Record<string, unknown> = {}) => ({
    workPackageId: 'wp1',
    category: 'Mechanical',
    categoryMissing: false,
    access: { commercial: false, performance: true, decisions: false },
    rule: 'intelligence-metrics-v2',
    truncated: false,
    candidates: [
      {
        subcontractorId: 's1',
        validInvitations: 3,
        submitted: 3,
        reliabilityPercent: '100.0',
        completedProjects: 3,
        latestClosedAtUtc: '2026-09-01T10:00:00Z',
        strength: 'Moderate',
        dated: false,
        similarProjects: 0,
        onTime: 2,
        late: 1,
        wouldWorkAgainYes: 2,
        wouldWorkAgainConditional: 1,
        wouldWorkAgainNo: 0,
        ...overrides,
      },
    ],
  });

  function assessWithEvidence(permissions: readonly string[], flushed: object) {
    const http = configure(
      [...permissions, 'Intelligence.View'],
      [...FEATURES, ...INTELLIGENCE_FEATURES],
    );
    const fixture = TestBed.createComponent(SourcingDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([]);
    const detail = sourcing({ candidates: [candidate()] });
    http.expectOne('/api/v1/sourcing/src1').flush(detail);
    fixture.detectChanges();
    const isEvidence = (request: { url: string }) =>
      request.url === '/api/v1/intelligence/work-packages/wp1/candidates';
    // The page's own candidate evidence section.
    for (const request of http.match(isEvidence)) request.flush(flushed);
    http.match((request) => request.url === '/api/v1/sourcing/src1/discovery');
    fixture.componentInstance.openAssess(detail.candidates[0]);
    fixture.detectChanges();
    const live = http.expectOne(isEvidence);
    expect(live.request.params.getAll('ids')).toEqual(['s1']);
    live.flush(flushed);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return text(element.querySelector('[data-testid="prequal-evidence"]')!);
  }

  it('shows delivery counts beside Past performance to a reader with performance access', () => {
    const shown = assessWithEvidence([...MANAGER, 'Performance.View'], evidence());
    expect(shown).toContain('3 finalized closeouts in Mechanical · Moderate evidence');
    expect(shown).toContain('on time 2 · late 1 · would work again yes 2 · conditional 1 · no 0');
  });

  it('shows an officer the count only and who can see the details', () => {
    const shown = assessWithEvidence(
      OFFICER,
      evidence({
        completedProjects: 1,
        strength: 'Limited',
        onTime: null,
        late: null,
        wouldWorkAgainYes: null,
        wouldWorkAgainConditional: null,
        wouldWorkAgainNo: null,
      }),
    );
    expect(shown).toContain('1 finalized closeout in Mechanical · Limited evidence');
    expect(shown).toContain('Delivery details are visible to roles with performance access.');
    expect(shown).not.toContain('on time');
  });

  it('says there is no evidence rather than zero', () => {
    const shown = assessWithEvidence(
      OFFICER,
      evidence({ completedProjects: 0, strength: 'None', onTime: null, late: null }),
    );
    expect(shown).toContain('No evidence: no finalized closeout of this firm in Mechanical yet.');
    expect(shown).not.toContain('0 finalized');
  });

  it('shows the evidence an assessment and an approval were recorded with, or that it was not', () => {
    const assessed = candidate({
      result: 'Qualified',
      criteria: ALL_MET,
      assessedAtUtc: '2026-09-22T10:00:00Z',
      assessedByName: 'Omar Officer',
      evidence: { completedProjects: 1, strength: 'Limited', deliveryShown: false },
    });
    const member = {
      subcontractorId: 's1',
      code: 'ACME-01',
      legalName: 'Acme Mechanical',
      statusAtApproval: 'Active' as const,
      currentDirectoryStatus: 'Active' as const,
      criteria: ALL_MET,
      rationale: null,
      assessedAtUtc: '2026-09-22T10:00:00Z',
      assessedByName: 'Omar Officer',
    };
    const approval = {
      id: 'ap1',
      round: 1,
      approvedAtUtc: '2026-09-23T10:00:00Z',
      approvedByName: 'Pat Manager',
      revokedAtUtc: null,
      revokedByName: null,
      revocationReason: null,
      members: [member],
    };
    const { element } = renderDetail(VIEWER, {
      ...sourcing({ candidates: [assessed] }),
      status: 'ShortlistApproved',
      currentApproval: approval,
      approvals: [approval],
    } as SourcingDetail);
    const recorded = [...element.querySelectorAll('[data-testid="prequal-evidence-recorded"]')].map(
      (node) => text(node as HTMLElement),
    );
    expect(recorded).toContain(
      'Evidence at assessment: 1 finalized closeout in this category · Limited evidence · the assessor saw the count only',
    );
    expect(recorded).toContain('Evidence at assessment: not recorded');
  });
});

describe('history chips in discovery (CF-014)', () => {
  it('shows each discovery row its history in this category, counts only without performance access', () => {
    const detail = sourcing({ candidates: [] });
    const { http, fixture, element } = renderDetail(OFFICER, detail);
    http
      .expectOne((request) => request.url === '/api/v1/sourcing/src1/discovery')
      .flush(
        paged([
          {
            ...discovered,
            evidence: {
              completedProjects: 2,
              strength: 'Limited',
              latestClosedAtUtc: '2026-09-01T10:00:00Z',
              wouldWorkAgainYes: null,
              wouldWorkAgainConditional: null,
              wouldWorkAgainNo: null,
            },
          },
          {
            ...discovered,
            subcontractorId: 's3',
            code: 'GAMA',
            evidence: {
              completedProjects: 0,
              strength: 'None',
              latestClosedAtUtc: null,
              wouldWorkAgainYes: null,
              wouldWorkAgainConditional: null,
              wouldWorkAgainNo: null,
            },
          },
          {
            ...discovered,
            subcontractorId: 's4',
            code: 'DELTA',
            evidence: {
              completedProjects: 1,
              strength: 'Limited',
              latestClosedAtUtc: '2026-08-01T10:00:00Z',
              wouldWorkAgainYes: 1,
              wouldWorkAgainConditional: 0,
              wouldWorkAgainNo: 0,
            },
          },
        ]),
      );
    fixture.detectChanges();
    const chips = [...element.querySelectorAll('[data-testid="discovery-history"]')].map((chip) =>
      text(chip as HTMLElement).trim(),
    );
    expect(chips[0]).toContain(
      '2 finalized closeouts in this category · Limited evidence · latest',
    );
    expect(chips[0]).not.toContain('would work again');
    expect(chips[1]).toBe('No history in this category');
    expect(chips[2]).toContain('would work again yes 1 · conditional 0 · no 0');
  });
});
