import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { SetupChecklist } from './setup-checklist';

const ALL_FEATURES = [
  'projects',
  'subcontractor_directory',
  'sourcing',
  'tendering',
  'evaluation',
  'award',
];

function configure(
  granted: string[],
  plan: string[] = ALL_FEATURES,
  account: { tenantId: string; userId: string } = { tenantId: 't1', userId: 'u1' },
) {
  const permissions = signal(granted);
  const features = signal(plan);
  const identity = signal<{ tenantId: string; userId: string } | null>(account);
  TestBed.configureTestingModule({
    imports: [SetupChecklist],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: SessionService,
        useValue: {
          hasPermission: (permission: string) => permissions().includes(permission),
          identity,
        },
      },
      {
        provide: EntitlementsService,
        useValue: { has: (feature: string) => features().includes(feature) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SetupChecklist);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), permissions, features, identity };
}

const ADMIN = [
  'Users.Invite',
  'Trades.Manage',
  'Subcontractors.Create',
  'Evaluation.ManagePolicy',
  'Recommendation.ManagePolicy',
  'Award.ManageApprovalMatrix',
];

describe('SetupChecklist (CF-013)', () => {
  it('lists each step from what is recorded, in order, with the optional approval rules apart', () => {
    const { fixture, http } = configure(ADMIN);
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }, { status: 'Invited' }]);
    http.expectOne('/api/v1/trades').flush([{ isActive: true }]);
    http.expectOne((request) => request.url === '/api/v1/subcontractors').flush({ totalCount: 0 });
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Inactive' }]);
    http.expectOne('/api/v1/recommendation-policies').flush([{ status: 'Active' }]);
    http.expectOne('/api/v1/approval-rules').flush({ rules: [] });
    fixture.detectChanges();
    http.verify();

    const element = fixture.nativeElement as HTMLElement;
    const items = Array.from(element.querySelectorAll('li'));
    expect(items.map((item) => item.querySelector('a')?.textContent?.trim())).toEqual([
      'Invite your team',
      'Set up your trade list',
      'Add or import your subcontractors',
      'Activate a scorecard policy',
      'Activate a recommendation policy',
      'Review the approval rules',
    ]);
    expect(items.map((item) => item.classList.contains('is-done'))).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
    ]);
    expect(items[5].textContent).toContain('(optional)');
    // The optional step never counts towards (or against) the progress.
    expect(element.textContent).toContain('3 of 5 steps done');
    expect(items[3].querySelector('a')?.getAttribute('href')).toBe('/evaluation-policies');
  });

  it('shows only the steps this person may do and the plan includes', () => {
    const { fixture, http } = configure(
      ['Users.Invite', 'Evaluation.ManagePolicy'],
      ['projects', 'subcontractor_directory'],
    );
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }]);
    http.verify();
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Invite your team');
  });

  it('reads its steps once the session and the plan arrive after the page renders (a full page load)', () => {
    const { fixture, http, permissions, features } = configure([], []);
    http.verify();
    permissions.set(['Users.Invite', 'Trades.Manage']);
    fixture.detectChanges();
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }]);
    http.verify();
    features.set(ALL_FEATURES);
    fixture.detectChanges();
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }]);
    http.expectOne('/api/v1/trades').flush([]);
    fixture.detectChanges();
    http.verify();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('li').length).toBe(2);
  });

  it('asks nothing for someone without a setup permission', () => {
    const { fixture, http } = configure(['Projects.View']);
    http.verify();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="setup-checklist"]'),
    ).toBeNull();
  });

  it('disappears once every required step is done, and leaves out a step it cannot read', () => {
    const { fixture, http } = configure([
      'Users.Invite',
      'Trades.Manage',
      'Award.ManageApprovalMatrix',
    ]);
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }, { status: 'Active' }]);
    http
      .expectOne('/api/v1/trades')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/approval-rules').flush({ rules: [] });
    fixture.detectChanges();
    http.verify();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="setup-checklist"]'),
    ).toBeNull();
  });

  it('does not count a suspended account as the team', () => {
    const { fixture, http } = configure(['Users.Invite']);
    http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }, { status: 'Suspended' }]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('li')?.classList.contains('is-done')).toBe(false);
    expect(element.textContent).toContain('0 of 1 steps done');
  });
});

/**
 * CF-013 AC1 (B-013-1): each item is derived on the client from an existing endpoint (ADR-165), so this is the item's per-item test: the first
 * load answers with the endpoint's real "not done" shape, the next load (a new page) with the "done" shape, and the item flips.
 */
