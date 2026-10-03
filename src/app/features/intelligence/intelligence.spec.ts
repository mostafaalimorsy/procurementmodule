import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { AuditLogPage } from '../audit/audit-log';
import { SearchPage } from '../search/search-page';
import { CandidateEvidenceView } from './candidate-evidence';
import { BusinessFormat } from '../../core/localization/business-format';
import { DashboardView } from './dashboard';
import { MyWorkPanel } from './my-work';
import { SubcontractorIntelligence } from './intelligence.api';
import { adminDashboard, emptyProfile, fullProfile, generalProfile } from './intelligence.fixtures';
import {
  central,
  centralAt,
  duration,
  rate,
  roundDecimal,
  samplePrecision,
} from './intelligence-labels';
import { SubcontractorIntelligenceView } from './subcontractor-intelligence';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const settle = () => new Promise((resolve) => setTimeout(resolve));

function configure(
  query: Record<string, string> = {},
  permissions: string[] = ['Intelligence.View'],
) {
  const params = new BehaviorSubject(convertToParamMap(query));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap(query) },
          queryParamMap: params,
        },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles: ['CompanyAdmin'], permissions });
  return { http: TestBed.inject(HttpTestingController), params };
}

async function profile(response = fullProfile(), workPackageId: string | null = null) {
  const { http } = configure();
  const view = TestBed.createComponent(SubcontractorIntelligenceView);
  view.componentRef.setInput('subcontractorId', 's1');
  view.componentRef.setInput('workPackageId', workPackageId);
  view.detectChanges();
  const request = http.expectOne(
    (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
  );
  request.flush(response);
  view.detectChanges();
  // CF-026: with no category given, the profile then reads the category with the most finalized closeouts.
  const followUp = http.match(
    (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
  );
  for (const next of followUp) next.flush(scoped(response, next.request.params.get('category')));
  view.detectChanges();
  await view.whenStable();
  view.detectChanges();
  return { http, view, request, followUp, element: view.nativeElement as HTMLElement };
}

/** The profile as the server returns it for one category (the same evidence, now scoped). */
function scoped(
  response: SubcontractorIntelligence,
  key: string | null,
): SubcontractorIntelligence {
  const option = response.categories.find((candidate) => candidate.key === key);
  return option ? { ...response, categoryKey: option.key, category: option.category } : response;
}

describe('Delivery outcome types', () => {
  it('names subcontracts that did not complete and keeps them out of the figures', async () => {
    // CF-048 / CF-082 (ADR-124): a default termination is counted by its type, never hidden in a median; flags travel with the project.
    const base = fullProfile();
    const delivery = base.delivery!;
    const [first, ...rest] = delivery.outcomes;
    const { element } = await profile({
      ...base,
      delivery: {
        ...delivery,
        outcomeTypes: { Completed: delivery.outcomes.length - 1, TerminatedForDefault: 1 },
        excludedFromVariance: 1,
        outcomes: [
          {
            ...first,
            outcomeType: 'TerminatedForDefault',
            earlyWorksDeclared: true,
            timingWarnings: ['finalized_soon'],
            finalizedDaysAfterAward: 0,
          },
          ...rest,
        ],
      },
    });
    const shown = text(element);
    expect(shown).toContain('Terminated for default: 1');
    expect(shown).toContain('Left out of the on-time and variance figures: 1');
    expect(shown).toContain('Early works declared');
    expect(shown).toContain('finalized on the award day');
    expect(shown).toContain('Finalized less than 7 days after the award');
  });
});

describe('Variance causes', () => {
  it('shows the variation share and residual beside a cost variance, and only the cause without cost visibility', async () => {
    // CF-025 (ADR-125).
    const base = fullProfile();
    const delivery = base.delivery!;
    const [first, ...rest] = delivery.outcomes;
    const { element } = await profile({
      ...base,
      delivery: {
        ...delivery,
        outcomes: [
          {
            ...first,
            variationCause: 'ClientChange',
            variationSharePercent: '9.00',
            residualCostVariancePercent: '2.00',
          },
          ...rest.map((item) => ({
            ...item,
            variationCause: 'ScopeGap',
            variationSharePercent: null,
          })),
        ],
      },
    });
    const shown = text(element);
    expect(shown).toContain('of which variations +9.00 % (Client change)');
    expect(shown).toContain('residual +2.00 %');
    if (rest.length > 0) expect(shown).toContain('variations: Scope gap');
  });
});

describe('Retrospective evidence on the profile', () => {
  it('lists confirmed past outcomes labelled, with their source and confirmer, apart from closeouts', async () => {
    // CF-002 (ADR-126).
    const { element } = await profile({
      ...fullProfile(),
      retrospectiveProjects: 1,
      retrospective: {
        count: 1,
        items: [
          {
            recordId: 'r1',
            versionNumber: 1,
            category: 'Mechanical',
            projectLabel: 'Riyadh Metro Line 3',
            packageLabel: 'HVAC package B',
            outcomeType: 'Completed',
            scheduleOutcome: 'Late',
            scheduleVariancePercent: '28.89',
            costVariancePercent: '8.00',
            qualityRating: 4,
            hseRating: 5,
            wouldWorkAgain: 'Yes',
            variationCause: 'ClientChange',
            sourceReference: 'Final account FA-2025-11',
            imported: false,
            createdByName: 'Quinn QS',
            confirmedByName: 'Morgan Manager',
            confirmedAtUtc: '2026-10-01T09:00:00Z',
          },
        ],
      },
    });
    const section = element.querySelector('[data-testid="intel-retrospective"]')!;
    const shown = text(section);
    expect(shown).toContain('Retrospective — not system-evidenced');
    expect(shown).toContain('No recommendation weighs them');
    expect(shown).toContain('Source: Final account FA-2025-11');
    expect(shown).toContain('confirmed by Morgan Manager');
    expect(section.querySelector('a')!.getAttribute('href')).toBe('/retrospective-outcomes/r1');
  });
});

describe('Part 12 intelligence formats', () => {
  it('never shows a rate or a typical time without evidence', () => {
    expect(rate(null)).toBe('—');
    expect(rate('60.0')).toBe('60.0 %');
    expect(duration(null)).toBe('—');
    expect(duration('0.4')).toBe('24 min');
    expect(duration('36.0')).toBe('36.0 h');
    expect(duration('60.0')).toBe('2.5 days');
    expect(
      central({ count: 0, median: null, mean: null, minimum: null, maximum: null }),
    ).toBeNull();
    expect(central({ count: 1, median: null, mean: null, minimum: '4.00', maximum: '4.00' })).toBe(
      '4.00',
    );
    expect(
      central({ count: 3, median: '10.00', mean: '9.00', minimum: '1.00', maximum: '20.00' }),
    ).toBe('10.00');
  });
});

describe('Subcontractor intelligence profile', () => {
  it('shows every figure with its evidence count, period and definitions, and labels one project as a small sample', async () => {
    const { element, request, http } = await profile();
    expect(request.request.params.keys()).toEqual([]);
    const shown = text(element);
    expect(shown).toContain('Subcontractor intelligence');
    expect(shown).toContain('50.0 %');
    expect(shown).toContain('Submitted 1 of 2 valid invitations');
    expect(shown).toContain('One submission only — not a typical time.');
    expect(shown).toContain('Awarded 1 of 1 decided tenders it bid in');
    expect(shown).toContain('Limited evidence');
    expect(shown).toContain(
      'A small sample: read these figures as individual projects, not as a trend.',
    );
    expect(shown).toContain('intelligence-metrics-v2');
    expect(shown).toContain('Response reliability = bids submitted ÷ valid invitations.');
    // Commercial evidence: the firm's own leveled price and position, never a competitor's.
    expect(shown).toContain('position 1 / 2');
    expect(shown).toContain('−4.76 %');
    expect(shown).toContain('cost +11.00 %');
    // One completed project: no aggregate outcome score is shown at all.
    expect(shown).not.toContain('/ 100');
    // Quality and HSE stay separate, on the internal scale.
    expect(shown).toContain('Quality (internal 1–5)');
    expect(shown).toContain('HSE / safety (internal 1–5)');
    expect(shown).toContain('Bidding still open');
    expect(shown).not.toContain('probability');
    http.verify();
  });

  it('renders only the classes the server sent: a technical reader sees general evidence and an explanation, not blanks', async () => {
    const { element } = await profile(generalProfile());
    const shown = text(element);
    expect(shown).toContain('Response reliability');
    // The explanation of every metric stays; the commercial card and section do not exist.
    expect([...element.querySelectorAll('dt')].map((term) => text(term))).not.toContain(
      'Price position',
    );
    expect(element.querySelector('#intel-bids')).toBeNull();
    expect(shown).not.toContain('Bid behaviour');
    expect(shown).not.toContain('Leveled');
    expect(shown).not.toContain('Outcome score');
    expect(shown).toContain(
      'Delivery details (schedule, quality, HSE, variations, claims, disputes) are visible to roles',
    );
    expect(shown).not.toContain('kept as reserve');
  });

  it('switches every section to one category, and says missing evidence is not poor performance', async () => {
    const { view, element, http } = await profile();
    const select = element.querySelector('#intel-scope') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
      'All categories',
      'Mechanical',
      'No category',
    ]);
    select.value = select.options[2].value;
    select.dispatchEvent(new Event('change'));
    view.detectChanges();
    const uncategorized = http.expectOne(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    );
    expect(uncategorized.request.params.get('uncategorized')).toBe('true');
    uncategorized.flush(emptyProfile());
    view.detectChanges();
    await view.whenStable();
    view.detectChanges();
    const shown = text(element);
    expect(shown).toContain('No history in this category yet');
    expect(shown).toContain('No valid invitation yet — no rate.');
    expect(shown).toContain('This is missing evidence, not poor performance.');
    expect(shown).toContain('No evidence yet');
    expect(shown).not.toContain('0.0 %');
  });

  it('asks for similar projects of the next work package and shows why each matched', async () => {
    const response = fullProfile({
      similar: {
        workPackageId: 'wp2',
        projectCode: 'P-B',
        workPackageCode: 'WP-B',
        workPackageTitle: 'HVAC works B',
        category: 'Mechanical',
        categoryMissing: false,
        matches: 1,
        items: [
          {
            reasons: ['SameCategory', 'ComparableValue'],
            outcome: fullProfile().delivery!.outcomes[0],
          },
        ],
      },
    });
    const { element, request } = await profile(response, 'wp2');
    expect(request.request.params.get('workPackageId')).toBe('wp2');
    const shown = text(element);
    expect(shown).toContain('Similar projects');
    expect(shown).toContain('Same category');
    expect(shown).toContain('Comparable value (same currency, within two times the estimate)');
    expect(shown).toContain('Matches: 1');
  });
});

