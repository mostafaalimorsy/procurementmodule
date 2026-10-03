import { InvalidSubmitFocus } from '../../core/a11y/invalid-submit-focus';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { ProjectDetailPage } from './project-detail';
import { ProjectForm } from './project-form';
import { ProjectsList } from './projects-list';
import { WorkPackageDetailPage } from './work-package-detail';
import { WorkPackageForm } from './work-package-form';
import {
  Paged,
  ProjectDetail,
  ProjectSummary,
  ProjectsApi,
  WorkPackageDetail,
  WorkPackageSummary,
  projectProblemMessage,
} from './projects.api';

const ALL_PERMISSIONS = [
  'Projects.View',
  'Projects.Create',
  'Projects.Edit',
  'Projects.ChangeStatus',
  'WorkPackages.View',
  'WorkPackages.Create',
  'WorkPackages.Edit',
  'WorkPackages.ChangeStatus',
  'WorkPackages.ViewEstimate',
];

const summary: ProjectSummary = {
  id: 'p1',
  code: 'CMC-2026',
  name: 'Cairo Medical Complex Expansion',
  clientName: 'Cairo Health Authority',
  location: 'New Cairo',
  status: 'Active',
  currency: 'EGP',
  startDate: '2026-03-01',
  expectedEndDate: '2027-06-30',
  actualEndDate: null,
  projectManagerName: 'Nadia Fouad',
  procurementOwnerName: null,
  workPackageCount: 4,
  updatedAtUtc: '2026-03-02T10:00:00Z',
  version: 'v1',
};

const detail: ProjectDetail = {
  ...summary,
  description: 'Two new wings.',
  projectManagerAccountId: 'u1',
  procurementOwnerAccountId: null,
  allowedNextStatuses: ['OnHold', 'Completed', 'Cancelled'],
  draftWorkPackageCount: 4,
  consumesCapacity: true,
  createdAtUtc: '2026-03-01T08:00:00Z',
  createdBy: 'u1',
  updatedBy: 'u1',
};

const emptyPage: Paged<ProjectSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 0,
};

const onePage: Paged<ProjectSummary> = {
  ...emptyPage,
  items: [summary],
  totalCount: 1,
  totalPages: 1,
};

const packagePage: Paged<WorkPackageSummary> = {
  items: [
    {
      id: 'w1',
      projectId: 'p1',
      code: 'HVAC-01',
      title: 'HVAC Installation',
      category: 'Mechanical',
      estimatedValue: '4250000.00',
      currency: 'EGP',
      status: 'Draft',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2027-02-28',
      updatedAtUtc: '2026-03-02T10:00:00Z',
      version: 'wv1',
      estimateVisible: true,
      tradeId: 'tr-mech',
      tradeCode: 'MECH',
    },
  ],
  page: 1,
  pageSize: 20,
  totalCount: 1,
  totalPages: 1,
};

function configure(
  permissions: readonly string[] = ALL_PERMISSIONS,
  routeParams: Record<string, string> = {},
  roles: readonly string[] = ['CompanyAdmin'],
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // Stubs for the destinations the components navigate to after a successful save, so a
      // navigation in a test resolves instead of surfacing as an unhandled rejection.
      provideRouter([
        { path: 'projects', children: [] },
        { path: 'projects/:id', children: [] },
        { path: 'work-packages/:packageId', children: [] },
      ]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (key: string) => routeParams[key] ?? null } } },
      },
    ],
  });
  const session = TestBed.inject(SessionService);
  (
    session as unknown as { currentIdentity: { set: (value: unknown) => void } }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't1',
    roles,
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

describe('projects list', () => {
  it('shows a guiding empty state and offers creation only with the permission', () => {
    const http = configure();
    const fixture: ComponentFixture<ProjectsList> = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/projects').flush(emptyPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No projects yet');
    expect(text).toContain('Create the first project');
    http.verify();
  });

  it('hides the create action from a user who may only view', () => {
    const http = configure(['Projects.View']);
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/projects').flush(emptyPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Create the first project');
    expect(text).toContain('Ask a Procurement Manager');
    http.verify();
  });

  it('sends search, status, paging and sorting to the server rather than filtering locally', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/projects').flush(onePage);
    fixture.detectChanges();

    fixture.componentInstance.search = 'cairo';
    fixture.componentInstance.status = 'Active';
    fixture.componentInstance.applyFilters();
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/projects');
    expect(request.request.params.get('search')).toBe('cairo');
    expect(request.request.params.get('status')).toBe('Active');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(onePage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('CMC-2026');
    http.verify();
  });

  it('opens a Project Manager on the projects they manage, with the whole portfolio one click away', async () => {
    // CF-036: the list defaults to the assigned projects for the Project Manager role only.
    const http = configure(ALL_PERMISSIONS, {}, ['ProjectManager']);
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    const first = http.expectOne((request) => request.url === '/api/v1/projects');
    expect(first.request.params.get('projectManager')).toBe('u1');
    first.flush(onePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const mine = element.querySelector<HTMLInputElement>('input[name="mine"]')!;
    expect(mine.checked).toBe(true);
    fixture.componentInstance.clearFilters();
    const all = http.expectOne((request) => request.url === '/api/v1/projects');
    expect(all.request.params.has('projectManager')).toBe(false);
    all.flush(onePage);
    http.verify();
  });

  it('opens a Project Manager on their projects when the session arrives after the first render', async () => {
    // Runtime validation D4: on a full page load (refresh, deep link) the identity is not yet known when the list first loads.
    const http = configure(ALL_PERMISSIONS, {}, ['ProjectManager']);
    const session = TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    };
    session.currentIdentity.set(null);
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    const early = http.expectOne((request) => request.url === '/api/v1/projects');
    expect(early.request.params.has('projectManager')).toBe(false);
    session.currentIdentity.set({
      userId: 'u1',
      tenantId: 't1',
      roles: ['ProjectManager'],
      permissions: ALL_PERMISSIONS,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const mine = http.expectOne((request) => request.url === '/api/v1/projects');
    expect(mine.request.params.get('projectManager')).toBe('u1');
    mine.flush(onePage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="mine"]')!
        .checked,
    ).toBe(true);
    http.verify();
  });

  it('never filters the portfolio by manager for other roles', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/projects');
    expect(request.request.params.has('projectManager')).toBe(false);
    request.flush(onePage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('input[name="mine"]')).toBeNull();
    http.verify();
  });

  it('reports a failure and offers a retry instead of showing an empty portfolio', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectsList);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects')
      .flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('could not be completed');
    expect(text).toContain('Try again');
    http.verify();
  });
});

