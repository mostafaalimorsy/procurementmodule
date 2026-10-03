import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenantUser } from './tenant-identity.api';
import { UsersAdmin } from './users-admin';

// CF-088: suspending, forcing a reset and resetting an authenticator are confirmed first; one's own row offers nothing the server refuses.

const button = (element: Element, label: string) =>
  Array.from(element.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().includes(label),
  ) as HTMLButtonElement | undefined;

function user(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    id: 'u2',
    email: 'omar@delta.example',
    displayName: 'Omar Officer',
    role: 'ProcurementOfficer',
    additionalRoles: [],
    status: 'Active',
    passwordResetRequired: false,
    mfaEnrolled: true,
    createdAtUtc: '2026-09-01T00:00:00Z',
    updatedAtUtc: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

const security = {
  mfaRequiredRoles: [],
  alwaysRequired: ['CompanyAdmin'],
  isDefault: true,
  version: null,
  idleTimeoutMinutes: 60,
};

describe('Users admin confirmations (CF-088)', () => {
  function render() {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush([
      user({
        id: 'u1',
        email: 'admin@delta.example',
        displayName: 'Dana Admin',
        role: 'CompanyAdmin',
      }),
      user(),
    ]);
    for (const request of http.match(() => true)) {
      if (request.request.url === '/api/v1/company/security')
        request.flush({
          mfaRequiredRoles: [],
          alwaysRequired: ['CompanyAdmin'],
          isDefault: true,
          version: null,
          idleTimeoutMinutes: 60,
        });
      else if (request.request.url !== '/api/v1/admin/users') request.flush(null);
    }
    fixture.detectChanges();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('asks before suspending, and sends nothing when the administrator keeps the access', () => {
    const { fixture, http, element } = render();
    const rows = element.querySelectorAll('tbody tr');
    button(rows[1], 'Suspend')!.click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('They lose access at once');
    expect(dialog.textContent).toContain('omar@delta.example');
    http.expectNone('/api/v1/admin/users/u2/status');
    button(dialog, 'Cancel')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    http.expectNone('/api/v1/admin/users/u2/status');

    button(rows[1], 'Suspend')!.click();
    fixture.detectChanges();
    button(element.querySelector('[role="dialog"]')!, 'Suspend access')!.click();
    const request = http.expectOne('/api/v1/admin/users/u2/status');
    expect(request.request.body).toEqual({ status: 'Suspended' });
  });

  it('confirms a forced password reset and an authenticator reset before sending them', () => {
    const { fixture, http, element } = render();
    const row = element.querySelectorAll('tbody tr')[1];
    button(row, 'Force password reset')!.click();
    fixture.detectChanges();
    http.expectNone('/api/v1/admin/users/u2/force-password-reset');
    expect(element.querySelector('[role="dialog"]')!.textContent).toContain(
      'must set a new password',
    );
    button(element.querySelector('[role="dialog"]')!, 'Force a password reset')!.click();
    http.expectOne('/api/v1/admin/users/u2/force-password-reset').flush(null);
    fixture.detectChanges();

    button(row, 'Reset authenticator')!.click();
    fixture.detectChanges();
    http.expectNone('/api/v1/admin/users/u2/mfa/reset');
    button(element.querySelector('[role="dialog"]')!, 'Reset the authenticator')!.click();
    http.expectOne('/api/v1/admin/users/u2/mfa/reset');
  });

  it('offers no action and no role editor on the administrator’s own row', () => {
    const { element } = render();
    const [own, other] = Array.from(element.querySelectorAll('tbody tr'));
    expect(own.querySelector('[data-testid="self-row"]')).not.toBeNull();
    expect(own.querySelector('select')).toBeNull();
    expect(own.querySelectorAll('button')).toHaveLength(0);
    expect(other.querySelector('select')).not.toBeNull();
    expect(button(other, 'Suspend')).toBeDefined();
  });

  it('says until when an invitation link opens, and flags an expired one (CF-114)', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush([
      user({
        id: 'u5',
        email: 'fresh@delta.example',
        status: 'Invited',
        invitationExpiresAtUtc: '2099-01-08T09:00:00Z',
      }),
      user({
        id: 'u6',
        email: 'stale@delta.example',
        status: 'Invited',
        invitationExpiresAtUtc: '2020-01-08T09:00:00Z',
      }),
    ]);
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? {
              mfaRequiredRoles: [],
              alwaysRequired: [],
              isDefault: true,
              version: null,
              idleTimeoutMinutes: 60,
            }
          : null,
      );
    fixture.detectChanges();
    const [fresh, stale] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
    expect(fresh.querySelector('[data-testid="invitation-valid"]')!.textContent).toContain('2099');
    expect(fresh.querySelector('[data-testid="invitation-expired"]')).toBeNull();
    expect(stale.querySelector('[data-testid="invitation-expired"]')!.textContent).toContain(
      'resend',
    );
  });

  it('shows the company allow-list read only, with no control to change it (B-115-2)', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush([user()]);
    http
      .expectOne('/api/v1/admin/access-policy')
      .flush({ domains: ['delta.example', 'delta.qa'], addresses: ['qs@pmc.example'] });
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? security
          : request.request.url === '/api/v1/admin/users'
            ? []
            : null,
      );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const help = element.querySelector('.invite-help')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(help).toBe(
      'The email must match one of your company’s allowed domains or named addresses. The user receives a one-time link and sets their own password.',
    );
    const list = element.querySelector('[data-testid="allow-list"]')!;
    expect(list.querySelector('h3')!.textContent!.trim()).toBe('Your company’s allow-list');
    const terms = [...list.querySelectorAll('dt')].map((term) => term.textContent!.trim());
    expect(terms).toEqual(['Allowed domains', 'Named addresses']);
    const [domains, addresses] = [...list.querySelectorAll('dd')].map((entry) =>
      [...entry.querySelectorAll('bdi[dir="ltr"]')].map((item) => item.textContent!.trim()),
    );
    expect(domains).toEqual(['delta.example', 'delta.qa']);
    expect(addresses).toEqual(['qs@pmc.example']);
    expect(list.textContent).toContain(
      'Only the platform operator changes this list — ask your account contact.',
    );
    // Read only: nothing to type, tick, choose or press.
    expect(
      list.querySelectorAll('input, select, textarea, button, [contenteditable]'),
    ).toHaveLength(0);
    http.verify();
  });

  it('says "None" for an empty part of the allow-list', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/admin/access-policy')
      .flush({ domains: ['delta.example'], addresses: [] });
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? security
          : request.request.url === '/api/v1/admin/users'
            ? []
            : null,
      );
    fixture.detectChanges();
    const entries = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="allow-list"] dd'),
    ].map((entry) => entry.textContent!.trim());
    expect(entries).toEqual(['delta.example', 'None']);
  });

  it('hides the allow-list from a reader who cannot invite', () => {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: (permission: string) => permission !== 'Users.Invite',
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/api/v1/admin/access-policy');
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? security
          : request.request.url === '/api/v1/admin/users'
            ? []
            : null,
      );
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="allow-list"]'),
    ).toBeNull();
  });
});