describe('Awards that ended (red-team G077, CF-046 AC8)', () => {
  const ended = (): SubcontractorIntelligence => {
    const base = fullProfile();
    const row = base.awards.items[0];
    return {
      ...base,
      awards: {
        ...base.awards,
        awardsDeclined: 1,
        awardsWithdrawn: 1,
        items: [
          // The same tender twice: the firm declined its award, then was not selected in the next one.
          { ...row, awardId: 'aw1', awardState: 'Declined' },
          { ...row, awardId: 'aw2', awardState: 'Accepted', disposition: 'Reject' },
          {
            ...row,
            tenderId: 't9',
            tenderReference: 'TND-2026-0009',
            awardId: 'aw9',
            awardState: 'Withdrawn',
          },
        ],
      },
    };
  };

  it('lists each award of a tender on its own row with its own chip, never as "Awarded"', async () => {
    const warn = vi.spyOn(console, 'warn');
    const { element } = await profile(ended());
    const rows = [...element.querySelectorAll('section[aria-labelledby="intel-awards"] li')];
    expect(rows.length).toBe(3);
    expect(rows.map((row) => text(row.querySelector('.prj-chip')!))).toEqual([
      'Award declined',
      'Not selected',
      'Award withdrawn',
    ]);
    // Rows are keyed by award: two rows of one tender raise no duplicate-key warning.
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/NG0955|duplicate/i);
    warn.mockRestore();
  });

  it('counts declined and withdrawn awards apart from awards', async () => {
    const { element } = await profile(ended());
    expect(text(element)).toContain('awards declined by the firm: 1 · awards withdrawn: 1');
    expect(text(element)).toContain('Awarded: 1 ·');
  });

  it('says nothing about ended awards when there were none', async () => {
    const { element } = await profile(fullProfile());
    expect(text(element)).not.toContain('awards declined by the firm');
  });
});