/** The project form reads the currency catalogue and the company default (Part 7). */
function flushCompany(http: HttpTestingController, defaultCurrency: string | null = 'QAR') {
  http.expectOne('/api/v1/company/currencies').flush([
    { code: 'EGP', name: 'Egyptian Pound', minorUnits: 2 },
    { code: 'QAR', name: 'Qatari Rial', minorUnits: 2 },
    { code: 'USD', name: 'US Dollar', minorUnits: 2 },
  ]);
  http.expectOne('/api/v1/company/profile').flush({
    companyName: 'Delta',
    defaultCurrency,
    hasLogo: false,
    logoContentType: null,
    logoWidth: null,
    logoHeight: null,
    logoUpdatedAtUtc: null,
    canManage: true,
    version: '00000000-0000-0000-0000-000000000000',
  });
}

describe('project form', () => {
  it('refuses to submit an invalid code, name or date order', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http);
    fixture.detectChanges();

    const form = fixture.componentInstance;
    form.code = 'A';
    form.name = '';
    form.save();
    expect(form.codeInvalid).toBe(true);
    expect(form.nameInvalid).toBe(true);

    form.code = 'BAD CODE';
    expect(form.codeInvalid).toBe(true);

    form.code = 'CMC-2026';
    form.name = 'Cairo Medical';
    form.startDate = '2027-01-01';
    form.expectedEndDate = '2026-01-01';
    expect(form.datesOutOfOrder).toBe(true);
    form.save();

    form.currency = 'EGPP';
    expect(form.currencyInvalid).toBe(true);

    // Nothing was ever sent while the form was invalid.
    http.verify();
  });

  it('creates a project with trimmed values in the company default currency', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http, 'QAR');

    const form = fixture.componentInstance;
    // No currency is hard-coded: the form starts from the company's own default.
    expect(form.currency).toBe('QAR');
    form.code = ' cmc-2026 ';
    form.name = '  Cairo Medical Complex  ';
    form.clientName = '';
    form.save();

    const request = http.expectOne('/api/v1/projects');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.code).toBe('cmc-2026');
    expect(request.request.body.name).toBe('Cairo Medical Complex');
    expect(request.request.body.currency).toBe('QAR');
    // Empty optional fields are sent as null, not as empty strings.
    expect(request.request.body.clientName).toBeNull();
    request.flush(detail);
    http.verify();
  });

  it('asks for a currency when the company has no default and never guesses one', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http, null);
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.componentInstance;
    expect(form.currency).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Your company has no default currency yet',
    );
    form.code = 'CMC-2026';
    form.name = 'Cairo Medical';
    fixture.detectChanges();
    await fixture.whenStable();
    form.save();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.currencyInvalid).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Choose the project's currency.",
    );
    const select = (fixture.nativeElement as HTMLElement).querySelector(
      'select#currency',
    ) as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toContain('USD');
    select.value = 'USD';
    select.dispatchEvent(new Event('change'));
    expect(form.currency).toBe('USD');
    http.verify();
  });

  it('shows predefined role context without exposing email in responsibility options', () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([
      { accountId: 'manager-1', displayName: 'Omar Hassan', role: 'ProjectManager' },
      { accountId: 'owner-1', displayName: 'Salma El-Sayed', role: 'ProcurementManager' },
    ]);
    flushCompany(http);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Omar Hassan — Project Manager');
    expect(text).toContain('Salma El-Sayed — Procurement Manager');
    expect(text).not.toContain('@');
    http.verify();
  });
});

