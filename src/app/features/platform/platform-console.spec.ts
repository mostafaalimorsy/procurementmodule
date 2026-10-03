import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { endWarning } from './commercial-terms';
import { countryList } from './residency';
import { PlatformSessionService } from '../../core/auth/platform-session.service';
import { CompanyOverview } from './company-overview';
import { CompanyPlanPage } from './company-plan';
import { CompanyStore } from './company-store';
import { planDiff } from './plan-diff';
import { AdminRecovery, Company, PlatformApi, PlatformPackage } from './platform-api.service';
import { RevisionPicker } from './revision-picker';
import { SecretKeys } from './secret-keys';
import { PlatformAudit } from './platform-audit';

const company: Company = {
  id: 'company-1',
  code: 'delta',
  name: 'Delta Construction',
  isActive: true,
  packageRevisionId: 'r1',
  firstAdminEmail: 'admin@delta.example',
  firstAdminState: 'InvitationIssued',
  createdAtUtc: '2026-09-10T00:00:00Z',
  updatedAtUtc: '2026-09-10T00:00:00Z',
  version: 'v1',
  accessPolicy: { emailDomains: ['delta.example'], ipRules: [], locationRules: [] },
};

const pack: PlatformPackage = {
  id: 'p1',
  code: 'standard',
  isActive: true,
  revisions: [
    {
      id: 'r1',
      number: 1,
      displayName: 'Standard',
      description: '',
      features: ['projects'],
      limits: { max_users: 20, max_active_projects: 3 },
      createdAtUtc: '2026-01-01T00:00:00Z',
    },
    {
      id: 'r2',
      number: 2,
      displayName: 'Standard',
      description: '',
      features: ['projects'],
      limits: { max_users: 10, max_active_projects: 5 },
      createdAtUtc: '2026-02-01T00:00:00Z',
    },
  ],
};

describe('Change plan diff', () => {
  it('compares terms key by key and treats a missing limit as a reduction, never unlimited', () => {
    const diff = planDiff(
      { features: ['projects'], limits: { max_users: 20, max_active_projects: 3 } },
      { features: [], limits: { max_users: 10 } },
    );
    expect(diff.limits).toEqual([
      { key: 'max_users', current: 20, next: 10, change: 'decrease' },
      { key: 'max_active_projects', current: 3, next: null, change: 'removed' },
    ]);
    expect(diff.removedFeatures).toEqual(['projects']);
    expect(diff.reducesTerms).toBe(true);
    expect(
      planDiff(
        { features: [], limits: { max_users: 5 } },
        { features: [], limits: { max_users: 9 } },
      ).reducesTerms,
    ).toBe(false);
  });
});

describe('Revision picker', () => {
  it('offers only current revisions until earlier ones are explicitly requested', () => {
    const fixture = TestBed.createComponent(RevisionPicker);
    fixture.componentRef.setInput('packages', [pack]);
    fixture.componentRef.setInput('label', 'Package revision');
    fixture.detectChanges();
    const options = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('option'), (option) =>
        option.textContent?.trim(),
      );
    expect(options()).toEqual(['Choose revision', 'Standard — revision 2']);
    (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(options()).toEqual([
      'Choose revision',
      'Standard — revision 2',
      'Standard — revision 1 (Superseded)',
    ]);
  });
});