describe('SetupChecklist items flip on the next load (CF-013 AC1)', () => {
  type Shape = object;
  interface Case {
    readonly key: string;
    readonly label: string;
    readonly url: string;
    readonly notDone: Shape;
    readonly done: Shape;
  }
  const cases: readonly Case[] = [
    {
      key: 'users',
      label: 'Invite your team',
      url: '/api/v1/admin/users',
      notDone: [{ status: 'Active' }],
      done: [{ status: 'Active' }, { status: 'Invited' }],
    },
    {
      key: 'trades',
      label: 'Set up your trade list',
      url: '/api/v1/trades',
      notDone: [],
      done: [{ isActive: true }],
    },
    {
      key: 'subcontractors',
      label: 'Add or import your subcontractors',
      url: '/api/v1/subcontractors',
      notDone: { totalCount: 0 },
      done: { totalCount: 1 },
    },
    {
      key: 'scorecard',
      label: 'Activate a scorecard policy',
      url: '/api/v1/evaluation-policies',
      notDone: [{ status: 'Inactive' }],
      done: [{ status: 'Active' }],
    },
    {
      key: 'recommendation',
      label: 'Activate a recommendation policy',
      url: '/api/v1/recommendation-policies',
      notDone: [{ status: 'Inactive' }],
      done: [{ status: 'Active' }],
    },
    {
      key: 'approvals',
      label: 'Review the approval rules',
      url: '/api/v1/approval-rules',
      notDone: { rules: [] },
      done: { rules: [{}] },
    },
  ];

  afterEach(() => TestBed.resetTestingModule());

  /** One page load for a person who may do every step: every other step answers "not done", so the card stays visible. */
  function load(flipped: Case, state: 'notDone' | 'done') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SetupChecklist],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            hasPermission: (permission: string) => ADMIN.includes(permission),
            identity: () => ({ userId: 'u1', tenantId: 't1', roles: [], permissions: ADMIN }),
          },
        },
        {
          provide: EntitlementsService,
          useValue: { has: (feature: string) => ALL_FEATURES.includes(feature) },
        },
      ],
    });
    const fixture = TestBed.createComponent(SetupChecklist);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const step of cases)
      http
        .expectOne((request) => request.url === step.url)
        .flush(step === flipped ? step[state] : step.notDone);
    fixture.detectChanges();
    http.verify();
    const item = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].find(
      (candidate) => candidate.querySelector('a')?.textContent?.trim() === flipped.label,
    );
    expect(item, flipped.key).toBeDefined();
    return item!;
  }

  it.each(cases.map((step) => [step.key, step] as const))(
    '%s is not done on the first load and done on the next',
    (_key, step) => {
      const before = load(step, 'notDone');
      expect(before.classList.contains('is-done')).toBe(false);
      expect(before.textContent).not.toContain('done');
      const after = load(step, 'done');
      expect(after.classList.contains('is-done')).toBe(true);
      expect(after.querySelector('.prj-visually-hidden')?.textContent?.trim()).toBe('done');
    },
  );

  describe('Hide these steps (CF-013 AC4b)', () => {
    const flushAll = (http: HttpTestingController) => {
      http.expectOne('/api/v1/admin/users').flush([{ status: 'Active' }]);
      http.expectOne('/api/v1/trades').flush([]);
      http
        .expectOne((request) => request.url === '/api/v1/subcontractors')
        .flush({ totalCount: 0 });
      http.expectOne('/api/v1/evaluation-policies').flush([]);
      http.expectOne('/api/v1/recommendation-policies').flush([]);
      http.expectOne('/api/v1/approval-rules').flush({ rules: [] });
    };
    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('hides the card for this account, remembers it, reads nothing and offers the steps back', () => {
      const { fixture, http } = configure(ADMIN);
      flushAll(http);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const hide = [...element.querySelectorAll('button')].find(
        (button) => button.textContent!.trim() === 'Hide these steps',
      )!;
      hide.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="setup-checklist"]')).toBeNull();
      expect(localStorage.getItem('si.setup-dismissed:t1:u1')).toBe('1');
      expect(element.querySelector('[data-testid="setup-restore"]')!.textContent!.trim()).toBe(
        'Show the setup steps',
      );
      http.verify();

      // The next visit (a new component) reads nothing while hidden.
      TestBed.resetTestingModule();
      const again = configure(ADMIN);
      again.http.verify();
      const restore = (again.fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="setup-restore"] button',
      )!;
      restore.click();
      again.fixture.detectChanges();
      expect(localStorage.getItem('si.setup-dismissed:t1:u1')).toBeNull();
      flushAll(again.http);
      again.fixture.detectChanges();
      expect(
        (again.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="setup-checklist"]',
        ),
      ).not.toBeNull();
    });

    it('keeps the card for another account in the same browser', () => {
      localStorage.setItem('si.setup-dismissed:t1:u1', '1');
      const { fixture, http } = configure(ADMIN, ALL_FEATURES, { tenantId: 't1', userId: 'u2' });
      flushAll(http);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="setup-checklist"]'),
      ).not.toBeNull();
    });

    it('still shows the card when storage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const { fixture, http } = configure(ADMIN);
      flushAll(http);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="setup-checklist"]')).not.toBeNull();
      // Hiding still works for this page.
      [...element.querySelectorAll('button')]
        .find((button) => button.textContent!.trim() === 'Hide these steps')!
        .click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="setup-checklist"]')).toBeNull();
    });
  });
});
