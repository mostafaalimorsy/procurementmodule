import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WorkspaceShell } from './workspace-shell';
import { EntitlementsService } from '../core/auth/entitlements.service';
import { SessionService } from '../core/auth/session.service';

function signIn(permissions: readonly string[] = ['Projects.View']) {
  const session = TestBed.inject(SessionService);
  (
    session as unknown as { currentIdentity: { set: (value: unknown) => void } }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't1',
    roles: ['CompanyAdmin'],
    permissions,
  });
}

describe('Workspace shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceShell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('shows the read-only grace on every page while it lasts (CF-061)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({
      userId: 'u1',
      tenantId: 't1',
      roles: ['CompanyAdmin'],
      permissions: ['Projects.View'],
      readOnlyUntilUtc: '2026-11-01T09:00:00Z',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    for (const request of http.match(() => true)) request.flush({ features: [] });
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('[data-testid="read-only-banner"]');
    expect(banner?.textContent).toContain('Read-only until');
    expect(banner?.textContent).toContain('nothing can be created, changed or sent');
  });

  it('remains usable when authentication is unavailable', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    // Without a session there is no company, so entitlements are never requested and the shell still
    // renders. Navigation offers nothing that has not been purchased and permitted.
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Projects');
    // The company workspace never advertises the operator back office.
    expect(fixture.nativeElement.querySelector('a[href^="/platform"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Platform');
    expect(fixture.nativeElement.querySelector('main').id).toBe('main-content');
    http.verify();
  });

  it('loads entitlements when a session begins, so purchased navigation appears without a reload', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Projects');

    // The user signs in. The shell must react to the new identity rather than to its own startup.
    signIn();
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/projects"]')).toBeTruthy();
    expect(TestBed.inject(EntitlementsService).has('projects')).toBe(true);
    http.verify();
  });

  it('says where the plan\u2019s workflow ends when it stops before the full loop (CF-060)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn();
    fixture.detectChanges();
    await fixture.whenStable();
    http
      .expectOne('/api/v1/company/features')
      .flush({ features: ['projects', 'tendering', 'evaluation'], workflowEndsAt: 'evaluation' });
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('[data-testid="workflow-end-banner"]');
    expect(banner?.textContent).toContain('Your plan ends at evaluation');
  });

  it('keeps Projects hidden for a company whose plan does not include it', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    signIn();
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/projects"]')).toBeNull();
    expect(TestBed.inject(EntitlementsService).has('projects')).toBe(false);
    http.verify();
  });

  it('hides Projects from a signed-in user who lacks the permission, even when the plan includes it', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    signIn(['session.read']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/projects"]')).toBeNull();
    http.verify();
  });

  it('shows Subcontractors only when the plan includes the directory and the user may view it', async () => {
    const cases: [readonly string[], readonly string[], boolean][] = [
      [['Subcontractors.View'], ['subcontractor_directory'], true],
      [['Subcontractors.View'], ['projects'], false],
      [['Projects.View'], ['subcontractor_directory'], false],
    ];
    for (const [permissions, features, visible] of cases) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [WorkspaceShell],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(WorkspaceShell);
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
      await fixture.whenStable();
      signIn(permissions);
      fixture.detectChanges();
      await fixture.whenStable();
      http.expectOne('/api/v1/company/features').flush({ features });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('a[href="/subcontractors"]') !== null).toBe(
        visible,
      );
    }
  });

  it('shows Company users only when the server grants the user-directory permission', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    signIn(['Projects.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin/users"]')).toBeNull();

    signIn(['Users.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin/users"]')).not.toBeNull();
    http.verify();
  });

  it('keeps configuration under Settings, apart from the work areas, with labels that name the page (CF-012, CF-133)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    // A Technical Evaluator reads the scorecard policies (CF-133); nothing else of Settings.
    signIn(['Projects.View', 'Tenders.View', 'Evaluation.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({
      features: ['projects', 'subcontractor_directory', 'sourcing', 'tendering', 'evaluation'],
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const nav = element.querySelector('nav.primary-nav')!;
    const topLevel = [...nav.children].map((child) => child.tagName.toLowerCase());
    expect(topLevel).toContain('details');
    const settings = nav.querySelector('details.nav-settings')!;
    expect(settings.querySelector('summary')!.textContent!.trim()).toBe('Settings');
    const scorecards = settings.querySelector('a[href="/evaluation-policies"]')!;
    expect(scorecards.textContent!.trim()).toBe('Scorecard policies');
    expect(nav.querySelector(':scope > a[href="/evaluation-policies"]')).toBeNull();
    expect(settings.querySelector('a[href="/admin/audit"]')).toBeNull();

    // An approver reads the approval rules that route their work (the read view), under the page's own name.
    signIn(['Projects.View', 'Decision.View', 'Award.Approve']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({
      features: [
        'projects',
        'subcontractor_directory',
        'sourcing',
        'tendering',
        'evaluation',
        'award',
      ],
    });
    fixture.detectChanges();
    const rules = element.querySelector<HTMLAnchorElement>(
      'details.nav-settings a[href="/approval-matrix/read"]',
    )!;
    expect(rules.textContent!.trim()).toBe('Approval rules');
    expect(
      element
        .querySelector('details.nav-settings a[href="/recommendation-policies"]')!
        .textContent!.trim(),
    ).toBe('Recommendation policies');
  });

  it('purges rendered protected content and replaces the route as soon as logout starts', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    signIn(['Projects.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    const protectedData = document.createElement('p');
    protectedData.textContent = 'CONFIDENTIAL PROJECT VALUE';
    fixture.nativeElement.querySelector('router-outlet').append(protectedData);
    expect(fixture.nativeElement.textContent).toContain('CONFIDENTIAL PROJECT VALUE');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.nativeElement.querySelector('button.shell-signout').click();
    fixture.detectChanges();

    expect(TestBed.inject(SessionService).identity()).toBeNull();
    expect(TestBed.inject(EntitlementsService).features()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('CONFIDENTIAL PROJECT VALUE');
    expect(fixture.nativeElement.textContent).toContain('Signing out securely');
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });

    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/logout').flush(null);
    http.expectOne('/api/v1/auth/csrf').flush(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('CONFIDENTIAL PROJECT VALUE');
    http.verify();
  });

  it('clears entitlements when the session ends', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    signIn();
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/projects"]')).toBeTruthy();

    // Signing out must take the purchased navigation with it.
    TestBed.inject(SessionService).clear();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(TestBed.inject(EntitlementsService).has('projects')).toBe(false);
    expect(fixture.nativeElement.querySelector('a[href="/projects"]')).toBeNull();
    http.verify();
  });

  it('marks the current section with aria-current and discloses the small-screen menu', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn(['Projects.View', 'Users.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();

    const overview = fixture.nativeElement.querySelector(
      '.primary-nav a[href="/"]',
    ) as HTMLAnchorElement;
    expect(overview.getAttribute('aria-current')).toBe('page');
    expect(overview.classList).toContain('is-active');
    const projects = fixture.nativeElement.querySelector(
      'a[href="/projects"]',
    ) as HTMLAnchorElement;
    expect(projects.hasAttribute('aria-current')).toBe(false);

    const toggle = fixture.nativeElement.querySelector('.menu-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-controls')).toBe('workspace-menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#workspace-menu').classList).toContain('is-open');
    // Sign out stays a real button inside the account area, never a link.
    expect(fixture.nativeElement.querySelector('.account button.shell-signout')).not.toBeNull();
    http.verify();
  });
  it('asks before signing out on all devices, and Escape keeps the sessions (CF-087)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn(['Projects.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const button = element.querySelector<HTMLButtonElement>('button.shell-signout--all')!;
    button.focus();
    button.click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('h2')!.textContent!.trim()).toBe('Sign out on all devices?');
    expect(dialog.textContent).toContain('Every session of your account ends');
    const actions = [...dialog.querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(actions).toEqual(['Sign out on all devices', 'Stay signed in']);
    // Nothing is sent and nobody is signed out until the reader confirms.
    http.expectNone(() => true);
    expect(TestBed.inject(SessionService).identity()).not.toBeNull();

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(TestBed.inject(SessionService).identity()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    http.verify();
  });

  it('closes only the sign-out dialog on Escape with the phone menu open, and returns focus to its opener (re-audit N)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn(['Projects.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.menu-toggle')!;
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('#workspace-menu')!.classList).toContain('is-open');

    const button = element.querySelector<HTMLButtonElement>('button.shell-signout--all')!;
    button.focus();
    button.click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    // The menu stays open and focus is back on the button that opened the dialog, not on the menu toggle.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('#workspace-menu')!.classList).toContain('is-open');
    expect(document.activeElement).toBe(button);

    // A second Escape, with no dialog, collapses the menu and returns focus to its toggle.
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    http.verify();
  });

  it('ends every session once "Sign out on all devices" is confirmed (CF-087)', async () => {
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn(['Projects.View']);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    element.querySelector<HTMLButtonElement>('button.shell-signout--all')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[role="dialog"] button.prj-btn--danger')!.click();
    fixture.detectChanges();

    expect(TestBed.inject(SessionService).identity()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    http.expectOne('/api/v1/auth/csrf').flush(null);
    const logout = http.expectOne('/api/v1/auth/logout?everywhere=true');
    expect(logout.request.method).toBe('POST');
    logout.flush(null);
    http.expectOne('/api/v1/auth/csrf').flush(null);
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    http.verify();
  });
  /** The permission sets of the matrix (backend AccessContracts.cs TenantRbac.Matrix), copied exactly. */
  const COMPANY_ADMIN = [
    'session.read',
    'Users.View',
    'Users.Invite',
    'Users.ChangeRole',
    'Users.Suspend',
    'Users.ResetPassword',
    'Projects.View',
    'Projects.Create',
    'Projects.Edit',
    'Projects.ChangeStatus',
    'WorkPackages.View',
    'WorkPackages.Create',
    'WorkPackages.Edit',
    'WorkPackages.ChangeStatus',
    'WorkPackages.ViewEstimate',
    'Subcontractors.View',
    'Subcontractors.Create',
    'Subcontractors.Edit',
    'Subcontractors.ChangeStatus',
    'Subcontractors.Block',
    'Subcontractors.Import',
    'Trades.Manage',
    'Compliance.ManageTypes',
    'Compliance.Record',
    'Compliance.SetVendorStatus',
    'Sourcing.View',
    'Sourcing.Manage',
    'Sourcing.Prequalify',
    'Sourcing.ApproveShortlist',
    'Tenders.View',
    'Tenders.Create',
    'Tenders.Edit',
    'Tenders.Publish',
    'Tenders.ManageInvitations',
    'Tenders.Cancel',
    'Tenders.ManageClarifications',
    'Tenders.DraftAddenda',
    'Tenders.IssueAddenda',
    'Tenders.ExtendDeadline',
    'Tenders.CloseEarly',
    'Evaluation.View',
    'Evaluation.OpenBids',
    'Evaluation.ViewTechnical',
    'Evaluation.ViewCommercial',
    'Evaluation.TechnicalScore',
    'Evaluation.CommercialLevel',
    'Evaluation.ManagePolicy',
    'Evaluation.Complete',
    'Negotiation.Manage',
    'Negotiation.Note',
    'Decision.View',
    'Recommendation.ManagePolicy',
    'Recommendation.Compute',
    'Decision.Prepare',
    'Decision.OverrideRecommendation',
    'Decision.Submit',
    'Award.Approve',
    'Award.Issue',
    'Award.ManageApprovalMatrix',
    'Performance.View',
    'Performance.EditCommercial',
    'Performance.EditExecution',
    'Performance.Finalize',
    'Performance.Reopen',
    'Intelligence.View',
    'Intelligence.ViewCommercial',
    'Audit.View',
    'Metrics.View',
    'Company.ManageData',
    'CompanyEmail.Manage',
    'CompanyProfile.Manage',
  ];
  const DIRECTOR = [
    'session.read',
    'Projects.View',
    'WorkPackages.View',
    'WorkPackages.ViewEstimate',
    'Subcontractors.View',
    'Sourcing.View',
    'Tenders.View',
    'Evaluation.View',
    'Evaluation.ViewTechnical',
    'Evaluation.ViewCommercial',
    'Decision.View',
    'Award.Approve',
    'Performance.View',
    'Intelligence.View',
    'Intelligence.ViewCommercial',
    'Metrics.View',
  ];
  const FULL_PLAN = [
    'projects',
    'subcontractor_directory',
    'sourcing',
    'tendering',
    'evaluation',
    'award',
    'performance',
    'intelligence',
  ];

  async function signedInShell(permissions: readonly string[], routes = false) {
    if (routes) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [WorkspaceShell],
        providers: [
          provideRouter([{ path: '**', children: [] }]),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });
    }
    const fixture = TestBed.createComponent(WorkspaceShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    signIn(permissions);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/v1/company/features').flush({ features: FULL_PLAN });
    fixture.detectChanges();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('keeps the main row to at most eight items for the Company Admin (CF-012 AC2)', async () => {
    const { element } = await signedInShell(COMPANY_ADMIN);
    const nav = element.querySelector('nav.primary-nav')!;
    const top = [...nav.children];
    expect(top.length).toBeLessThanOrEqual(8);
    expect(
      top.map((item) => (item.tagName === 'DETAILS' ? 'Settings' : item.getAttribute('href'))),
    ).toEqual([
      '/',
      '/projects',
      '/subcontractors',
      '/sourcing',
      '/tenders',
      '/closeouts',
      '/search',
      'Settings',
    ]);
    expect(nav.querySelector(':scope > a[href="/pilot-metrics"]')).toBeNull();
    expect(nav.querySelector('a[href="/retrospective-outcomes"]')).toBeNull();
    expect(nav.querySelector('details.nav-settings a[href="/pilot-metrics"]')).not.toBeNull();
    const settings = [...nav.querySelectorAll('details.nav-settings a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(settings.indexOf('/pilot-metrics')).toBe(settings.indexOf('/admin/audit') + 1);
  });

  it('marks Closeouts as the area of the past outcomes, without claiming the page (CF-012 AC2)', async () => {
    const { fixture, element } = await signedInShell(COMPANY_ADMIN, true);
    await TestBed.inject(Router).navigateByUrl('/retrospective-outcomes');
    fixture.detectChanges();
    const closeouts = element.querySelector('nav.primary-nav a[href="/closeouts"]')!;
    expect(closeouts.classList).toContain('is-active');
    expect(closeouts.hasAttribute('aria-current')).toBe(false);
    await TestBed.inject(Router).navigateByUrl('/closeouts');
    fixture.detectChanges();
    expect(closeouts.getAttribute('aria-current')).toBe('page');
  });

  it('closes an open Settings disclosure when the address changes, and only then (final gate)', async () => {
    const { fixture, element } = await signedInShell(COMPANY_ADMIN, true);
    await TestBed.inject(Router).navigateByUrl('/closeouts');
    fixture.detectChanges();
    await fixture.whenStable();
    const details = element.querySelector<HTMLDetailsElement>('details.nav-settings')!;
    details.querySelector<HTMLElement>('summary')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(details.open).toBe(true);
    await TestBed.inject(Router).navigateByUrl('/retrospective-outcomes');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(details.open).toBe(false);
  });

  it('a Director sees only the Settings entries it can open (CF-012 AC3)', async () => {
    const { element } = await signedInShell(DIRECTOR);
    const hrefs = [...element.querySelectorAll('details.nav-settings a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      '/evaluation-policies',
      '/recommendation-policies',
      '/approval-matrix/read',
      '/pilot-metrics',
    ]);
    expect(hrefs.some((href) => href!.startsWith('/admin/'))).toBe(false);
    expect(hrefs).not.toContain('/approval-matrix');
  });

  it('closes the Settings disclosure on Escape and returns focus to its summary (CF-012 AC5)', async () => {
    const { fixture, element } = await signedInShell(DIRECTOR);
    document.body.appendChild(element);
    const details = element.querySelector<HTMLDetailsElement>('details.nav-settings')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    summary.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(details.open).toBe(true);
    const link = details.querySelector<HTMLAnchorElement>('a')!;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    element.remove();
  });
});