describe('Company overview', () => {
  function render(api: Partial<PlatformApi>, overrides: { company?: Company } = {}) {
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
            companyInFlight: () => of({ companyId: 'company-1', counts: {}, total: 0 }),
            ...api,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(overrides.company ?? company);
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('renames with the loaded version and keeps the code visibly permanent', async () => {
    const renameCompany = vi.fn(() => of({ ...company, name: 'Delta Holding', version: 'v2' }));
    const { fixture, element } = render({ renameCompany });
    expect(element.textContent).toContain('permanent identifier');
    (element.querySelector('.toolbar button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = element.querySelector('input[name="name"]') as HTMLInputElement;
    input.value = '  Delta Holding ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(renameCompany).toHaveBeenCalledWith('company-1', 'Delta Holding', 'v1');
    expect(TestBed.inject(CompanyStore).company()?.version).toBe('v2');
  });

  it('keeps Save name disabled until the trimmed name actually differs', async () => {
    const { fixture, element } = render({});
    (element.querySelector('.toolbar button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = element.querySelector('input[name="name"]') as HTMLInputElement;
    const save = () =>
      (element.querySelector('form .actions button:not([type])') as HTMLButtonElement).disabled;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    fixture.detectChanges();
    expect(save()).toBe(true);
    await type(`  ${company.name} `);
    expect(save()).toBe(true);
    await type(`${company.name} Holding`);
    expect(save()).toBe(false);
  });

  it('shows whether the first admin invitation email left, and why not (CF-078)', () => {
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set({
      ...company,
      firstAdminInvitationEmail: {
        status: 'Failed',
        failureCategory: 'authentication_failed',
        attempts: 5,
        maxAttempts: 5,
        queuedAtUtc: '2026-10-01T09:00:00Z',
        nextAttemptAtUtc: null,
        sentAtUtc: null,
      },
    });
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    const note = (fixture.nativeElement as HTMLElement).querySelector('.first-admin-mail--failed');
    expect(note?.textContent).toContain('refused the user name or password');
    expect(note?.getAttribute('role')).toBe('status');
  });

  it('states the consequence of suspension before sending it', () => {
    const companyStatus = vi.fn(() => of({ ...company, isActive: false, version: 'v2' }));
    const { fixture, element } = render({ companyStatus });
    const suspend = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Suspend company'),
    )!;
    suspend.click();
    fixture.detectChanges();
    expect(companyStatus).not.toHaveBeenCalled();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('loses access at their next request');
    expect(dialog.textContent).toContain('nothing is deleted');
    (dialog.querySelector('button.prj-btn--danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(companyStatus).toHaveBeenCalledWith('company-1', false, 'v1', false);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  const button = (element: HTMLElement, label: string) =>
    Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    ) as HTMLButtonElement;

  it('shows the work a suspension would freeze and needs the second confirmation (CF-061)', () => {
    const companyStatus = vi.fn(() => of({ ...company, isActive: false, version: 'v2' }));
    const { fixture, element } = render({
      companyStatus,
      companyInFlight: () =>
        of({ companyId: 'company-1', counts: { open_tenders: 2, open_rounds: 0 }, total: 2 }),
    });
    button(element, 'Suspend company').click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('[data-testid="in-flight-counts"]')!.textContent).toContain(
      'Open tenders with invited firms: 2',
    );
    expect(dialog.textContent).not.toContain('Open negotiation rounds');
    (dialog.querySelector('button.prj-btn--danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(companyStatus).not.toHaveBeenCalled();
    expect(TestBed.inject(CompanyStore).error()).toContain(
      'Confirm that this freezes the work in progress',
    );
    const acknowledge = dialog.querySelector('#confirm-in-flight') as HTMLInputElement;
    acknowledge.click();
    fixture.detectChanges();
    (dialog.querySelector('button.prj-btn--danger') as HTMLButtonElement).click();
    expect(companyStatus).toHaveBeenCalledWith('company-1', false, 'v1', true);
  });

  it('starts a read-only grace for the chosen days, shows it, and ends it on request (CF-061)', async () => {
    const startGrace = vi.fn(() =>
      of({
        ...company,
        version: 'v2',
        accessState: 'ReadOnlyGrace' as const,
        graceEndsAtUtc: '2026-11-01T00:00:00Z',
        graceEndState: 'Suspended' as const,
      }),
    );
    const endGrace = vi.fn(() =>
      of({ ...company, isActive: false, accessState: 'Suspended' as const, version: 'v3' }),
    );
    const { fixture, element } = render({ startGrace, endGrace });
    button(element, 'Start a read-only grace').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const days = element.querySelector('#grace-days') as HTMLInputElement;
    days.value = '14';
    days.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('bidders see their tenders as paused');
    expect(dialog.querySelector('[data-testid="in-flight-none"]')).not.toBeNull();
    (dialog.querySelector('button.prj-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(startGrace).toHaveBeenCalledWith('company-1', 14, null, 'v1');
    expect(element.querySelector('[data-testid="company-grace"]')!.textContent).toContain(
      'Read-only until',
    );
    expect(element.textContent).toContain('Then the company is suspended.');
    button(element, 'End the grace now').click();
    fixture.detectChanges();
    (element.querySelector('[role="dialog"] button.prj-btn--danger') as HTMLButtonElement).click();
    expect(endGrace).toHaveBeenCalledWith('company-1', 'v2');
  });
});

describe('Change plan with usage', () => {
  it('shows what today’s usage becomes under the new limits before anything changes', () => {
    const assignPackage = vi.fn(() => of({ ...company, packageRevisionId: 'r2', version: 'v2' }));
    TestBed.configureTestingModule({
      imports: [CompanyPlanPage],
      providers: [
        CompanyStore,
        { provide: PlatformApi, useValue: { assignPackage, companyUsage: () => of(null) } },
      ],
    });
    const store = TestBed.inject(CompanyStore);
    store.company.set(company);
    store.packages.set([pack]);
    store.usage.set({
      companyId: 'company-1',
      packageRevisionId: 'r1',
      companyIsActive: true,
      quotas: [
        {
          key: 'max_users',
          usage: 18,
          limit: 20,
          overLimit: false,
          canCreate: true,
          measured: true,
        },
        {
          key: 'max_active_projects',
          usage: 3,
          limit: 3,
          overLimit: false,
          canCreate: false,
          measured: true,
        },
      ],
    });
    const fixture = TestBed.createComponent(CompanyPlanPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Current usage, with bands, before any change is chosen.
    expect(element.textContent).toContain('18 / 20');
    expect(element.textContent).toContain('Approaching limit');
    expect(element.textContent).toContain('At limit');

    const select = element.querySelector('select[name="change-revision"]') as HTMLSelectElement;
    select.value = 'r2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const text = element.textContent ?? '';
    expect(text).toContain('Over limit');
    expect(text).toContain('current usage 18 is above the new limit 10');
    expect(text).toContain('Everything already there is kept');
    expect(assignPackage).not.toHaveBeenCalled();

    (
      Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Change plan'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Nothing is deleted or suspended');
    (dialog.querySelector('button.prj-btn') as HTMLButtonElement).click();
    expect(assignPackage).toHaveBeenCalledWith('company-1', 'r2', 'v1', false);
  });

  it('counts what removing a feature freezes, and offers to wind down first (CF-061)', () => {
    const assignPackage = vi.fn(() => of({ ...company, packageRevisionId: 'r3', version: 'v2' }));
    const startGrace = vi.fn(() =>
      of({ ...company, version: 'v2', accessState: 'ReadOnlyGrace' as const }),
    );
    const tendering: PlatformPackage = {
      ...pack,
      revisions: [
        { ...pack.revisions[0], features: ['projects', 'tendering'] },
        { ...pack.revisions[1], id: 'r3', number: 3, features: ['projects'] },
      ],
    };
    TestBed.configureTestingModule({
      imports: [CompanyPlanPage],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            assignPackage,
            startGrace,
            companyUsage: () => of(null),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
            companyInFlight: () =>
              of({
                companyId: 'company-1',
                counts: { open_tenders: 1, closeouts_in_progress: 4 },
                total: 5,
              }),
          },
        },
      ],
    });
    const store = TestBed.inject(CompanyStore);
    store.company.set(company);
    store.packages.set([tendering]);
    const fixture = TestBed.createComponent(CompanyPlanPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector('select[name="change-revision"]') as HTMLSelectElement;
    select.value = 'r3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const find = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(label),
      ) as HTMLButtonElement;
    find('Change plan').click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const counts = dialog.querySelector('[data-testid="in-flight-counts"]')!.textContent ?? '';
    expect(counts).toContain('Open tenders with invited firms: 1');
    // Closeouts are not frozen by removing tendering.
    expect(counts).not.toContain('Closeouts being recorded');
    (dialog.querySelector('button.prj-btn--danger, button.prj-btn') as HTMLButtonElement).click();
    expect(assignPackage).not.toHaveBeenCalled();
    (dialog.querySelector('#plan-confirm-in-flight') as HTMLInputElement).click();
    fixture.detectChanges();
    (dialog.querySelector('button.prj-btn--danger, button.prj-btn') as HTMLButtonElement).click();
    expect(assignPackage).toHaveBeenCalledWith('company-1', 'r3', 'v1', true);
  });

  it('winds down instead: read-only for 30 days, then the new plan (CF-061)', () => {
    const startGrace = vi.fn(() =>
      of({ ...company, version: 'v2', accessState: 'ReadOnlyGrace' as const }),
    );
    TestBed.configureTestingModule({
      imports: [CompanyPlanPage],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            startGrace,
            companyUsage: () => of(null),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
          },
        },
      ],
    });
    const store = TestBed.inject(CompanyStore);
    store.company.set(company);
    store.packages.set([
      {
        ...pack,
        revisions: [
          { ...pack.revisions[0], features: ['projects', 'tendering'] },
          { ...pack.revisions[1], id: 'r3', number: 3, features: ['projects'] },
        ],
      },
    ]);
    const fixture = TestBed.createComponent(CompanyPlanPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector('select[name="change-revision"]') as HTMLSelectElement;
    select.value = 'r3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('Wind down first'),
      ) as HTMLButtonElement
    ).click();
    expect(startGrace).toHaveBeenCalledWith('company-1', 30, 'r3', 'v1');
  });
});

describe('Company deletion (CF-071)', () => {
  const suspended: Company = { ...company, isActive: false, accessState: 'Suspended' };

  function render(item: Company, api: Partial<PlatformApi>) {
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            company: () => of(item),
            packages: () => of([]),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
            ...api,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(item);
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('schedules a suspended company\u2019s deletion on its written request', async () => {
    const schedulePurge = vi.fn(() =>
      of({
        ...suspended,
        version: 'v2',
        purgeAfterUtc: '2099-01-01T00:00:00Z',
        purgeRequestReference: 'DPA-7',
      }),
    );
    const { fixture, element } = render(suspended, { schedulePurge });
    await fixture.whenStable();
    const reference = element.querySelector('#purge-reference') as HTMLInputElement;
    reference.value = 'DPA-7';
    reference.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('Schedule the deletion'),
      ) as HTMLButtonElement
    ).click();
    expect(schedulePurge).toHaveBeenCalledWith('company-1', 30, 'DPA-7', 'v1');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="company-purge"]')!.textContent).toContain(
      'on request DPA-7',
    );
  });

  it('allows anonymised aggregates only with a legal basis, and can return to this company only', async () => {
    const basis = 'Pilot agreement 2026-07, clause 9.2';
    const setIntelligenceReuse = vi.fn(() =>
      of({
        ...suspended,
        version: 'v2',
        intelligenceReuse: 'AnonymizedAggregate' as const,
        intelligenceReuseLegalBasis: basis,
      }),
    );
    const { fixture, element } = render(suspended, { setIntelligenceReuse });
    await fixture.whenStable();
    const panel = () => element.querySelector('[data-testid="company-reuse"]')!;
    const button = (label: string) =>
      Array.from(panel().querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(label),
      ) as HTMLButtonElement;
    expect(panel().textContent).toContain('This company only');
    const field = element.querySelector('#reuse-basis') as HTMLTextAreaElement;
    field.value = 'agreed';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button('Allow anonymised aggregates').disabled).toBe(true);
    field.value = basis;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Allow anonymised aggregates').click();
    expect(setIntelligenceReuse).toHaveBeenCalledWith(
      'company-1',
      'AnonymizedAggregate',
      basis,
      'v1',
    );
    fixture.detectChanges();
    expect(panel().textContent).toContain(basis);
    button('Return to this company only').click();
    expect(setIntelligenceReuse).toHaveBeenLastCalledWith('company-1', 'TenantOnly', null, 'v2');
  });

  it('runs a due deletion only with the company code typed, and shows the certificate', async () => {
    const due: Company = {
      ...suspended,
      purgeAfterUtc: '2020-01-01T00:00:00Z',
      purgeRequestReference: 'DPA-7',
    };
    const purge = vi.fn(() =>
      of({
        companyId: 'company-1',
        code: 'delta',
        purgedAtUtc: '2026-10-02T00:00:00Z',
        requestReference: 'DPA-7',
        rows: { 'tendering.tenders': 3 },
        totalRows: 120,
        files: 4,
        filesMissing: 0,
      }),
    );
    const { fixture, element } = render(due, { purge });
    (
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes("Delete the company's data now"),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const code = element.querySelector('#purge-code') as HTMLInputElement;
    code.value = 'delta';
    code.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('[role="dialog"] button.prj-btn--danger') as HTMLButtonElement).click();
    expect(purge).toHaveBeenCalledWith('company-1', 'delta', 'v1');
    TestBed.inject(CompanyStore).company.set({
      ...due,
      accessState: 'Purged',
      purgedAtUtc: '2026-10-02T00:00:00Z',
    });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="purge-certificate"]')!.textContent).toContain(
      'Deleted 120 records and 4 files',
    );
  });
});