describe('Next-project candidate evidence', () => {
  it('reads every candidate in one request and links each profile with the package for similar projects', async () => {
    const { http } = configure();
    const view = TestBed.createComponent(CandidateEvidenceView);
    view.componentRef.setInput('workPackageId', 'wp2');
    view.componentRef.setInput('candidates', [
      { subcontractorId: 's1', code: 'ACME-01', legalName: 'ACME Contracting' },
      { subcontractorId: 's2', code: 'BETA-01', legalName: 'BETA Contracting' },
    ]);
    view.detectChanges();
    const request = http.expectOne(
      (candidate) => candidate.url === '/api/v1/intelligence/work-packages/wp2/candidates',
    );
    expect(request.request.params.getAll('ids')).toEqual(['s1', 's2']);
    request.flush({
      workPackageId: 'wp2',
      category: 'Mechanical',
      categoryMissing: false,
      access: { commercial: false, performance: true, decisions: false },
      rule: 'intelligence-metrics-v2',
      truncated: false,
      candidates: [
        {
          subcontractorId: 's1',
          validInvitations: 1,
          submitted: 1,
          reliabilityPercent: '100.0',
          completedProjects: 1,
          latestClosedAtUtc: '2026-09-01T10:00:00Z',
          strength: 'Limited',
          dated: false,
          similarProjects: 1,
          onTime: 0,
          late: 1,
          wouldWorkAgainYes: 1,
          wouldWorkAgainConditional: 0,
          wouldWorkAgainNo: 0,
        },
        {
          subcontractorId: 's2',
          retrospectiveProjects: 2,
          validInvitations: 0,
          submitted: 0,
          reliabilityPercent: null,
          completedProjects: 0,
          latestClosedAtUtc: null,
          strength: 'None',
          dated: false,
          similarProjects: 0,
          onTime: 0,
          late: 0,
          wouldWorkAgainYes: 0,
          wouldWorkAgainConditional: 0,
          wouldWorkAgainNo: 0,
        },
      ],
    });
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('it does not shortlist or rank anyone');
    expect(shown).toContain('Limited evidence');
    expect(shown).toContain('No evidence yet');
    // CF-002: past outcomes are counted apart and labelled; they never become "evidence".
    const retrospective = element.querySelectorAll('[data-testid="candidate-retrospective"]');
    expect(retrospective.length).toBe(1);
    expect(text(retrospective[0])).toContain('2');
    expect(text(retrospective[0])).toContain('Retrospective — not system-evidenced');
    const links = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual([
      '/subcontractors/s1?workPackage=wp2&category=Mechanical',
      '/subcontractors/s2?workPackage=wp2&category=Mechanical',
    ]);
    http.verify();
  });
});

