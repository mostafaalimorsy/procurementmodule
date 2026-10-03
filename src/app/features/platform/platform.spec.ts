import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { PlatformSessionService } from '../../core/auth/platform-session.service';
import { AccessPolicy, EntitlementCatalogue, PlatformApi } from './platform-api.service';
import { BuilderSubmission, PackageBuilder } from './package-builder';
import { CompanyAccess } from './company-access';
import { CompanyStore } from './company-store';
import { Companies } from './companies';
import { PlatformLogin } from './platform-login';
import { PolicyFields } from './policy-fields';

describe('Platform forms', () => {
  it('requires and submits the first Company Admin display name with provisioning', async () => {
    const company = {
      id: 'company-1',
      code: 'delta',
      name: 'Delta Construction',
      isActive: true,
      packageRevisionId: 'revision-1',
      firstAdminEmail: 'nadia@delta.example',
      firstAdminState: 'InvitationIssued',
      createdAtUtc: '2026-09-12T00:00:00Z',
      updatedAtUtc: '2026-09-12T00:00:00Z',
      accessPolicy: { emailDomains: ['delta.example'], ipRules: [], locationRules: [] },
    };
    const createCompany = vi.fn(() => of(company));
    TestBed.configureTestingModule({
      imports: [Companies],
      providers: [
        provideRouter([]),
        {
          provide: PlatformApi,
          useValue: {
            companies: () => of([]),
            companiesUsage: () => of([]),
            accessCapabilities: () => of({ clientAddress: true, location: true }),
            packages: () =>
              of([
                {
                  id: 'package-1',
                  code: 'professional',
                  isActive: true,
                  revisions: [
                    {
                      id: 'revision-1',
                      number: 1,
                      displayName: 'Professional',
                      description: '',
                      features: ['projects'],
                      limits: { max_users: 20, max_active_projects: 3 },
                      createdAtUtc: '2026-09-12T00:00:00Z',
                    },
                  ],
                },
              ]),
            createCompany,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Companies);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.code = 'delta';
    fixture.componentInstance.name = company.name;
    fixture.componentInstance.packageRevisionId = company.packageRevisionId;
    fixture.componentInstance.firstAdminDisplayName = '  Nadia Khalil  ';
    fixture.componentInstance.firstAdminEmail = company.firstAdminEmail;
    fixture.componentInstance.policy = company.accessPolicy;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.componentInstance.provision();

    expect(createCompany).toHaveBeenCalledWith({
      code: 'delta',
      name: company.name,
      packageRevisionId: company.packageRevisionId,
      firstAdminDisplayName: 'Nadia Khalil',
      firstAdminEmail: company.firstAdminEmail,
      accessPolicy: company.accessPolicy,
    });
    expect(fixture.nativeElement.querySelector('input[name="adminName"]').required).toBe(true);
    const copy = fixture.nativeElement.textContent as string;
    expect(copy).toContain('receives a one-time invitation');
    expect(copy).not.toContain('not yet available');
  });

  it('clears the password field immediately when sign in is submitted', () => {
    const pending = new Subject<void>();
    const login = vi.fn(() => pending);
    TestBed.configureTestingModule({
      imports: [PlatformLogin],
      providers: [provideRouter([]), { provide: PlatformSessionService, useValue: { login } }],
    });
    const fixture = TestBed.createComponent(PlatformLogin);
    fixture.componentInstance.email = 'operator@example.com';
    fixture.componentInstance.password = 'test-password';
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.password).toBe('');
    expect(fixture.componentInstance.busy()).toBe(true);
    pending.error(new Error('Denied'));
    expect(fixture.componentInstance.password).toBe('');
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('Sign in failed');
  });

  it('asks for the TOTP code after the password, shows a new key to enroll, and signs in only on the code (CF-066)', () => {
    const login = vi.fn(() =>
      of({
        status: 'enrollment_required' as const,
        challenge: 'challenge-1',
        secret: 'JBSWY3DPEHPK3PXP',
        provisioningUri: 'otpauth://totp/x',
      }),
    );
    const verify = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [PlatformLogin],
      providers: [
        provideRouter([{ path: 'platform/companies', children: [] }]),
        { provide: PlatformSessionService, useValue: { login, verify } },
      ],
    });
    const fixture = TestBed.createComponent(PlatformLogin);
    fixture.componentInstance.email = 'operator@example.com';
    fixture.componentInstance.password = 'test-password';
    fixture.componentInstance.submit();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="totp-secret"]')!.textContent).toContain(
      'JBSW Y3DP EHPK 3PXP',
    );
    expect(verify).not.toHaveBeenCalled();
    fixture.componentInstance.code = '123 456';
    fixture.componentInstance.verify(fixture.componentInstance.step()!);
    expect(verify).toHaveBeenCalledWith('challenge-1', '123456');
    expect(fixture.componentInstance.step()).toBeNull();
  });

  it('preserves distinct email, IP and location rules for authoritative server validation', async () => {
    TestBed.configureTestingModule({ imports: [PolicyFields] });
    const fixture = TestBed.createComponent(PolicyFields);
    fixture.componentRef.setInput('initial', {
      emailDomains: ['company.com'],
      ipRules: ['::1'],
      locationRules: [{ country: 'US', region: 'CA' }],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.locations).toBe('US/CA');
    const changed = vi.fn();
    fixture.componentInstance.policyChange.subscribe(changed);
    fixture.componentInstance.domains = 'Company.COM\nsubsidiary.ae';
    fixture.componentInstance.ips = '192.0.2.0/24\n2001:db8::/32';
    fixture.componentInstance.locations = 'AE\nUS/CA';
    fixture.componentInstance.changed();
    expect(changed).toHaveBeenCalledWith({
      emailDomains: ['Company.COM', 'subsidiary.ae'],
      ipRules: ['192.0.2.0/24', '2001:db8::/32'],
      locationRules: [{ country: 'AE' }, { country: 'US', region: 'CA' }],
    });
  });

  it('retains edits across fields and submits the combined company access policy', async () => {
    const company = {
      id: 'company-1',
      code: 'company',
      name: 'Company',
      isActive: true,
      packageRevisionId: 'revision-1',
      firstAdminEmail: 'admin@company.com',
      firstAdminState: 'Pending',
      createdAtUtc: '2026-09-10T00:00:00Z',
      updatedAtUtc: '2026-09-10T00:00:00Z',
      version: 'v1',
      accessPolicy: {
        emailDomains: ['company.com'],
        ipRules: ['192.0.2.1'],
        locationRules: [{ country: 'US', region: 'CA' }],
      },
    };
    const policy = vi.fn((_id: string, accessPolicy: AccessPolicy) =>
      of({ ...company, accessPolicy }),
    );
    TestBed.configureTestingModule({
      imports: [CompanyAccess],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            company: () => of(company),
            packages: () => of([]),
            companyUsage: () => of(null),
            accessCapabilities: () => of({ clientAddress: true, location: true }),
            policy,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(company);
    const fixture = TestBed.createComponent(CompanyAccess);
    fixture.detectChanges();
    await fixture.whenStable();
    const field = (name: string) =>
      fixture.nativeElement.querySelector(`textarea[name="${name}"]`) as HTMLTextAreaElement;
    expect(field('ips').value).toBe('192.0.2.1');
    expect(field('locations').value).toBe('US/CA');
    field('domains').value = 'company.com\nsubsidiary.ae';
    field('domains').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    field('ips').value = '192.0.2.0/24';
    field('ips').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field('domains').value).toBe('company.com\nsubsidiary.ae');
    expect(field('locations').value).toBe('US/CA');
    // Replacing an IP rule may block someone, so the consequence is stated before saving.
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();
    expect(policy).not.toHaveBeenCalled();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('IP rules become narrower');
    (dialog.querySelector('button.prj-btn') as HTMLButtonElement).click();
    expect(policy).toHaveBeenCalledWith(
      company.id,
      {
        emailDomains: ['company.com', 'subsidiary.ae'],
        ipRules: ['192.0.2.0/24'],
        locationRules: [{ country: 'US', region: 'CA' }],
      },
      'v1',
    );
  });
});

describe('Company access policy capability (ADR-176)', () => {
  it('says the country rule follows the request’s IP location and, where it cannot be enforced, shows the lockout and saves only its removal', async () => {
    const company = {
      id: 'company-1',
      code: 'delta',
      name: 'Delta',
      isActive: true,
      packageRevisionId: 'revision-1',
      firstAdminEmail: 'admin@delta.test',
      firstAdminState: 'Active',
      createdAtUtc: '2026-10-03T00:00:00Z',
      updatedAtUtc: '2026-10-03T00:00:00Z',
      version: 'v1',
      accessPolicy: {
        emailDomains: ['delta.test'],
        ipRules: [],
        locationRules: [{ country: 'EG' }],
      },
    };
    const policy = vi.fn((_id: string, accessPolicy: AccessPolicy) =>
      of({ ...company, accessPolicy }),
    );
    TestBed.configureTestingModule({
      imports: [CompanyAccess],
      providers: [
        CompanyStore,
        {
          provide: PlatformApi,
          useValue: {
            company: () => of(company),
            packages: () => of([]),
            companyUsage: () => of(null),
            accessCapabilities: () => of({ clientAddress: false, location: false }),
            policy,
          },
        },
      ],
    });
    TestBed.inject(CompanyStore).company.set(company);
    const fixture = TestBed.createComponent(CompanyAccess);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const save = () => element.querySelector('form button') as HTMLButtonElement;
    const locations = element.querySelector('textarea[name="locations"]') as HTMLTextAreaElement;
    expect(element.textContent).toContain('internet (IP) address is located');
    expect(element.textContent).toContain('not the company’s country');
    expect(element.textContent).toContain('Company rules never apply to Platform Operators');
    expect(element.querySelector('[data-testid="policy-locked-out"]')?.textContent).toContain(
      'every user of this company is denied',
    );
    expect(element.querySelector('[data-testid="policy-locations-unavailable"]')).not.toBeNull();
    expect(locations.getAttribute('aria-invalid')).toBe('true');
    expect(save().disabled).toBe(true);

    locations.value = '';
    locations.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(locations.getAttribute('aria-invalid')).toBeNull();
    expect(save().disabled).toBe(false);
    // Removing every country rule can block nobody, so it is saved without a confirmation.
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(policy).toHaveBeenCalledWith(
      company.id,
      { emailDomains: ['delta.test'], ipRules: [], locationRules: [] },
      'v1',
    );
  });

  it('accepts a country rule where the deployment can locate requests', async () => {
    TestBed.configureTestingModule({ imports: [PolicyFields] });
    const fixture = TestBed.createComponent(PolicyFields);
    fixture.componentRef.setInput('capabilities', { clientAddress: true, location: true });
    const enforceable = vi.fn();
    fixture.componentInstance.enforceableChange.subscribe(enforceable);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.locations = 'EG';
    fixture.componentInstance.changed();
    expect(enforceable).toHaveBeenLastCalledWith(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'This deployment can determine each request’s country.',
    );
    fixture.componentRef.setInput('capabilities', { clientAddress: true, location: false });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(enforceable).toHaveBeenLastCalledWith(false);
  });
});

describe('Platform API mutations', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
    TestBed.inject(HttpTestingController).verify();
  });
  it('assigns an explicit revision and sends same-origin CSRF without tenant identity headers', () => {
    document.cookie = 'XSRF-TOKEN=platform-csrf; Path=/';
    TestBed.inject(PlatformApi).assignPackage('company-1', 'revision-2', 'version-7').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/platform/companies/company-1/package',
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ packageRevisionId: 'revision-2', version: 'version-7' });
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('platform-csrf');
    expect(request.request.headers.has('X-Tenant-Id')).toBe(false);
    request.flush({});
  });
});