describe('Commercial terms (CF-127)', () => {
  const inDays = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  it('reminds the operator 30 and 7 days before a dated term ends, and once it has ended', () => {
    const base = {
      ...company,
      commercialMode: 'PaidPilot' as const,
      commercialStartsOn: inDays(-60),
    };
    expect(endWarning({ ...base, commercialEndsOn: inDays(45) })).toBeNull();
    expect(endWarning({ ...base, commercialEndsOn: inDays(20) })).toEqual({
      kind: 'month',
      days: 20,
    });
    expect(endWarning({ ...base, commercialEndsOn: inDays(5) })).toEqual({ kind: 'week', days: 5 });
    expect(endWarning({ ...base, commercialEndsOn: inDays(-3) })).toEqual({
      kind: 'ended',
      days: 3,
    });
    expect(
      endWarning({ ...base, commercialMode: 'Subscribed', commercialEndsOn: null }),
    ).toBeNull();
  });

  it('records the commercial terms from the overview', async () => {
    const setCommercialTerms = vi.fn(() =>
      of({
        ...company,
        version: 'v2',
        commercialMode: 'PaidPilot' as const,
        commercialStartsOn: '2026-10-01',
        commercialEndsOn: '2026-12-31',
      }),
    );
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            company: () => of(company),
            packages: () => of([]),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of([]),
            setCommercialTerms,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(company);
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const panel = element.querySelector('[data-testid="company-commercial"]')!;
    expect(panel.textContent).toContain('Not recorded');
    (
      Array.from(panel.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Record commercial terms'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const set = (selector: string, value: string, event = 'input') => {
      const field = element.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
      field.value = value;
      field.dispatchEvent(new Event(event));
    };
    set('#terms-mode', 'PaidPilot', 'change');
    set('#terms-starts', '2026-10-01');
    set('#terms-ends', '2026-12-31');
    set('#terms-reference', 'PP-2026-01');
    fixture.detectChanges();
    (
      Array.from(panel.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Save commercial terms'),
      ) as HTMLButtonElement
    ).click();
    expect(setCommercialTerms).toHaveBeenCalledWith(
      'company-1',
      { mode: 'PaidPilot', startsOn: '2026-10-01', endsOn: '2026-12-31', reference: 'PP-2026-01' },
      'v1',
    );
    fixture.detectChanges();
    expect(panel.textContent).toContain('Paid pilot');
  });
});

describe('Residency (OD-20)', () => {
  const policies = {
    deploymentRegion: 'local',
    policies: [
      {
        id: 'p-qa',
        code: 'qa',
        name: 'Qatar market',
        region: 'local',
        recommendedCountries: ['QA'],
        minimumRetentionDays: 30,
        allowsOverride: true,
        isActive: true,
        version: 'pv1',
        assignedCompanies: 0,
      },
      {
        id: 'p-gcc',
        code: 'gcc',
        name: 'GCC market',
        region: 'local',
        recommendedCountries: ['SA'],
        minimumRetentionDays: 14,
        allowsOverride: true,
        isActive: true,
        version: 'pv1',
        assignedCompanies: 0,
      },
      {
        id: 'p-eu',
        code: 'eu',
        name: 'Europe',
        region: 'eu-west-1',
        recommendedCountries: ['DE'],
        minimumRetentionDays: 0,
        allowsOverride: true,
        isActive: true,
        version: 'pv1',
        assignedCompanies: 0,
      },
    ],
  };

  it('reads a list of country codes the way an operator types it', () => {
    expect(countryList('qa, SA;ae  qa')).toEqual(['QA', 'SA', 'AE']);
  });

  it('offers only policies kept in this deployment and asks why when not the recommended one', async () => {
    const setResidency = vi.fn(() =>
      of({ ...company, version: 'v2', countryCode: 'QA', residencyPolicyId: 'p-gcc' }),
    );
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            residencyPolicies: () => of(policies),
            adminRecoveries: () => of([]),
            setResidency,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(company);
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const options = Array.from(element.querySelectorAll('#residency-policy option')).map(
      (option) => option.textContent ?? '',
    );
    expect(options.some((text) => text.includes('Europe'))).toBe(false);
    const country = element.querySelector('#residency-country') as HTMLInputElement;
    country.value = 'qa';
    country.dispatchEvent(new Event('input'));
    const select = element.querySelector('#residency-policy') as HTMLSelectElement;
    select.value = 'p-gcc';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    const reason = element.querySelector('#residency-reason') as HTMLTextAreaElement;
    expect(reason).not.toBeNull();
    reason.value = 'Group contract requires the GCC policy';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      Array.from(element.querySelectorAll('[data-testid="company-residency"] button')).find(
        (button) => button.textContent?.includes('Place under this policy'),
      ) as HTMLButtonElement
    ).click();
    expect(setResidency).toHaveBeenCalledWith(
      'company-1',
      'QA',
      'p-gcc',
      'Group contract requires the GCC policy',
      'v1',
    );
  });
});