describe('Home dashboard', () => {
  it('lists what needs attention with links to the work, and shows no section the server withheld', async () => {
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    const withheld = { ...adminDashboard(), decisions: null, evidence: null };
    http.expectOne('/api/v1/dashboard').flush(withheld);
    view.detectChanges();
    // CF-001: My work comes first, each item linked to where the work is done.
    http.expectOne('/api/v1/dashboard/my-work').flush({
      generatedAtUtc: '2026-10-01T10:00:00Z',
      items: [
        {
          kind: 'decision.awaiting_my_approval',
          recordId: 't9',
          tenderId: 't9',
          reference: 'TND-2026-0009',
          title: 'HVAC',
          sinceUtc: '2026-09-30T10:00:00Z',
          reason: null,
          step: 2,
        },
        {
          kind: 'closeout.execution_missing',
          recordId: 'a1',
          tenderId: 't1',
          reference: 'TND-2026-0001',
          title: 'Civil',
          sinceUtc: '2026-09-29T10:00:00Z',
          reason: null,
          step: null,
          dueAtUtc: '2026-09-29T10:00:00Z',
        },
      ],
      total: 3,
      kinds: {
        'decision.awaiting_my_approval': 1,
        'closeout.execution_missing': 1,
        'addendum.draft': 1,
      },
    });
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown.indexOf('My work')).toBeLessThan(shown.indexOf('Needs attention'));
    expect(shown).toContain('Approval step 2 is yours');
    expect(shown).toContain('Closeout: record the execution section');
    expect(shown).toContain('And 1 more, oldest first.');
    // CF-010: due two days before the server's time — overdue, in days.
    expect(shown).toContain('Overdue by 2 days');
    const workLinks = [...element.querySelectorAll('.my-work a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(workLinks).toEqual(['/tenders/t9/decision?tab=approval', '/closeouts/a1']);
    expect(shown).toContain('Needs attention');
    expect(shown).toContain('Awards without a closeout: 2');
    expect(shown).toContain('Evaluation in progress');
    expect(shown).toContain('Bidding closes soon');
    expect(shown).not.toContain('Decisions awaiting approval');
    expect(shown).not.toContain('Where your evidence is');
    const hrefs = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/closeouts?status=Pending');
    expect(hrefs).toContain('/tenders/t4/evaluation');
    expect(hrefs).toContain('/tenders/t2');
    expect(hrefs).toContain('/projects?status=Active');
    http.verify();
  });

  it('keeps closeout work on other projects apart and prompts to assign a missing Project Manager', () => {
    // CF-036: "other_project" items are listed under Other projects, never as the reader's own work.
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    http.expectOne('/api/v1/dashboard').flush(adminDashboard());
    view.detectChanges();
    const item = (kind: string, recordId: string, reason: string | null) => ({
      kind,
      recordId,
      tenderId: 't1',
      reference: 'TND-2026-0001',
      title: 'Civil',
      sinceUtc: '2026-09-29T10:00:00Z',
      reason,
      step: null,
    });
    http.expectOne('/api/v1/dashboard/my-work').flush({
      generatedAtUtc: '2026-10-01T10:00:00Z',
      items: [
        item('closeout.execution_missing', 'a1', 'assigned'),
        item('closeout.to_finalize', 'a2', 'other_project'),
        item('closeout.execution_missing', 'a3', 'unassigned'),
        item('closeout.pm_unassigned', 'p3', null),
      ],
      total: 4,
      kinds: {},
    });
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const lists = [...element.querySelectorAll('.my-work .my-work-list')];
    expect(lists.length).toBe(2);
    const hrefs = (list: Element) =>
      [...list.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs(lists[0])).toEqual(['/closeouts/a1', '/closeouts/a3', '/projects/p3/edit']);
    expect(hrefs(lists[1])).toEqual(['/closeouts/a2']);
    const shown = text(element);
    expect(shown).toContain('Other projects');
    expect(shown).toContain('No Project Manager is assigned to this project.');
    expect(shown).toContain('assign one to the project');
    http.verify();
  });

  it('never links a reader to a workspace the server did not give them (a project manager without evaluation)', () => {
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    http
      .expectOne('/api/v1/dashboard')
      .flush({ ...adminDashboard(), evaluation: null, decisions: null });
    view.detectChanges();
    const hrefs = [...(view.nativeElement as HTMLElement).querySelectorAll('a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(hrefs).toContain('/tenders/t3');
    expect(hrefs.some((href) => href?.endsWith('/evaluation'))).toBe(false);
    expect(hrefs.some((href) => href?.endsWith('/decision'))).toBe(false);
    // Each figure link is named by its label, not by a bare number.
    const figure = (view.nativeElement as HTMLElement).querySelector(
      'a[aria-labelledby="dash-fig-projects dash-fig-projects-n"]',
    );
    expect(figure).not.toBeNull();
  });

  it('names why a completed evaluation is not ready for a decision, and the last stage of a plan without the award (CF-007)', () => {
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    const base = adminDashboard();
    const item = base.evaluation!.items[0];
    http.expectOne('/api/v1/dashboard').flush({
      ...base,
      evaluation: {
        pending: 2,
        readyForDecision: 0,
        completedInPlan: 1,
        items: [
          { ...item, id: 'a', tenderId: 'a', status: 'RefreshRequired' },
          { ...item, id: 'b', tenderId: 'b', status: 'NegotiationOpen' },
          {
            ...item,
            id: 'c',
            tenderId: 'c',
            kind: 'evaluation.completed',
            status: 'EvaluationCompleted',
          },
        ],
      },
    });
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('Round closed — take it into the evaluation before the decision');
    expect(shown).toContain('Negotiation round open — the decision waits for it to close');
    expect(shown).toContain('Evaluation complete — the last stage in your plan');
    expect(shown).not.toContain('ready for a decision');
    const hrefs = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/tenders/c/evaluation');
    expect(hrefs).not.toContain('/tenders/c/decision');
  });

  it('shows an approval as yours only when the server says it is, and names the step otherwise (CF-129)', () => {
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    const base = adminDashboard();
    const item = base.decisions!.items[0];
    http.expectOne('/api/v1/dashboard').flush({
      ...base,
      decisions: {
        ...base.decisions!,
        awaitingYourApproval: 1,
        items: [
          { ...item, id: 'd1', tenderId: 'd1', kind: 'decision.awaiting_your_approval' },
          {
            ...item,
            id: 'd2',
            tenderId: 'd2',
            kind: 'decision.awaiting_approval_by',
            detail: '2:ApproverDirector',
          },
        ],
      },
    });
    view.detectChanges();
    const shown = text(view.nativeElement as HTMLElement);
    expect(shown).toContain('Decision awaiting your approval');
    expect(shown).toContain('Decision awaiting approval — step 2 (Approver / Director)');
    expect(shown).toContain('yours to approve now 1');
  });

  it('shows evidence coverage with its strength and a calm empty state when nothing is pending', () => {
    const { http } = configure();
    const view = TestBed.createComponent(DashboardView);
    view.detectChanges();
    const calm = adminDashboard();
    http.expectOne('/api/v1/dashboard').flush({
      ...calm,
      tenders: { ...calm.tenders!, items: [] },
      evaluation: { pending: 0, readyForDecision: 0, items: [] },
      decisions: { ...calm.decisions!, items: [] },
      closeouts: { ...calm.closeouts!, pending: 0 },
    });
    view.detectChanges();
    const shown = text(view.nativeElement as HTMLElement);
    expect(shown).toContain('Nothing needs your attention right now.');
    expect(shown).toContain('Where your evidence is');
    expect(shown).toContain('Limited evidence');
    expect(shown).toContain('Recent outcomes');
    expect(shown).toContain('ACME-01 · ACME Contracting');
  });
});

describe('My work due dates and the overdue round (CF-010)', () => {
  const item = (overrides: Record<string, unknown>) => ({
    kind: 'evaluation.leveling',
    recordId: 't1',
    tenderId: 't1',
    reference: 'TND-2026-0001',
    title: 'Civil',
    sinceUtc: '2026-09-29T10:00:00Z',
    reason: null,
    step: null,
    ...overrides,
  });

  function renderWork(items: Record<string, unknown>[]) {
    const { http } = configure();
    const panel = TestBed.createComponent(MyWorkPanel);
    panel.detectChanges();
    http.expectOne('/api/v1/dashboard/my-work').flush({
      generatedAtUtc: '2026-10-01T10:00:00Z',
      items,
      total: items.length,
      kinds: {},
    });
    panel.detectChanges();
    const element = panel.nativeElement as HTMLElement;
    return { http, element, rows: [...element.querySelectorAll('.my-work-list li')] };
  }

  it('lists a round past its deadline as work for the reader, linked to the negotiation page', () => {
    const { http, rows } = renderWork([
      item({
        kind: 'round.past_deadline',
        recordId: 'r2',
        tenderId: 't5',
        reference: 'TND-2026-0005',
        step: 2,
        dueAtUtc: '2026-09-29T10:00:00Z',
      }),
    ]);
    expect(rows.length).toBe(1);
    const link = rows[0].querySelector('a')!;
    expect(text(link).trim()).toBe('Negotiation round 2 past its deadline — close it');
    expect(link.getAttribute('href')).toBe('/tenders/t5/negotiation');
    expect(text(rows[0])).toContain('Overdue by 2 days');
    http.verify();
  });

  it('shows "Due" and the date before the due date, and no label without a due date', () => {
    const due = '2026-10-04T10:00:00Z';
    const { http, rows } = renderWork([
      item({ recordId: 'a', tenderId: 'a', dueAtUtc: due }),
      item({ recordId: 'b', tenderId: 'b' }),
      item({ recordId: 'c', tenderId: 'c', dueAtUtc: null }),
    ]);
    expect(rows.length).toBe(3);
    const [upcoming, none, nullDue] = rows.map((row) => text(row));
    const date = TestBed.inject(BusinessFormat).dateTime(due);
    expect(date).toMatch(/2026/);
    expect(upcoming).toContain(`Due ${date}`);
    expect(upcoming).not.toContain('Overdue');
    for (const shown of [none, nullDue]) {
      expect(shown).not.toMatch(/\bDue\b/);
      expect(shown).not.toContain('Overdue');
    }
    expect(rows[1].querySelector('.my-work-overdue')).toBeNull();
    http.verify();
  });

  it('names the two red-team handoffs: a closed round to take into the evaluation and a reopened closeout (B-001-5)', () => {
    const { http, element } = renderWork([
      item({
        kind: 'evaluation.refresh_required',
        recordId: 't7',
        tenderId: 't7',
        reference: 'TND-2026-0007',
        step: 2,
      }),
      item({ kind: 'closeout.reopened', recordId: 'a5', reason: 'assigned' }),
      item({ kind: 'closeout.reopened', recordId: 'a6', reason: 'unassigned' }),
      item({ kind: 'closeout.reopened', recordId: 'a7', reason: 'other_project' }),
    ]);
    const lists = [...element.querySelectorAll('.my-work .my-work-list')];
    expect(lists.length).toBe(2);
    const entries = (list: Element) =>
      [...list.querySelectorAll('li > a')].map((link) => [
        text(link).trim(),
        link.getAttribute('href'),
      ]);
    expect(entries(lists[0])).toEqual([
      ['Round closed — take its responses into the evaluation', '/tenders/t7/evaluation'],
      ['Closeout reopened for correction — correct it and finalize again', '/closeouts/a5'],
      ['Closeout reopened for correction — correct it and finalize again', '/closeouts/a6'],
    ]);
    expect(text(lists[0])).toContain('No Project Manager is assigned to this project.');
    // Reopened on another Project Manager's project: listed under Other projects, never as the reader's own work.
    expect(entries(lists[1])).toEqual([
      ['Closeout reopened for correction — correct it and finalize again', '/closeouts/a7'],
    ]);
    expect(text(lists[0])).not.toContain('ready to finalize');
    expect(text(lists[0])).not.toContain('evaluation.refresh_required');
    http.verify();
  });

  it('routes a tender past its deadline to the bid opening, for those who open bids (re-audit AW, H4)', () => {
    const { http, element } = renderWork([
      item({
        kind: 'tender.awaiting_opening',
        recordId: 't9',
        tenderId: 't9',
        reference: 'TND-2026-0009',
      }),
    ]);
    const link = element.querySelector('.my-work .my-work-list li > a')!;
    expect([text(link).trim(), link.getAttribute('href')]).toEqual([
      'Bidding closed — open the bids',
      '/tenders/t9/evaluation',
    ]);
    expect(text(element)).not.toContain('tender.awaiting_opening');
    http.verify();
  });
});

describe('Search page', () => {
  it('waits for two characters, then searches every visible type and offers the rest of a type', async () => {
    const { http, params } = configure({ q: 'a' });
    const page = TestBed.createComponent(SearchPage);
    page.detectChanges();
    http.expectNone('/api/v1/search');
    expect(text(page.nativeElement)).toContain('Type at least two characters');
    params.next(convertToParamMap({ q: 'ACME' }));
    page.detectChanges();
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/search');
    expect(request.request.params.get('q')).toBe('ACME');
    expect(request.request.params.has('type')).toBe(false);
    request.flush({
      query: 'ACME',
      type: null,
      groups: [
        {
          type: 'Subcontractors',
          total: 7,
          page: 1,
          pageSize: 5,
          items: [
            {
              type: 'Subcontractors',
              id: 's1',
              code: 'ACME-01',
              title: 'ACME Contracting',
              subtitle: 'Cairo',
              status: 'Active',
              category: null,
            },
          ],
        },
        { type: 'Tenders', total: 0, page: 1, pageSize: 5, items: [] },
      ],
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const shown = text(element);
    expect(shown).toContain('Subcontractors (7)');
    expect(shown).toContain('ACME Contracting');
    expect(shown).toContain('No match.');
    expect(element.querySelector('#search-group-Closeouts')).toBeNull();
    expect([...element.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toContain(
      '/subcontractors/s1',
    );
    expect(shown).toContain('Show all 7');
    http.verify();
  });
});

describe('Audit log page: erased people (CF-095)', () => {
  it('shows an erased user instead of any former name', () => {
    const { http } = configure({}, ['Audit.View']);
    const page = TestBed.createComponent(AuditLogPage);
    page.detectChanges();
    http.expectOne('/api/v1/admin/audit/facets').flush({ actions: [], actors: [] });
    const entry = {
      occurredAtUtc: '2026-09-29T09:00:00Z',
      actorKind: 'User',
      actorAccountId: 'u9',
      area: 'Identity',
      targetType: null,
      reference: null,
      details: [],
    };
    http
      .expectOne((candidate) => candidate.url === '/api/v1/admin/audit')
      .flush({
        items: [
          {
            ...entry,
            id: 'e1',
            actorName: 'Nadia Khalil',
            action: 'user.invitation_revoked',
            targetName: null,
            targetErased: true,
          },
          {
            ...entry,
            id: 'e2',
            actorName: null,
            actorErased: true,
            action: 'user.invitation_accepted',
            targetName: null,
          },
        ],
        page: 1,
        pageSize: 25,
        totalCount: 2,
        totalPages: 1,
      });
    page.detectChanges();
    const shown = text(page.nativeElement as HTMLElement);
    expect(shown).toContain('concerning an erased user');
    expect(shown).toContain('An erased user');
    expect(shown).not.toContain('A former member');
  });
});

describe('Audit log page', () => {
  it('sends the filters to the server, shows safe details and pages', async () => {
    const { http } = configure({}, ['Audit.View']);
    const page = TestBed.createComponent(AuditLogPage);
    page.detectChanges();
    http.expectOne('/api/v1/admin/audit/facets').flush({
      actions: ['award.issued'],
      actors: [{ accountId: 'u1', displayName: 'Nadia Khalil' }],
    });
    const first = http.expectOne((candidate) => candidate.url === '/api/v1/admin/audit');
    expect(first.request.params.get('page')).toBe('1');
    first.flush({
      items: [
        {
          id: 'e1',
          occurredAtUtc: '2026-09-29T09:00:00Z',
          actorKind: 'Bidder',
          actorName: null,
          actorAccountId: null,
          action: 'bid.submitted',
          area: 'Tendering',
          targetType: 'bid',
          reference: 'TND-2026-0001',
          details: [{ key: 'revision', value: '1' }],
        },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 30,
      totalPages: 2,
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    let shown = text(element);
    expect(shown).toContain('An invited firm (through its link)');
    // CF-100: the event reads by name; its code stays on hover.
    expect(shown).toContain('Bid submitted');
    expect(element.querySelector('.aud-action')?.getAttribute('title')).toBe('bid.submitted');
    expect(element.querySelector('a.aud-ref')?.getAttribute('href')).toBe(
      '/search?q=TND-2026-0001',
    );
    expect(shown).toContain('TND-2026-0001');
    expect(shown).toContain('Tendering and bids');
    expect(shown).toContain('Page 1 of 2');
    const component = page.componentInstance;
    component.area = 'Decision';
    component.actor = 'Bidder';
    component.reference = ' TND-2026-0001 ';
    component.from = '2026-09-01';
    component.apply();
    const filtered = http.expectOne((candidate) => candidate.url === '/api/v1/admin/audit');
    expect(filtered.request.params.get('area')).toBe('Decision');
    expect(filtered.request.params.get('actorKind')).toBe('Bidder');
    expect(filtered.request.params.get('reference')).toBe('TND-2026-0001');
    expect(filtered.request.params.get('from')).toBe('2026-09-01');
    filtered.flush({ items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
    page.detectChanges();
    shown = text(element);
    expect(shown).toContain('No entry matches these filters');
    http.verify();
  });
});

describe('Audit log page: request context (CF-122)', () => {
  it("shows the request an entry came from and lists that request's entries", () => {
    const { http } = configure({}, ['Audit.View']);
    const page = TestBed.createComponent(AuditLogPage);
    page.detectChanges();
    http.expectOne('/api/v1/admin/audit/facets').flush({ actions: [], actors: [] });
    const entry = {
      id: 'e1',
      occurredAtUtc: '2026-10-02T09:00:00Z',
      actorKind: 'User',
      actorName: 'Nadia Khalil',
      actorAccountId: 'u1',
      action: 'security_policy.changed',
      area: 'Identity',
      targetType: null,
      reference: null,
      details: [],
      targetName: null,
      request: {
        requestId: '0HNABC:00000002',
        sourceAddress: '203.0.113.9',
        userAgent: 'Mozilla/5.0 (Macintosh)',
      },
    };
    http
      .expectOne((candidate) => candidate.url === '/api/v1/admin/audit')
      .flush({
        items: [entry, { ...entry, id: 'e2', request: null }],
        page: 1,
        pageSize: 25,
        totalCount: 2,
        totalPages: 1,
      });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const requests = element.querySelectorAll('[data-testid="audit-request"]');
    expect(requests.length).toBe(1);
    expect(text(requests[0])).toContain('Request 0HNABC:00000002');
    expect(text(requests[0])).toContain('from 203.0.113.9');
    expect(text(requests[0])).toContain('Mozilla/5.0 (Macintosh)');
    (requests[0].querySelector('button') as HTMLButtonElement).click();
    const byRequest = http.expectOne((candidate) => candidate.url === '/api/v1/admin/audit');
    expect(byRequest.request.params.get('requestId')).toBe('0HNABC:00000002');
    expect(byRequest.request.params.get('area')).toBeNull();
    byRequest.flush({ items: [entry], page: 1, pageSize: 25, totalCount: 1, totalPages: 1 });
    http.verify();
  });

  it('says "Request not recorded" for a person\'s event without one, and nothing for the system (CF-122 AC8)', () => {
    const { http } = configure({}, ['Audit.View']);
    const page = TestBed.createComponent(AuditLogPage);
    page.detectChanges();
    http.expectOne('/api/v1/admin/audit/facets').flush({ actions: [], actors: [] });
    const base = {
      occurredAtUtc: '2026-10-02T09:00:00Z',
      actorAccountId: null,
      action: 'security_policy.changed',
      area: 'Identity',
      targetType: null,
      reference: null,
      details: [],
      targetName: null,
      request: null,
    };
    http
      .expectOne((candidate) => candidate.url === '/api/v1/admin/audit')
      .flush({
        items: [
          { ...base, id: 'u', actorKind: 'User', actorName: 'Nadia Khalil' },
          { ...base, id: 's', actorKind: 'System', actorName: null },
          { ...base, id: 'b', actorKind: 'Bidder', actorName: null },
        ],
        page: 1,
        pageSize: 25,
        totalCount: 3,
        totalPages: 1,
      });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const missing = [...element.querySelectorAll('[data-testid="audit-request-missing"]')];
    expect(missing).toHaveLength(1);
    expect(text(missing[0] as HTMLElement).trim()).toBe('Request not recorded');
    expect(text(missing[0].closest('li') as HTMLElement)).toContain('Nadia Khalil');
  });
});

describe('Intelligence read at its own precision (CF-026, CF-124, CF-125, CF-126)', () => {
  const sample = (count: number, median: string, minimum: string, maximum: string) => ({
    count,
    median,
    mean: median,
    minimum,
    maximum,
  });

  it('opens on the busiest category and shows a composite only for one category', async () => {
    const base = fullProfile();
    const { http, view, followUp, element } = await profile({
      ...base,
      delivery: { ...base.delivery!, outcomeScore: '82' },
    });
    expect(followUp.map((next) => next.request.params.get('category'))).toEqual(['MECHANICAL']);
    const composite = element.querySelector('[data-testid="intel-composite"]')!;
    expect(text(composite)).toContain('Composite for Mechanical');
    expect(text(composite)).toContain('82 / 100');
    // The reader's own choice of all categories stands, and no composite combines trades.
    view.componentInstance.scope = '*';
    view.componentInstance.choose();
    const all = http.expectOne(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    );
    expect(all.request.params.has('category')).toBe(false);
    all.flush({ ...base, delivery: { ...base.delivery!, outcomeScore: '82' } });
    view.detectChanges();
    expect(element.querySelector('[data-testid="intel-composite"]')).toBeNull();
    expect(text(element)).toContain('Choose a category to see its composite');
    http.verify();
  });

  it('opens on the category the reader came from, named by its text, in one read', () => {
    const { http } = configure();
    const view = TestBed.createComponent(SubcontractorIntelligenceView);
    view.componentRef.setInput('subcontractorId', 's1');
    view.componentRef.setInput('initialCategory', 'Mechanical');
    view.detectChanges();
    const request = http.expectOne(
      (candidate) => candidate.url === '/api/v1/intelligence/subcontractors/s1',
    );
    expect(request.request.params.get('category')).toBe('Mechanical');
    request.flush(scoped(fullProfile(), 'MECHANICAL'));
    view.detectChanges();
    expect(view.componentInstance.scope).toBe('MECHANICAL');
    http.verify();
  });

  it('rounds a figure to what its sample supports, exactly', () => {
    expect(centralAt(sample(1, '', '3.00', '3.00'), 'rating')).toBe('3');
    expect(centralAt(sample(2, '3.50', '3.00', '4.00'), 'rating')).toBe('3.5');
    expect(centralAt(sample(2, '6.67', '5.00', '8.33'), 'percent')).toBe('6.7');
    expect(centralAt(sample(5, '6.67', '5.00', '8.33'), 'percent')).toBe('6.67');
    expect(centralAt(sample(0, '', '', ''), 'percent')).toBeNull();
    expect(roundDecimal('2.45', 1)).toBe('2.5');
    expect(roundDecimal('-2.45', 1)).toBe('-2.5');
    expect(roundDecimal('-0.04', 1)).toBe('0.0');
    expect(roundDecimal('9.96', 1)).toBe('10.0');
    expect(samplePrecision(1, 'percent')).toBe(1);
  });

  it('shows two ratings as their median with the range, and a percentage of two at one decimal', async () => {
    const base = fullProfile();
    const { element } = await profile({
      ...base,
      delivery: {
        ...base.delivery!,
        quality: sample(2, '3.50', '3.00', '4.00'),
        costVariance: sample(2, '6.67', '5.00', '8.33'),
      },
    });
    const shown = text(element);
    expect(shown).toContain('3.5 / 5');
    expect(shown).toContain('median of 2 · 3–4');
    expect(shown).toContain('+6.7 %');
    expect(shown).not.toContain('6.67');
  });

  it('measures time to first bid against the bidding window, with elapsed time second', async () => {
    const base = fullProfile();
    const { element } = await profile({
      ...base,
      procurement: {
        ...base.procurement,
        hoursToFirstSubmission: sample(3, '0.15', '0.01', '0.29'),
        windowShareToFirstSubmission: sample(3, '42.4', '10.0', '90.0'),
      },
    });
    expect(text(element.querySelector('[data-testid="intel-window-share"]')!)).toContain(
      'uses 42 % of the bidding window',
    );
    expect(text(element)).toContain('Median of 3 submissions, measured against the deadline');
    // Unrounded hours: 0.15 h is 9 minutes, not the 12 a one-decimal 0.2 h would show.
    expect(text(element.querySelector('[data-testid="intel-elapsed"]')!)).toContain('9 min');
  });

  it('says one tender is not a typical share, and keeps elapsed time when no window is known', async () => {
    const base = fullProfile();
    const one = await profile({
      ...base,
      procurement: {
        ...base.procurement,
        windowShareToFirstSubmission: sample(1, '', '55.0', '55.0'),
      },
    });
    expect(text(one.element)).toContain('uses 55 % of the bidding window');
    expect(text(one.element)).toContain('One tender only — not a typical share.');
    TestBed.resetTestingModule();
    const unknown = await profile(base);
    expect(unknown.element.querySelector('[data-testid="intel-window-share"]')).toBeNull();
    expect(text(unknown.element)).toContain('One submission only — not a typical time.');
  });

  it('names why a bid was not compared', async () => {
    const base = fullProfile();
    const competitiveness = base.competitiveness!;
    const [first] = competitiveness.items;
    const notCompared = (tenderId: string, reason: string | null) => ({
      ...first,
      tenderId,
      tenderReference: tenderId,
      comparableBids: 1,
      leveledVersusMedianPercent: null,
      submittedVersusMedianPercent: null,
      notComparedReason: reason,
    });
    const { element } = await profile({
      ...base,
      competitiveness: {
        ...competitiveness,
        tenders: 3,
        compared: 0,
        items: [
          notCompared('TND-A', 'Ineligible'),
          notCompared('TND-B', 'OtherCurrency'),
          notCompared('TND-C', 'SingleComparableBid'),
        ],
      },
    });
    const shown = text(element);
    expect(shown).toContain('not compared — ineligible at recommendation');
    expect(shown).toContain('not compared — other currency');
    expect(shown).toContain('only one comparable bid');
  });
});

describe('Candidate evidence counts (CF-029, CF-030)', () => {
  it('splits similar projects within the category count and shows every answer beside the rate', () => {
    const { http } = configure();
    const view = TestBed.createComponent(CandidateEvidenceView);
    view.componentRef.setInput('workPackageId', 'wp2');
    view.componentRef.setInput('candidates', [
      { subcontractorId: 's1', code: 'ACME-01', legalName: 'ACME Contracting' },
    ]);
    view.detectChanges();
    http
      .expectOne(
        (candidate) => candidate.url === '/api/v1/intelligence/work-packages/wp2/candidates',
      )
      .flush({
        workPackageId: 'wp2',
        category: 'Mechanical',
        categoryMissing: false,
        access: { commercial: true, performance: true, decisions: false },
        rule: 'intelligence-metrics-v2',
        truncated: false,
        candidates: [
          {
            subcontractorId: 's1',
            validInvitations: 4,
            submitted: 2,
            declined: 1,
            noResponse: 1,
            reliabilityPercent: '50.0',
            completedProjects: 3,
            latestClosedAtUtc: '2026-09-01T10:00:00Z',
            strength: 'Moderate',
            dated: false,
            similarProjects: 3,
            similarComparableValueProjects: 2,
            similarSameProject: 1,
            onTime: 2,
            late: 1,
            wouldWorkAgainYes: 3,
            wouldWorkAgainConditional: 0,
            wouldWorkAgainNo: 0,
          },
        ],
      });
    view.detectChanges();
    const element = view.nativeElement as HTMLElement;
    expect(text(element)).not.toContain('Similar projects');
    expect(text(element.querySelector('[data-testid="candidate-similar"]')!)).toContain(
      'of which comparable value 2 · same project 1',
    );
    const responses = element.querySelector('[data-testid="candidate-responses"]')!;
    expect(text(responses)).toContain('submitted 2 · declined 1 · no response 1 (of 4 valid)');
    expect(responses.getAttribute('title')).toContain('counts submissions only');
    http.verify();
  });
});
