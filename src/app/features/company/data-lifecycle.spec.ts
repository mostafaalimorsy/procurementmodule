import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenantUser } from '../identity/tenant-identity.api';
import { UsersAdmin } from '../identity/users-admin';
import { CompanySettingsPage } from './company-settings';

// CF-071 (ADR-134): the company's own data lifecycle — the complete export and erasure on request.

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;

function user(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    id: 'u2',
    email: 'omar@delta.example',
    displayName: 'Omar Officer',
    role: 'ProcurementOfficer',
    additionalRoles: [],
    status: 'Suspended',
    passwordResetRequired: false,
    createdAtUtc: '2026-09-01T00:00:00Z',
    updatedAtUtc: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

describe('Company data lifecycle (CF-071)', () => {
  function users(list: TenantUser[], permissions: readonly string[]) {
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
            hasPermission: (permission: string) => permissions.includes(permission),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush(list);
    for (const request of http.match('/api/v1/company/plan')) request.flush(null);
    fixture.detectChanges();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('erases a suspended former member in two steps, and offers it to nobody else', () => {
    const { fixture, http, element } = users(
      [user(), user({ id: 'u3', email: 'active@delta.example', status: 'Active' })],
      ['Users.View', 'Users.Suspend', 'Company.ManageData'],
    );
    const offers = Array.from(element.querySelectorAll('button')).filter((candidate) =>
      candidate.textContent?.includes('Erase personal data'),
    );
    expect(offers).toHaveLength(1);
    offers[0].click();
    fixture.detectChanges();
    http.expectNone('/api/v1/admin/users/u2/erase');
    button(element, 'Confirm: erase permanently')!.click();
    http.expectOne('/api/v1/admin/users/u2/erase').flush(null);
    fixture.detectChanges();
    expect(text(element)).toContain('attributed to an erased user');
  });

  it('never offers erasure without the data permission, or to an already erased account', () => {
    const { element } = users(
      [user(), user({ id: 'u4', email: 'erased-u4@erased.invalid', displayName: 'Erased user' })],
      ['Users.View', 'Users.Suspend'],
    );
    expect(button(element, 'Erase personal data')).toBeUndefined();
  });

  it('offers the complete export on the company settings page to company administration', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['CompanyProfile.Manage', 'Company.ManageData'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CompanySettingsPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/currencies').flush([]);
    http.expectOne('/api/v1/company/profile').flush({
      companyName: 'Delta',
      defaultCurrency: null,
      hasLogo: false,
      logoContentType: null,
      logoWidth: null,
      logoHeight: null,
      logoUpdatedAtUtc: null,
      canManage: true,
      version: 'v1',
    });
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="company-export"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/v1/admin/company-export');
    expect(link.hasAttribute('download')).toBe(true);
  });
});