describe('Company Admin recovery (CF-079)', () => {
  function render(recoveries: unknown[], api: Partial<PlatformApi> = {}) {
    TestBed.configureTestingModule({
      imports: [CompanyOverview],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            companyUsage: () => of(null),
            residencyPolicies: () => of({ deploymentRegion: 'local', policies: [] }),
            adminRecoveries: () => of(recoveries),
            ...api,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(company);
    const fixture = TestBed.createComponent(CompanyOverview);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  const pending: AdminRecovery = {
    id: 'r1',
    companyId: 'company-1',
    email: 'new.admin@example.com',
    displayName: 'New Admin',
    requestReference: 'SR-17',
    requestedBy: 'operator-a',
    requestedByName: 'Operator A',
    requestedAtUtc: '2026-10-02T08:00:00Z',
    status: 'Pending',
    decidedBy: null,
    decidedByName: null,
    decidedAtUtc: null,
  };

  it('lets a second operator approve, and never the operator who asked', async () => {
    const decideAdminRecovery = vi.fn(() => of({ ...pending, status: 'Completed' as const }));
    const { fixture, element } = render([pending], { decideAdminRecovery });
    await fixture.whenStable();
    const session = TestBed.inject(PlatformSessionService) as unknown as {
      current: { set: (value: unknown) => void };
    };
    session.current.set({ id: 'operator-a', email: 'a@example.com' });
    fixture.detectChanges();
    const panel = element.querySelector('[data-testid="admin-recovery"]')!;
    expect(panel.textContent).toContain('Waiting for a second operator');
    session.current.set({ id: 'operator-b', email: 'b@example.com' });
    fixture.detectChanges();
    (
      Array.from(panel.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Approve and invite'),
      ) as HTMLButtonElement
    ).click();
    expect(decideAdminRecovery).toHaveBeenCalledWith('company-1', 'r1', 'approve');
  });
});

describe('Keys (CF-118)', () => {
  const status = {
    currentKeyId: 'efe962ee',
    previousKeyIds: ['b2a89266'],
    keyRingEncrypted: false,
    stores: [{ store: 'tender_invitation_links', current: 3, previous: 2, unreadable: 0 }],
  };

  it('shows fingerprints and counts, warns about an unencrypted ring, and rewraps with a fresh key on request', async () => {
    const rewrapSecrets = vi.fn(() =>
      of({
        rewrapped: 2,
        unreadable: 0,
        conflicts: 0,
        dataProtectionKeyCreated: true,
        status: {
          ...status,
          keyRingEncrypted: true,
          stores: [{ store: 'tender_invitation_links', current: 5, previous: 0, unreadable: 0 }],
        },
      }),
    );
    TestBed.configureTestingModule({
      imports: [SecretKeys],
      providers: [
        { provide: PlatformApi, useValue: { secretKeys: () => of(status), rewrapSecrets } },
      ],
    });
    const fixture = TestBed.createComponent(SecretKeys);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('efe962ee');
    expect(element.textContent).toContain('b2a89266');
    expect(element.textContent).toContain('Not encrypted at rest');
    expect(element.querySelector('[data-testid="secret-stores"]')!.textContent).toContain(
      'tender_invitation_links',
    );
    fixture.componentInstance.createKey = true;
    fixture.componentInstance.rewrap();
    fixture.detectChanges();
    expect(rewrapSecrets).toHaveBeenCalledWith(true);
    expect(element.querySelector('[data-testid="secret-rewrap-result"]')!.textContent).toContain(
      'Rewrapped 2 value(s)',
    );
    expect(element.textContent).toContain('Encrypted at rest with its certificate');
  });
});

describe('Platform audit: request context (CF-122 AC8)', () => {
  it('says "Request not recorded" for an operator event without one, and nothing for a system event', () => {
    const entry = {
      atUtc: '2026-10-02T09:00:00Z',
      actorName: null,
      action: 'company.suspended',
      companyId: null,
      companyCode: 'DELTA',
      metadataJson: '{}',
      request: null,
    };
    TestBed.configureTestingModule({
      imports: [PlatformAudit],
      providers: [
        {
          provide: PlatformApi,
          useValue: {
            audit: () =>
              of({
                items: [
                  { ...entry, id: 'o', actor: 'operator-a', actorName: 'Operator A' },
                  { ...entry, id: 's', actor: 'system:lifecycle' },
                  {
                    ...entry,
                    id: 'r',
                    actor: 'operator-a',
                    request: { requestId: 'req-1', sourceAddress: null, userAgent: null },
                  },
                ],
                page: 1,
                pageSize: 25,
                totalCount: 3,
              }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlatformAudit);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const missing = [...element.querySelectorAll('[data-testid="platform-audit-request-missing"]')];
    expect(missing).toHaveLength(1);
    expect(missing[0].textContent!.trim()).toBe('Request not recorded');
    expect(missing[0].closest('tr')!.textContent).toContain('Operator A');
    expect(element.querySelectorAll('[data-testid="platform-audit-request"]')).toHaveLength(1);
  });
});