const catalogue: EntitlementCatalogue = {
  features: [
    { key: 'projects', available: true },
    { key: 'tendering', available: false },
  ],
  limits: [
    {
      key: 'max_users',
      measured: true,
      minimum: 1,
      requiredWithFeature: null,
      requiredForAssignment: true,
    },
    {
      key: 'max_active_projects',
      measured: true,
      minimum: 1,
      requiredWithFeature: 'projects',
      requiredForAssignment: false,
    },
    {
      key: 'max_subcontractors',
      measured: false,
      minimum: 0,
      requiredWithFeature: null,
      requiredForAssignment: false,
    },
  ],
};

const workflowCatalogue: EntitlementCatalogue = {
  features: [
    { key: 'projects', available: true },
    { key: 'subcontractor_directory', available: true },
    { key: 'sourcing', available: true },
    { key: 'tendering', available: true },
    { key: 'evaluation', available: true },
    { key: 'award', available: true },
  ],
  limits: [
    {
      key: 'max_users',
      measured: true,
      minimum: 1,
      requiredWithFeature: null,
      requiredForAssignment: true,
    },
  ],
  workflowStages: ['tendering', 'evaluation', 'award', 'performance'],
  refusedWorkflowEnds: ['tendering'],
};

describe('Package builder workflow (CF-060)', () => {
  function render(features: string[]) {
    const fixture = TestBed.createComponent(PackageBuilder);
    fixture.componentRef.setInput('catalogue', workflowCatalogue);
    fixture.componentRef.setInput('base', builderBase({ features, limits: { max_users: 10 } }));
    fixture.componentRef.setInput('packageCode', 'standard');
    const emitted: BuilderSubmission[] = [];
    fixture.componentInstance.submitted.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, emitted };
  }
  const base = ['projects', 'subcontractor_directory', 'sourcing', 'tendering'];

  it('refuses tendering without evaluation: its bids could never be opened', () => {
    const { fixture, element, emitted } = render(base);
    expect(element.querySelector('[data-testid="workflow-refused"]')).not.toBeNull();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(emitted).toEqual([]);
  });

  it('saves a plan that ends at evaluation only once the operator acknowledges it, and sends that end', () => {
    const { fixture, element, emitted } = render([...base, 'evaluation']);
    const acknowledgement = element.querySelector(
      '[data-testid="workflow-end"] input',
    ) as HTMLInputElement;
    expect(element.querySelector('[data-testid="workflow-end"]')!.textContent).toContain('ends at');
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted).toEqual([]);
    acknowledgement.click();
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0].acknowledgedWorkflowEnd).toBe('evaluation');
  });
});