describe('invalid submit on the project and work-package forms (CF-020)', () => {
  const settle = async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  it('focuses the first invalid project field and counts the errors in the summary', async () => {
    const http = configure();
    TestBed.inject(InvalidSubmitFocus).start();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.autoDetectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    const invalid = [...element.querySelectorAll('[aria-invalid="true"]')];
    expect(invalid.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(invalid[0]);
    const summary = element.querySelector('form .prj-error-summary')!;
    const count = invalid.length;
    expect(summary.textContent).toContain(
      count === 1 ? '1 field needs attention' : `${count} fields need attention`,
    );
    expect(summary.querySelectorAll('a')).toHaveLength(count);
    http.expectNone('/api/v1/projects');
    element.remove();
  });

  it('focuses the first invalid work-package field and counts the errors in the summary', async () => {
    const http = configure(['WorkPackages.View', 'WorkPackages.Create'], { id: 'p1' });
    TestBed.inject(InvalidSubmitFocus).start();
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.autoDetectChanges();
    http.expectOne('/api/v1/company/currencies').flush([]);
    http.expectOne('/api/v1/projects/p1').flush(detail);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    const invalid = [...element.querySelectorAll('[aria-invalid="true"]')];
    expect(invalid.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(invalid[0]);
    const summary = element.querySelector('form .prj-error-summary')!;
    const links = [...summary.querySelectorAll('a')];
    expect(links).toHaveLength(invalid.length);
    expect(links[0].getAttribute('href')).toBe(`#${invalid[0].id}`);
    expect(summary.textContent).toMatch(/1 field needs attention|\d+ fields need attention/);
    http.expectNone((request) => request.method === 'POST');
    element.remove();
  });
});

describe('stale server refusals on the project and work-package forms (E2E-010)', () => {
  const alertText = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent?.trim() ??
    '';
  const edit = (fixture: ComponentFixture<unknown>, name: string, value: string) => {
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      `[name="${name}"]`,
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const refuse = (status: number, error: object) => ({
    status,
    statusText: status === 400 ? 'Bad Request' : 'Conflict',
    error,
  });

  function projectForm() {
    const http = configure();
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http);
    fixture.detectChanges();
    return { http, fixture, submit: () => submitProject(http, fixture) };
  }
  async function submitProject(
    http: HttpTestingController,
    fixture: ComponentFixture<ProjectForm>,
  ) {
    await fixture.whenStable();
    fixture.componentInstance.code = 'CMC-2026';
    fixture.componentInstance.name = 'Cairo Medical';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.save();
    return http.expectOne('/api/v1/projects');
  }

  it('shows the project manager read only to a user who may not assign it (re-audit D)', async () => {
    const http = configure(['Projects.View', 'Projects.Edit'], {}, ['ProjectManager']);
    const fixture = TestBed.createComponent(ProjectForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/assignable-users').flush([]);
    flushCompany(http);
    fixture.detectChanges();
    // ngModel applies [disabled] asynchronously.
    await fixture.whenStable();
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#pm')!;
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('aria-describedby')).toBe('pm-hint');
    expect((fixture.nativeElement as HTMLElement).querySelector('#pm-hint')?.textContent).toContain(
      'Only a Procurement Manager or Company Admin assigns the project manager.',
    );
  });

  it('clears a duplicate project code refusal once the code is edited, and only then', async () => {
    const { fixture, submit } = projectForm();
    (await submit()).flush(
      { code: 'project.code_taken', parameters: { code: 'CMC-2026' } },
      refuse(409, {}),
    );
    fixture.detectChanges();
    expect(alertText(fixture)).toBe('Project code CMC-2026 is already used in this company.');
    // Another field does not resolve a taken code.
    edit(fixture, 'name', 'Cairo Medical Complex');
    expect(alertText(fixture)).toContain('already used');
    edit(fixture, 'code', 'CMC-2027');
    expect(alertText(fixture)).toBe('');
  });

  it('keeps an unrelated conflict when a field is edited', async () => {
    const { fixture, submit } = projectForm();
    (await submit()).flush({ code: 'concurrency.stale' }, refuse(409, {}));
    fixture.detectChanges();
    const shown = alertText(fixture);
    expect(shown).toContain('changed by someone else');
    edit(fixture, 'code', 'CMC-2027');
    expect(alertText(fixture)).toBe(shown);
  });

  it('still clears a validation refusal on any edit', async () => {
    const { fixture, submit } = projectForm();
    (await submit()).flush({}, refuse(400, {}));
    fixture.detectChanges();
    expect(alertText(fixture)).not.toBe('');
    edit(fixture, 'location', 'New Cairo');
    expect(alertText(fixture)).toBe('');
  });

  it('clears a duplicate work package code refusal once the package code is edited', async () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.code = 'HVAC-01';
    fixture.componentInstance.title = 'HVAC Installation';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.save();
    http
      .expectOne('/api/v1/projects/p1/work-packages')
      .flush({ code: 'work_package.code_taken', parameters: { code: 'HVAC-01' } }, refuse(409, {}));
    fixture.detectChanges();
    expect(alertText(fixture)).toBe('Work package code HVAC-01 is already used in this project.');
    edit(fixture, 'title', 'HVAC works');
    expect(alertText(fixture)).toContain('already used');
    edit(fixture, 'code', 'HVAC-02');
    expect(alertText(fixture)).toBe('');
  });

  it('marks every field a validation.failed answer lists, with its message, in the error summary (B-092-6)', async () => {
    const { fixture, submit } = projectForm();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    (await submit()).flush(
      {
        code: 'validation.failed',
        parameters: { fields: 'code,name,expectedEndDate' },
        errors: [
          { field: 'code', code: 'project.code_invalid' },
          { field: 'name', code: 'project.name_required' },
          { field: 'expectedEndDate', code: 'project.expected_end_before_start' },
        ],
      },
      refuse(400, {}),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const invalid = [...element.querySelectorAll('[aria-invalid="true"]')] as HTMLElement[];
    expect(invalid.map((field) => field.id)).toEqual(['code', 'name', 'end']);
    const described = (field: HTMLElement) =>
      document.getElementById(field.getAttribute('aria-describedby')!)?.textContent?.trim();
    expect(invalid.map(described)).toEqual([
      'Use 2–32 letters, digits, dash, underscore or slash for the project code.',
      'A project name is required.',
      'The expected end date cannot be before the start date.',
    ]);
    expect(alertText(fixture)).toBe('Some details are not valid. Review the form and try again.');
    const summary = element.querySelector('form .prj-error-summary')!;
    expect(summary.textContent).toContain('3 fields need attention');
    expect([...summary.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '#code',
      '#name',
      '#end',
    ]);
    expect(summary.textContent).toContain('A project name is required.');
    // Correcting one field clears its mark only; the summary follows.
    edit(fixture, 'name', 'Cairo Medical Complex');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect([...element.querySelectorAll('[aria-invalid="true"]')].map((field) => field.id)).toEqual(
      ['code', 'end'],
    );
    expect(summary.textContent).toContain('2 fields need attention');
    element.remove();
  });

  it('marks the listed work-package fields and names a field the form does not show (B-092-6)', async () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.code = 'HVAC-01';
    fixture.componentInstance.title = 'HVAC Installation';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.save();
    http.expectOne('/api/v1/projects/p1/work-packages').flush(
      {
        code: 'validation.failed',
        parameters: { fields: 'title,scopeSummary,plannedEndDate' },
        errors: [
          { field: 'title', code: 'work_package.title_required' },
          { field: 'scopeSummary', code: 'request.invalid' },
          { field: 'plannedEndDate', code: 'work_package.planned_end_before_start' },
        ],
      },
      refuse(400, {}),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const invalid = [...element.querySelectorAll('[aria-invalid="true"]')] as HTMLElement[];
    expect(invalid.map((field) => field.id)).toEqual(['wp-title', 'wp-scope', 'wp-end']);
    expect(
      invalid.map((field) =>
        document.getElementById(field.getAttribute('aria-describedby')!)?.textContent?.trim(),
      ),
    ).toEqual([
      'A title is required.',
      'This value is not valid.',
      'The planned end date cannot be before the planned start date.',
    ]);
    // Moving the start resolves the schedule error as well as moving the end.
    edit(fixture, 'plannedStart', '2026-01-01');
    expect([...element.querySelectorAll('[aria-invalid="true"]')].map((field) => field.id)).toEqual(
      ['wp-title', 'wp-scope'],
    );
  });
});

describe('project detail', () => {
  it('offers Edit to a Project Manager only on a project they manage (re-audit D)', () => {
    const pmPermissions = ['Projects.View', 'Projects.Edit', 'WorkPackages.View'];
    for (const [manager, offered] of [
      ['u1', true],
      ['u2', false],
    ] as const) {
      TestBed.resetTestingModule();
      const http = configure(pmPermissions, { id: 'p1' }, ['ProjectManager']);
      const fixture = TestBed.createComponent(ProjectDetailPage);
      fixture.detectChanges();
      http.expectOne('/api/v1/projects/p1').flush({ ...detail, projectManagerAccountId: manager });
      fixture.detectChanges();
      http
        .match((request) => request.url === '/api/v1/projects/p1/work-packages')
        .forEach((r) => r.flush(packagePage));
      fixture.detectChanges();
      const edit = (fixture.nativeElement as HTMLElement).querySelector(
        'a[href="/projects/p1/edit"]',
      );
      expect(!!edit).toBe(offered);
    }
  });

  it('confirms a lifecycle change before sending it, and carries the row version', () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush(packagePage);
    fixture.detectChanges();

    // Asking does not change anything yet.
    fixture.componentInstance.ask('Completed');
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('releases its slot and cannot be reopened');
    expect(dialog?.textContent).toContain('4 unstarted Draft work packages remain recorded');
    expect(dialog?.textContent).toContain('may only be cancelled');
    http.verify();

    fixture.componentInstance.confirm();
    const request = http.expectOne('/api/v1/projects/p1/status');
    expect(request.request.body).toEqual({
      status: 'Completed',
      actualEndDate: null,
      version: 'v1',
    });
    request.flush({ ...detail, status: 'Completed', allowedNextStatuses: [], version: 'v2' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('moved to Completed');
    http.verify();
  });

  it('names each lifecycle move as a verb, keeps cancelling the danger action, and traps focus in its dialog (CF-019, CF-102)', () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush({
      ...detail,
      status: 'Active',
      allowedNextStatuses: ['OnHold', 'Completed', 'Cancelled'],
    });
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush(packagePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = [
      ...element.querySelectorAll<HTMLButtonElement>('.prj-head .prj-actions button'),
    ];
    expect(buttons.map((button) => button.textContent!.trim())).toEqual([
      'Put project on hold',
      'Complete project',
      'Cancel project',
    ]);
    expect(buttons.map((button) => button.className)).toEqual([
      'prj-btn prj-btn--ghost',
      'prj-btn prj-btn--ghost',
      'prj-btn prj-btn--danger',
    ]);

    buttons[2].focus();
    buttons[2].click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    const choices = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
    expect(choices.map((button) => button.textContent!.trim())).toEqual([
      'Cancel project',
      'Keep project as it is',
    ]);
    expect(choices[0].className).toContain('prj-btn--danger');
    // Tab from the last control wraps to the first instead of leaving the dialog.
    choices[1].focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choices[0]);
    // Shift+Tab from the first control wraps back to the last (CF-019 AC1).
    const backTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(backTab);
    expect(backTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choices[1]);
    // Escape keeps the project, closes the dialog and returns focus to the button that opened it.
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(buttons[2]);
    http.verify();
  });

  it('explains a quota refusal in commercial terms', () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/projects/p1')
      .flush({ ...detail, status: 'Draft', allowedNextStatuses: ['Active', 'Cancelled'] });
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush(packagePage);

    fixture.componentInstance.ask('Active');
    fixture.componentInstance.confirm();
    http.expectOne('/api/v1/projects/p1/status').flush(
      {
        title: 'The operation exceeds the company’s plan limits.',
        code: 'quota.exceeded',
        parameters: { quota: 'max_active_projects', limit: '3' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'no active-project capacity left',
    );
    http.verify();
  });

  it('hides package creation from a viewer and while the project is closed', () => {
    const http = configure(['Projects.View', 'WorkPackages.View'], { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush(packagePage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Add work package');
    http.verify();
  });
});

describe('work package detail', () => {
  const workPackage: WorkPackageDetail = {
    ...packagePage.items[0],
    projectCode: 'CMC-2026',
    projectName: 'Cairo Medical Complex Expansion',
    projectStatus: 'Completed',
    description: null,
    scopeSummary: 'Supply and install.',
    allowedNextStatuses: ['Active', 'Cancelled'],
    createdAtUtc: '2026-03-01T08:00:00Z',
    createdBy: 'u1',
    updatedBy: 'u1',
    estimateEditable: true,
    estimateReasonRequired: false,
    estimateRevisions: [],
  };

  it('does not offer to start work under a closed project, but still allows tidying up', () => {
    const http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/work-packages/w1').flush(workPackage);
    fixture.detectChanges();

    expect(fixture.componentInstance.offered('Active')).toBe(false);
    expect(fixture.componentInstance.offered('Cancelled')).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('cannot be activated');
    expect(text).toContain('may only be cancelled');
    expect(text).not.toContain('still be completed');
    // Editing is hidden too: the API refuses it, so offering the action would only produce a 409.
    expect(text).not.toContain('Edit');
    http.verify();
  });

  it('creates a new Draft package from this one with only a new code and title (CF-057)', () => {
    const http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/work-packages/w1').flush({ ...workPackage, projectStatus: 'Active' });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'New work package from this',
    );
    page.startClone();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Its estimate and dates are left for you to set',
    );
    page.cloneCode = 'MEP-02';
    page.submitClone();
    const clone = http.expectOne('/api/v1/work-packages/w1/clone');
    expect(clone.request.body).toEqual({ code: 'MEP-02', title: workPackage.title });
    clone.flush({ ...workPackage, id: 'w2', code: 'MEP-02', status: 'Draft' });
    fixture.detectChanges();
    expect(page.item()?.id).toBe('w2');
    expect(page.notice()).toContain('Add its estimate and dates');
    http.verify();
  });

  it('names each lifecycle move as a verb, keeps cancelling the danger action, and confirms it in a focus-trapped dialog (CF-019, CF-102)', () => {
    // Without WorkPackages.Create, the header holds only the lifecycle moves (no "New work package from this").
    const http = configure(
      ALL_PERMISSIONS.filter((permission) => permission !== 'WorkPackages.Create'),
      { packageId: 'w1' },
    );
    const fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    const active: WorkPackageDetail = {
      ...workPackage,
      status: 'Active',
      projectStatus: 'Active',
      allowedNextStatuses: ['OnHold', 'Completed', 'Cancelled'],
    };
    http.expectOne('/api/v1/work-packages/w1').flush(active);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = [
      ...element.querySelectorAll<HTMLButtonElement>('.prj-head .prj-actions button'),
    ];
    // CF-102 AC1: verbs, never the state reached; pausing and completing are secondary, cancelling is the danger action.
    expect(buttons.map((button) => button.textContent!.trim())).toEqual([
      'Put work package on hold',
      'Complete work package',
      'Cancel work package',
    ]);
    expect(buttons.map((button) => button.className)).toEqual([
      'prj-btn prj-btn--ghost',
      'prj-btn prj-btn--ghost',
      'prj-btn prj-btn--danger',
    ]);
    expect(element.querySelector('[role="dialog"]')).toBeNull();

    // CF-102 AC3 / CF-019 AC3: the move is confirmed first, and the other choice says what it keeps.
    buttons[2].focus();
    buttons[2].click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('h2')?.textContent?.trim()).toBe('Cancel work package');
    expect(dialog.textContent).toContain('This scope is abandoned and cannot be reopened.');
    const choices = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
    expect(choices.map((button) => button.textContent!.trim())).toEqual([
      'Cancel work package',
      'Keep work package as it is',
    ]);
    expect(choices[0].className).toContain('prj-btn--danger');
    expect(choices.some((button) => button.textContent!.trim() === 'Cancel')).toBe(false);
    http.verify();

    // CF-019 AC1: Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last.
    choices[1].focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choices[0]);
    const backTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(backTab);
    expect(backTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choices[1]);

    // CF-019 AC2: Escape keeps the package, closes the dialog and returns focus to the button that opened it — nothing is sent.
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(buttons[2]);
    http.verify();

    // The cancel label also only closes the dialog.
    buttons[1].focus();
    buttons[1].click();
    fixture.detectChanges();
    const completing = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(completing.querySelector('h2')?.textContent?.trim()).toBe('Complete work package');
    const keep = [...completing.querySelectorAll<HTMLButtonElement>('button')][1];
    expect(keep.textContent!.trim()).toBe('Keep work package as it is');
    keep.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(buttons[1]);
    http.verify();

    // Confirming sends the change with the row version.
    buttons[2].click();
    fixture.detectChanges();
    const confirmButton = element.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    expect(confirmButton.textContent!.trim()).toBe('Cancel work package');
    confirmButton.click();
    fixture.detectChanges();
    const request = http.expectOne('/api/v1/work-packages/w1/status');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ status: 'Cancelled', version: 'wv1' });
    request.flush({ ...active, status: 'Cancelled', allowedNextStatuses: [], version: 'wv2' });
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(element.textContent).toContain('Work package moved to Cancelled');
    http.verify();
  });
});