describe('A member with additional roles (CF-035 AC1, red-team G019/D7)', () => {
  function render(permissions: (permission: string) => boolean = () => true) {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: permissions,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? security
          : request.request.url === '/api/v1/admin/users'
            ? [user({ additionalRoles: ['CommercialQs'] })]
            : null,
      );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = element.querySelector('tbody tr')!;
    const box = (label: string) =>
      [...row.querySelectorAll<HTMLLabelElement>('label.extra-role')]
        .find((item) => item.textContent!.trim() === label)!
        .querySelector('input') as HTMLInputElement;
    return { fixture, http, element, row, box };
  }

  it('shows both role labels on the row of a reader who cannot change roles', () => {
    const { row } = render((permission) => permission !== 'Users.ChangeRole');
    expect(row.querySelector('select')).toBeNull();
    const shown = row.textContent!.replace(/\s+/g, ' ');
    expect(shown).toContain('Procurement Engineer / Officer + Commercial / QS');
    expect(row.querySelector('.extra-role-chip')!.textContent!.trim()).toBe('+ Commercial / QS');
  });

  it('edits at most three roles in total and sends the additional roles with the main one', async () => {
    const { fixture, http, row, box } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((row.querySelector('select') as HTMLSelectElement).value).toBe('ProcurementOfficer');
    expect(row.querySelector('legend')!.textContent!.trim()).toBe('Also holds');
    const labels = [...row.querySelectorAll('label.extra-role')].map((item) =>
      item.textContent!.trim(),
    );
    // Company Admin is only ever a main role, and the main role is not offered again.
    expect(labels).not.toContain('Company Admin');
    expect(labels).not.toContain('Procurement Engineer / Officer');
    expect(box('Commercial / QS').checked).toBe(true);
    expect(box('Project Manager').disabled).toBe(false);

    // A second additional role reaches three in total: every other choice is disabled.
    box('Project Manager').checked = true;
    box('Project Manager').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const unchecked = [...row.querySelectorAll<HTMLInputElement>('label.extra-role input')].filter(
      (input) => !input.checked,
    );
    expect(unchecked.length).toBeGreaterThan(0);
    expect(unchecked.every((input) => input.disabled)).toBe(true);
    expect(box('Commercial / QS').disabled).toBe(false);

    button(row, 'Save')!.click();
    const request = http.expectOne('/api/v1/admin/users/u2/role');
    expect(request.request.body).toEqual({
      role: 'ProcurementOfficer',
      additionalRoles: ['CommercialQs', 'ProjectManager'],
    });
  });

  it('explains the refusal of a Technical Evaluator alongside a price-seeing role', () => {
    // The editor does not pre-empt the pairing; the server refuses it (user.roles_conflict) and the page says why.
    const { fixture, http, element, box } = render();
    box('Technical Evaluator').checked = true;
    box('Technical Evaluator').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button(element.querySelector('tbody tr')!, 'Save')!.click();
    http.expectOne('/api/v1/admin/users/u2/role').flush(
      {
        code: 'user.roles_conflict',
        parameters: { first: 'TechnicalEvaluator', second: 'CommercialQs' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')!.textContent).toContain(
      'Technical Evaluator and Commercial / QS cannot be held by the same person: technical evaluation stays commercially blind.',
    );
  });
});

describe('Sign-in security card', () => {
  async function render(canChange = true) {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: (permission: string) => canChange || permission !== 'Users.ChangeRole',
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true))
      request.flush(
        request.request.url === '/api/v1/company/security'
          ? { ...security, mfaRequiredRoles: ['ProcurementManager'], version: 'v1' }
          : request.request.url === '/api/v1/admin/users'
            ? [user()]
            : null,
      );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="sign-in-security"]',
    ) as HTMLElement;
    return { fixture, http, card };
  }

  it('groups the MFA roles and the session timeout, each control labelled beside its help', async () => {
    const { card } = await render();
    const groups = Array.from(card.querySelectorAll('fieldset'));
    expect(groups.map((group) => group.querySelector('legend')?.textContent?.trim())).toEqual([
      'Roles that sign in with an authenticator',
      'Session timeout',
    ]);
    // Every role is a checkbox inside its own label, next to its name.
    const rows = Array.from(groups[0].querySelectorAll('label'));
    expect(rows.length).toBe(7);
    for (const row of rows) {
      expect(row.firstElementChild?.matches('input[type="checkbox"]')).toBe(true);
      expect(row.textContent?.trim().length).toBeGreaterThan(0);
    }
    // The Company Admin always signs in with an authenticator: shown checked, locked, and said so.
    const admin = rows[0].querySelector('input') as HTMLInputElement;
    expect([admin.checked, admin.disabled]).toEqual([true, true]);
    expect(rows[0].textContent).toContain('Always required');
    const manager = rows.find((row) => row.textContent?.includes('Procurement Manager'))!;
    expect((manager.querySelector('input') as HTMLInputElement).checked).toBe(true);
    // The timeout input has its label and its help, which carries the range.
    const timeout = card.querySelector('#idle-minutes') as HTMLInputElement;
    expect(card.querySelector('label[for="idle-minutes"]')?.textContent).toContain(
      'minutes without activity',
    );
    expect(timeout.getAttribute('aria-describedby')).toBe('idle-minutes-help');
    expect([timeout.min, timeout.max]).toEqual(['15', '480']);
    expect(card.querySelector('#idle-minutes-help')?.textContent).toContain('Between 15 and 480');
    // Save is the form's submit button, after both groups.
    const save = card.querySelector('#security-save') as HTMLButtonElement;
    expect(save.type).toBe('submit');
    expect(save.closest('form')).toBe(card.querySelector('form'));
    expect(groups[1].compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('saves the same request as before: the chosen roles, the version and the timeout', async () => {
    const { fixture, http, card } = await render();
    const officer = Array.from(card.querySelectorAll('fieldset label')).find((row) =>
      row.textContent?.includes('Procurement Engineer / Officer'),
    )!;
    (officer.querySelector('input') as HTMLInputElement).click();
    const timeout = card.querySelector('#idle-minutes') as HTMLInputElement;
    timeout.value = '30';
    timeout.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (card.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const saved = http.expectOne(
      (request) => request.url === '/api/v1/company/security' && request.method === 'PUT',
    );
    expect(saved.request.body).toEqual({
      mfaRequiredRoles: ['ProcurementManager', 'ProcurementOfficer'],
      version: 'v1',
      idleTimeoutMinutes: 30,
    });
    saved.flush({ ...security, mfaRequiredRoles: ['ProcurementManager', 'ProcurementOfficer'] });
  });

  it('shows a reader who cannot change it the settings read only, with no Save', async () => {
    const { card } = await render(false);
    expect(
      Array.from(card.querySelectorAll('input')).every(
        (input) => (input as HTMLInputElement).disabled,
      ),
    ).toBe(true);
    expect(card.querySelector('#security-save')).toBeNull();
  });
});