/** The server's catalogue as this build describes it (EntitlementCatalogue.Describe): nine sellable features, two reserved. */
const fullCatalogue: EntitlementCatalogue = {
  features: [
    { key: 'projects', available: true, requiresFeatures: [] },
    { key: 'subcontractor_directory', available: true, requiresFeatures: [] },
    { key: 'sourcing', available: true, requiresFeatures: ['projects', 'subcontractor_directory'] },
    {
      key: 'tendering',
      available: true,
      requiresFeatures: ['projects', 'subcontractor_directory', 'sourcing'],
    },
    { key: 'bidder_portal', available: false, requiresFeatures: [] },
    {
      key: 'evaluation',
      available: true,
      requiresFeatures: ['projects', 'subcontractor_directory', 'sourcing', 'tendering'],
    },
    {
      key: 'award',
      available: true,
      requiresFeatures: [
        'projects',
        'subcontractor_directory',
        'sourcing',
        'tendering',
        'evaluation',
      ],
    },
    {
      key: 'performance',
      available: true,
      requiresFeatures: [
        'projects',
        'subcontractor_directory',
        'sourcing',
        'tendering',
        'evaluation',
        'award',
      ],
    },
    {
      key: 'intelligence',
      available: true,
      requiresFeatures: [
        'projects',
        'subcontractor_directory',
        'sourcing',
        'tendering',
        'evaluation',
        'award',
        'performance',
      ],
    },
    { key: 'advanced_reporting', available: false, requiresFeatures: [] },
    { key: 'custom_smtp', available: true, requiresFeatures: ['tendering'] },
  ],
  limits: [
    {
      key: 'max_users',
      measured: true,
      minimum: 1,
      requiredWithFeature: null,
      requiredForAssignment: true,
    },
  ],
  workflowStages: ['tendering', 'evaluation', 'award', 'performance'],
  refusedWorkflowEnds: ['tendering'],
};

