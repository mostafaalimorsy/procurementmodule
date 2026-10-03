import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { CompanyPlan, TenantIdentityApi } from './tenant-identity.api';
import { CompanyPlanPanel } from './company-plan-panel';
import { UsersAdmin } from './users-admin';

/** CF-065: the users page also reads which roles sign in with an authenticator — and, for those who invite, the allow-list (B-115-2). */
function flushSecurity(http: HttpTestingController): void {
  for (const request of http.match('/api/v1/company/security'))
    request.flush({
      mfaRequiredRoles: ['CompanyAdmin'],
      alwaysRequired: ['CompanyAdmin'],
      isDefault: true,
      version: null,
    });
  for (const request of http.match('/api/v1/admin/access-policy'))
    request.flush({ domains: ['delta.example'], addresses: [] });
}

const plan: CompanyPlan = {
  packageCode: 'professional',
  packageDisplayName: 'Professional',
  revisionNumber: 1,
  packageRevisionId: 'revision-1',
  companyIsActive: true,
  features: ['projects'],
  quotas: [
    { key: 'max_users', usage: 2, limit: 1, overLimit: true, canCreate: false, measured: true },
    {
      key: 'max_active_projects',
      usage: 0,
      limit: 10,
      overLimit: false,
      canCreate: false,
      measured: false,
    },
  ],
};

describe('company plan presentation', () => {
  it('summarises measured and unmeasured quotas without inventing usage', () => {
    const fixture = TestBed.createComponent(CompanyPlanPanel);
    fixture.componentRef.setInput('plan', plan);
    fixture.detectChanges();
    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.quota-usage'),
      (row) => row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    // Same presentation model as the Platform Console: figures, share of the limit and band.
    expect(values[0]).toContain('2 / 1');
    expect(values[0]).toContain('200%');
    expect(values[0]).toContain('Over limit');
    expect(values[1]).toContain('Limit 10');
    expect(values[1]).toContain('Not yet tracked');
  });

  it('requests the plan read-only and exposes no way to change package terms', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(TenantIdentityApi);
    api.companyPlan().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/company/plan');
    expect(request.request.method).toBe('GET');
    request.flush(plan);
    // There is deliberately no client method that writes package, revision, limits or features.
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(api));
    expect(surface.filter((name) => /package|revision|limit|feature|policy/i.test(name))).toEqual(
      [],
    );
    flushSecurity(TestBed.inject(HttpTestingController));
    TestBed.inject(HttpTestingController).verify();
  });
});

describe('UsersAdmin capacity presentation', () => {
  function render(quotas: CompanyPlan['quotas']) {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Acme' }),
            hasPermission: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush([]);
    http.expectOne('/api/v1/company/plan').flush({ ...plan, quotas });
    fixture.detectChanges();
    return fixture;
  }

  it('disables the invite control and explains why when no seat is available', () => {
    const fixture = render(plan.quotas);
    const button = fixture.nativeElement.querySelector('.invite-panel button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('no seats available');
    expect(fixture.componentInstance.atSeatCapacity()).toBe(true);
    flushSecurity(TestBed.inject(HttpTestingController));
    TestBed.inject(HttpTestingController).verify();
  });

  it('leaves invitation available while seats remain, and never blocks on an unmeasured quota', () => {
    const fixture = render([
      { key: 'max_users', usage: 1, limit: 5, overLimit: false, canCreate: true, measured: true },
      {
        key: 'max_active_projects',
        usage: 0,
        limit: 10,
        overLimit: false,
        canCreate: false,
        measured: false,
      },
    ]);
    expect(fixture.componentInstance.atSeatCapacity()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Professional');
    flushSecurity(TestBed.inject(HttpTestingController));
    TestBed.inject(HttpTestingController).verify();
  });

  it('still renders the screen when the plan cannot be read, because it is advisory only', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { identity: () => null, hasPermission: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush([]);
    http.expectOne('/api/v1/company/plan').flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.componentInstance.plan()).toBeNull();
    // No plan means no client-side capacity claim: the server remains the only authority.
    expect(fixture.componentInstance.atSeatCapacity()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('People & access');
    flushSecurity(http);
    http.verify();
  });
});

describe('pending invitation revocation', () => {
  it('cancels the invitation through the admin resource and reloads the directory', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { identity: () => null, hasPermission: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const invited = {
      id: 'user-1',
      email: 'typo@company.com',
      displayName: 'Typo',
      role: 'ProjectManager',
      status: 'Invited',
      passwordResetRequired: false,
      createdAtUtc: '2026-09-12T00:00:00Z',
      updatedAtUtc: '2026-09-12T00:00:00Z',
    };
    http.expectOne('/api/v1/admin/users').flush([invited]);
    http.expectOne('/api/v1/company/plan').flush(plan);
    fixture.detectChanges();

    fixture.componentInstance.revokeInvitation(invited as never);
    const request = http.expectOne('/api/v1/admin/users/user-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });

    // The directory and plan are re-read so the freed seat is reflected immediately.
    http.expectOne('/api/v1/admin/users').flush([]);
    http.expectOne('/api/v1/company/plan').flush(plan);
    expect(fixture.componentInstance.users()).toEqual([]);
    flushSecurity(http);
    http.verify();
  });
});

describe('UsersAdmin invitation email state (CF-078)', () => {
  const user = (overrides: Record<string, unknown>) => ({
    id: 'u1',
    email: 'new.member@acme.example',
    displayName: 'New Member',
    role: 'ProcurementOfficer',
    additionalRoles: [],
    status: 'Invited',
    passwordResetRequired: false,
    createdAtUtc: '2026-10-01T09:00:00Z',
    updatedAtUtc: '2026-10-01T09:00:00Z',
    ...overrides,
  });
  const mail = (overrides: Record<string, unknown>) => ({
    status: 'Queued',
    failureCategory: null,
    attempts: 0,
    maxAttempts: 5,
    queuedAtUtc: '2026-10-01T09:00:00Z',
    nextAttemptAtUtc: '2026-10-01T09:00:00Z',
    sentAtUtc: null,
    ...overrides,
  });

  function render(users: unknown[]) {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { identity: () => ({ companyName: 'Acme' }), hasPermission: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush(users);
    http.expectOne('/api/v1/company/plan').flush(plan);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a retrying invitation with its reason, a failed one as a status to act on, and nothing for an active user', () => {
    const element = render([
      user({
        invitationEmail: mail({ attempts: 2, failureCategory: 'recipient_rejected' }),
      }),
      user({
        id: 'u2',
        email: 'other@acme.example',
        invitationEmail: mail({
          status: 'Failed',
          attempts: 5,
          failureCategory: 'connection_failed',
          nextAttemptAtUtc: null,
        }),
      }),
      user({ id: 'u3', email: 'active@acme.example', status: 'Active', invitationEmail: null }),
    ]);
    const notes = [...element.querySelectorAll('.invitation-mail')].map(
      (note) => note.textContent ?? '',
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('refused the recipient address');
    expect(notes[0]).toContain('attempt 2 of 5');
    expect(notes[1]).toContain('Could not connect to the mail server');
    expect(notes[1]).toContain('then resend');
    expect(element.querySelector('.invitation-mail--failed')?.getAttribute('role')).toBe('status');
    flushSecurity(TestBed.inject(HttpTestingController));
    TestBed.inject(HttpTestingController).verify();
  });
});