describe('entitlement gating', () => {
  it('reads features from the server and never invents them', () => {
    const http = configure();
    const entitlements = TestBed.inject(EntitlementsService);
    entitlements.load().subscribe();
    http.expectOne('/api/v1/company/features').flush({ features: ['projects'] });
    expect(entitlements.has('projects')).toBe(true);
    expect(entitlements.has('tendering')).toBe(false);

    entitlements.clear();
    entitlements.load().subscribe();
    http
      .expectOne('/api/v1/company/features')
      .flush('nope', { status: 403, statusText: 'Forbidden' });
    expect(entitlements.has('projects')).toBe(false);
    http.verify();
  });
});

describe('problem messages', () => {
  it('separates a plan limit, a stale edit and a permission failure', () => {
    const quota = new HttpErrorResponse({
      status: 409,
      error: {
        title: 'The operation exceeds the company plan limits.',
        code: 'quota.exceeded',
        parameters: { quota: 'max_active_projects', limit: '3' },
      },
    });
    const stale = new HttpErrorResponse({
      status: 409,
      error: { title: 'The resource changed. Reload before retrying.', code: 'concurrency.stale' },
    });
    const denied = new HttpErrorResponse({ status: 403, error: { title: 'Access is denied.' } });
    const plan = new HttpErrorResponse({
      status: 403,
      error: {
        title: "The company's plan does not include this capability.",
        code: 'entitlement.feature_not_entitled',
      },
    });

    expect(projectProblemMessage(quota)).toContain('no active-project capacity left');
    expect(projectProblemMessage(stale)).toContain('changed by someone else');
    expect(projectProblemMessage(denied)).toContain('do not have permission');
    expect(projectProblemMessage(plan)).toContain('does not include this capability');
    // An unknown code never becomes text; the English build keeps reviewed detail, else a safe fallback.
    expect(
      projectProblemMessage(
        new HttpErrorResponse({ status: 409, error: { code: 'future.rule', detail: 'Reviewed.' } }),
      ),
    ).toBe('Reviewed.');
    expect(projectProblemMessage(new HttpErrorResponse({ status: 409, error: {} }))).toContain(
      'conflicts with the current state',
    );
    expect(projectProblemMessage(new HttpErrorResponse({ status: 0 }))).toContain(
      'Cannot reach the server',
    );
  });
});