describe('Package builder and the feature catalogue', () => {
  function render(features: string[] = []) {
    const fixture = TestBed.createComponent(PackageBuilder);
    fixture.componentRef.setInput('catalogue', fullCatalogue);
    fixture.componentRef.setInput('base', builderBase({ features, limits: { max_users: 10 } }));
    fixture.componentRef.setInput('packageCode', 'standard');
    const emitted: BuilderSubmission[] = [];
    fixture.componentInstance.submitted.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, emitted };
  }

  it('offers a checkbox for every sellable feature and none for a reserved one', () => {
    const { element } = render();
    for (const feature of fullCatalogue.features)
      expect(element.querySelector(`input[name="feature-${feature.key}"]`) !== null).toBe(
        feature.available,
      );
    expect(element.querySelector('[data-testid="builder-reserved-features"]')).toBeNull();
  });

  it('refuses to publish a feature without its prerequisites, and publishes it with them', async () => {
    const { fixture, element, emitted } = render(['projects']);
    await fixture.whenStable();
    (element.querySelector('input[name="feature-sourcing"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted).toEqual([]);
    expect(element.querySelector('#feature-sourcing-hint')?.textContent).toContain(
      'Also include Subcontractor directory',
    );
    (
      element.querySelector('input[name="feature-subcontractor_directory"]') as HTMLInputElement
    ).click();
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0].features).toEqual(['projects', 'sourcing', 'subcontractor_directory']);
  });

  it('lists reserved features held by an older revision as not carried and leaves them out', () => {
    const { element, emitted } = render(['projects', 'bidder_portal', 'advanced_reporting']);
    const notice = element.querySelector('[data-testid="builder-reserved-features"]')!.textContent!;
    expect(notice).toContain('Bidder portal');
    expect(notice).toContain('Advanced reporting');
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0].features).toEqual(['projects']);
  });
});

describe('Package builder', () => {
  function render(base: Parameters<typeof builderBase>[0] = null) {
    const fixture = TestBed.createComponent(PackageBuilder);
    fixture.componentRef.setInput('catalogue', catalogue);
    fixture.componentRef.setInput('base', builderBase(base));
    fixture.componentRef.setInput('packageCode', base ? 'standard' : '');
    const emitted: BuilderSubmission[] = [];
    fixture.componentInstance.submitted.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, emitted };
  }
  const type = async (element: HTMLElement, selector: string, value: string) => {
    const input = element.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('never asks the operator for a raw key, and offers only sellable capabilities', () => {
    const { element } = render();
    expect(element.querySelector('textarea[name="limits"], textarea[name="features"]')).toBeNull();
    expect(element.textContent).toContain('Projects');
    expect(element.textContent).not.toContain('Tendering');
    // Unmeasured capacity is not offered as an enforceable limit.
    expect(element.querySelector('#limit-max_subcontractors')).toBeNull();
    expect(element.querySelector('input[type="range"]')).toBeNull();
  });

  it('shows active-project capacity only when Projects is included, and requires it then', async () => {
    const { fixture, element, emitted } = render();
    // Template-driven controls attach their listeners once the form has settled.
    await fixture.whenStable();
    expect(element.querySelector('#limit-max_active_projects')).toBeNull();
    (element.querySelector('input[name="feature-projects"]') as HTMLInputElement).click();
    fixture.detectChanges();
    const capacity = element.querySelector('#limit-max_active_projects') as HTMLInputElement;
    expect(capacity).not.toBeNull();
    expect(capacity.type).toBe('number');
    expect(capacity.min).toBe('1');

    await type(element, 'input[name="code"]', 'standard');
    await type(element, 'input[name="displayName"]', 'Standard');
    await type(element, '#limit-max_users', '25');
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('Enter the contracted quantity');

    await fixture.whenStable();
    await type(element, '#limit-max_active_projects', '3');
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0]).toEqual({
      code: 'standard',
      displayName: 'Standard',
      description: '',
      features: ['projects'],
      limits: { max_users: 25, max_active_projects: 3 },
    });
  });

  it('names a reserved capability of the current revision as not carried, and keeps carried capacity unless cleared', () => {
    const { fixture, element, emitted } = render({
      features: ['projects', 'tendering'],
      limits: { max_users: 10, max_active_projects: 2, max_subcontractors: 40 },
    });
    // The server refuses any revision that grants a capability it cannot sell (ADR-163), so it is not offered as a choice.
    expect(element.querySelector('input[name="carried-tendering"]')).toBeNull();
    expect(
      element.querySelector('[data-testid="builder-reserved-features"]')?.textContent,
    ).toContain('Tendering');
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0].features).toEqual(['projects']);
    expect(emitted[0].limits).toEqual({
      max_users: 10,
      max_active_projects: 2,
      max_subcontractors: 40,
    });

    (
      element.querySelector('input[name="carried-limit-max_subcontractors"]') as HTMLInputElement
    ).click();
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[1].features).toEqual(['projects']);
    expect(emitted[1].limits).toEqual({ max_users: 10, max_active_projects: 2 });
    expect(element.textContent).toContain('Publish revision 2');
  });

  it('keeps existing capacity whose capability is absent until the operator explicitly clears it', () => {
    const original = { features: [] as string[], limits: { max_users: 5, max_active_projects: 4 } };
    const snapshot = structuredClone(original);
    const { fixture, element, emitted } = render(original);
    const preview = () => element.querySelector('.builder-preview')?.textContent ?? '';
    // Shown as a carried-over term, with its reason, and in the summary of what will be published.
    expect(element.querySelector('#limit-max_active_projects')).toBeNull();
    const kept = element.querySelector(
      'input[name="carried-limit-max_active_projects"]',
    ) as HTMLInputElement;
    expect(kept.checked).toBe(true);
    expect(element.textContent).toContain('Projects is not included');
    expect(preview()).toContain('4 active projects');

    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0].features).toEqual([]);
    expect(emitted[0].limits).toEqual({ max_users: 5, max_active_projects: 4 });

    kept.click();
    fixture.detectChanges();
    expect(preview()).not.toContain('active project');
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[1].limits).toEqual({ max_users: 5 });
    // The revision being revised is never changed by the builder.
    expect(original).toEqual(snapshot);
  });

  it('does not drop existing project capacity when Projects is unchecked', () => {
    const { fixture, element, emitted } = render({
      features: ['projects'],
      limits: { max_users: 10, max_active_projects: 2 },
    });
    const preview = () => element.querySelector('.builder-preview')?.textContent ?? '';
    (element.querySelector('input[name="feature-projects"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(element.querySelector('#limit-max_active_projects')).toBeNull();
    const kept = element.querySelector(
      'input[name="carried-limit-max_active_projects"]',
    ) as HTMLInputElement;
    expect(kept.checked).toBe(true);
    expect(preview()).toContain('2 active projects');
    expect(preview()).not.toContain('Projects');
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0]).toMatchObject({
      features: [],
      limits: { max_users: 10, max_active_projects: 2 },
    });

    kept.click();
    fixture.detectChanges();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[1]).toMatchObject({ features: [], limits: { max_users: 10 } });
    expect(preview()).toContain('10 users');
    expect(preview()).not.toContain('active project');
  });

  it('still applies the catalogue dependency to capacity typed for a brand-new package', async () => {
    const { fixture, element, emitted } = render();
    await fixture.whenStable();
    (element.querySelector('input[name="feature-projects"]') as HTMLInputElement).click();
    fixture.detectChanges();
    await type(element, 'input[name="code"]', 'fresh');
    await type(element, 'input[name="displayName"]', 'Fresh');
    await type(element, '#limit-max_users', '5');
    await type(element, '#limit-max_active_projects', '3');
    (element.querySelector('input[name="feature-projects"]') as HTMLInputElement).click();
    fixture.detectChanges();
    // Nothing existed before, so nothing is carried: the typed value was never a commercial term.
    expect(element.querySelector('input[name="carried-limit-max_active_projects"]')).toBeNull();
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    expect(emitted[0]).toMatchObject({ features: [], limits: { max_users: 5 } });
  });
});

function builderBase(terms: { features: string[]; limits: Record<string, number> } | null) {
  return terms
    ? {
        id: 'revision-1',
        number: 1,
        displayName: 'Standard',
        description: '',
        createdAtUtc: '2026-09-10T00:00:00Z',
        ...terms,
      }
    : null;
}