describe('estimate field class (CF-037)', () => {
  const livePackage: WorkPackageDetail = {
    ...packagePage.items[0],
    status: 'Active',
    projectCode: 'CMC-2026',
    projectName: 'Cairo Medical Complex Expansion',
    projectStatus: 'Active',
    description: null,
    scopeSummary: null,
    allowedNextStatuses: ['OnHold', 'Completed', 'Cancelled'],
    createdAtUtc: '2026-03-01T08:00:00Z',
    createdBy: 'u1',
    updatedBy: 'u1',
    estimateEditable: true,
    estimateReasonRequired: true,
    estimateRevisions: [
      {
        number: 1,
        value: '4250000.00',
        currency: 'EGP',
        afterPublication: true,
        reason: 'Ductwork re-measured',
        carried: false,
        recordedAtUtc: '2026-03-05T09:00:00Z',
        recordedByName: 'Maha Manager',
      },
      {
        number: 0,
        value: '4000000.00',
        currency: 'EGP',
        afterPublication: false,
        reason: null,
        carried: true,
        recordedAtUtc: '2026-03-01T08:00:00Z',
        recordedByName: '',
      },
    ],
  };
  const blindPackage: WorkPackageDetail = {
    ...livePackage,
    estimatedValue: null,
    estimateVisible: false,
    estimateEditable: false,
    estimateReasonRequired: false,
    estimateRevisions: [],
  };

  it('drops the estimate column and total when the server shows no estimates', () => {
    const http = configure(['Projects.View', 'WorkPackages.View'], { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush({
        ...packagePage,
        items: [{ ...packagePage.items[0], estimatedValue: null, estimateVisible: false }],
      });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('HVAC-01');
    expect(text).not.toContain('Estimated value');
    expect(text).not.toContain('Total estimated value');
  });

  it('shows the estimate history to its readers and nothing of it to anyone else', () => {
    let http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    let fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/work-packages/w1').flush(livePackage);
    fixture.detectChanges();
    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Estimate history');
    expect(text).toContain('Ductwork re-measured');
    expect(text).toContain('after a tender was published');
    expect(text).toContain('Before estimate history was kept');

    TestBed.resetTestingModule();
    http = configure(['WorkPackages.View'], { packageId: 'w1' });
    fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/work-packages/w1').flush(blindPackage);
    fixture.detectChanges();
    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Estimated value');
    expect(text).not.toContain('Estimate history');
  });

  it('asks why an estimate changes after publication and sends the reason', async () => {
    const http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/company/currencies')
      .flush([{ code: 'EGP', name: 'Egyptian pound', minorUnits: 2 }]);
    http.expectOne('/api/v1/work-packages/w1').flush(livePackage);
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.componentInstance;
    // Unchanged: no reason is asked for.
    expect(form.estimateReasonNeeded).toBe(false);
    form.estimatedValue = '4500000';
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#wp-estimate-reason'),
    ).not.toBeNull();
    form.save();
    http.expectNone('/api/v1/work-packages/w1');
    form.estimateReason = 'Chiller capacity increased';
    form.save();
    const request = http.expectOne('/api/v1/work-packages/w1');
    expect(request.request.body.estimatedValue).toBe('4500000.00');
    expect(request.request.body.estimateChangeReason).toBe('Chiller capacity increased');
  });

  it('never shows or sends an estimate for a reader who may not enter it', async () => {
    const http = configure(['WorkPackages.View', 'WorkPackages.Edit'], { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/company/currencies')
      .flush([{ code: 'EGP', name: 'Egyptian pound', minorUnits: 2 }]);
    http.expectOne('/api/v1/work-packages/w1').flush(blindPackage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#wp-value')).toBeNull();
    fixture.componentInstance.title = 'HVAC works';
    fixture.componentInstance.save();
    const request = http.expectOne('/api/v1/work-packages/w1');
    expect(request.request.body.estimatedValue).toBeNull();
    expect(request.request.body.estimateChangeReason).toBeNull();
  });

  it('offers the estimate on a new package only to a commercial reader', async () => {
    const http = configure(['WorkPackages.View', 'WorkPackages.Create'], { id: 'p1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/currencies').flush([]);
    http.expectOne('/api/v1/projects/p1').flush(detail);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#wp-value')).toBeNull();
    expect(fixture.componentInstance.estimateEditable).toBe(false);
  });
});

describe('controlled categories (CF-027)', () => {
  const trades = [
    {
      id: 'tr-mech',
      code: 'MECH',
      name: 'Mechanical',
      isActive: true,
      subcontractorCount: 1,
      updatedAtUtc: '',
      version: 'v',
    },
    {
      id: 'tr-old',
      code: 'OLD',
      name: 'Old works',
      isActive: false,
      subcontractorCount: 0,
      updatedAtUtc: '',
      version: 'v',
    },
  ];
  const legacy: WorkPackageDetail = {
    ...packagePage.items[0],
    category: 'electric',
    tradeId: null,
    tradeCode: null,
    projectCode: 'CMC-2026',
    projectName: 'Cairo Medical Complex Expansion',
    projectStatus: 'Active',
    description: null,
    scopeSummary: null,
    allowedNextStatuses: ['Active', 'Cancelled'],
    createdAtUtc: '2026-03-01T08:00:00Z',
    createdBy: 'u1',
    updatedBy: 'u1',
    estimateEditable: true,
    estimateReasonRequired: false,
    estimateRevisions: [],
  };

  async function editForm(item: WorkPackageDetail) {
    const http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush(trades);
    http.expectOne('/api/v1/company/currencies').flush([]);
    http.expectOne('/api/v1/work-packages/w1').flush(item);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { http, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('offers the active trades, never a free-text category, and sends the chosen trade', async () => {
    const { http, fixture, element } = await editForm({
      ...legacy,
      category: 'Mechanical',
      tradeId: 'tr-mech',
      tradeCode: 'MECH',
    });
    const select = element.querySelector('#wp-category') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const options = [...select.options].map((option) => option.textContent?.trim());
    expect(options).toContain('Mechanical (MECH)');
    expect(options).not.toContain('Old works (OLD)');
    fixture.componentInstance.save();
    const request = http.expectOne('/api/v1/work-packages/w1');
    expect([request.request.body.tradeId, request.request.body.category]).toEqual([
      'tr-mech',
      null,
    ]);
  });

  it('keeps a legacy category unchanged until a trade is chosen', async () => {
    const { http, fixture, element } = await editForm(legacy);
    expect(element.textContent).toContain('Keep “electric” (recorded before trades were used)');
    fixture.componentInstance.save();
    const kept = http.expectOne('/api/v1/work-packages/w1');
    expect([kept.request.body.tradeId, kept.request.body.category]).toEqual([null, 'electric']);
    kept.flush(legacy);
    TestBed.resetTestingModule();
    const second = await editForm(legacy);
    second.fixture.componentInstance.tradeChoice = 'tr-mech';
    second.fixture.componentInstance.save();
    const linked = second.http.expectOne('/api/v1/work-packages/w1');
    expect([linked.request.body.tradeId, linked.request.body.category]).toEqual(['tr-mech', null]);
  });
});

describe('No account id on the project and work-package screens (red-team G193, CF-093 AC1)', () => {
  // Real-looking account ids: if any template ever bound createdBy, updatedBy or an *AccountId, the GUID would surface here.
  const creator = '3f2b8c1e-7d4a-4e9b-9c0d-1a2b3c4d5e6f';
  const editor = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  const manager = 'c0ffee00-1234-4abc-9def-0123456789ab';
  const owner = 'deadbeef-4321-4cba-8fed-ba9876543210';
  const guid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function expectNoAccountId(element: HTMLElement): void {
    // Neither the visible text nor any attribute (title, aria-*, href, data-*) carries an account id.
    expect(element.textContent ?? '').not.toMatch(guid);
    for (const node of [element, ...element.querySelectorAll('*')])
      for (const attribute of [...node.attributes])
        expect(attribute.value, `${node.tagName} ${attribute.name}`).not.toMatch(guid);
  }

  it('project detail renders no account id anywhere — actors appear by name only', () => {
    const http = configure(ALL_PERMISSIONS, { id: 'p1' });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p1').flush({
      ...detail,
      projectManagerAccountId: manager,
      procurementOwnerAccountId: owner,
      procurementOwnerName: 'Salma El-Sayed',
      createdBy: creator,
      updatedBy: editor,
    });
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/projects/p1/work-packages')
      .flush(packagePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Nadia Fouad');
    expectNoAccountId(element);
  });

  it('work-package detail renders no account id anywhere — actors appear by name only', () => {
    const http = configure(ALL_PERMISSIONS, { packageId: 'w1' });
    const fixture = TestBed.createComponent(WorkPackageDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/work-packages/w1').flush({
      ...packagePage.items[0],
      status: 'Active',
      projectCode: 'CMC-2026',
      projectName: 'Cairo Medical Complex Expansion',
      projectStatus: 'Active',
      description: 'Main plant room.',
      scopeSummary: 'Supply and install.',
      allowedNextStatuses: ['OnHold', 'Completed', 'Cancelled'],
      createdAtUtc: '2026-03-01T08:00:00Z',
      createdBy: creator,
      updatedBy: editor,
      estimateEditable: true,
      estimateReasonRequired: true,
      estimateRevisions: [
        {
          number: 1,
          value: '4250000.00',
          currency: 'EGP',
          afterPublication: true,
          reason: 'Ductwork re-measured',
          carried: false,
          recordedAtUtc: '2026-03-05T09:00:00Z',
          recordedByName: 'Maha Manager',
        },
      ],
    } satisfies WorkPackageDetail);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('HVAC Installation');
    expectNoAccountId(element);
  });
});
