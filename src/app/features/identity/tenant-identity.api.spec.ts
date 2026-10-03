import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  TenantIdentityApi,
  takeTokenFromFragment,
  tenantProblemMessage,
} from './tenant-identity.api';

describe('TenantIdentityApi', () => {
  let api: TenantIdentityApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(TenantIdentityApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends invitation tokens in the body after obtaining antiforgery protection', () => {
    api.acceptInvitation('one-time-secret', 'a long secure passphrase').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush(null);
    const request = http.expectOne('/api/v1/invitations/accept');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      token: 'one-time-secret',
      password: 'a long secure passphrase',
    });
    expect(request.request.url).not.toContain('one-time-secret');
    request.flush(null);
  });

  it('uses server-scoped user routes and never submits a tenant identifier', () => {
    api.changeRole('user-1', 'ProjectManager').subscribe();
    const request = http.expectOne('/api/v1/admin/users/user-1/role');
    expect(request.request.body).toEqual({ role: 'ProjectManager' });
    expect(request.request.body.tenantId).toBeUndefined();
    request.flush({});
  });

  it('sends additional roles with the primary role (CF-035)', () => {
    api.changeRole('user-1', 'ProjectManager', ['CommercialQs']).subscribe();
    const request = http.expectOne('/api/v1/admin/users/user-1/role');
    expect(request.request.body).toEqual({
      role: 'ProjectManager',
      additionalRoles: ['CommercialQs'],
    });
    request.flush({});
  });
});

describe('takeTokenFromFragment', () => {
  it('reads and removes a token fragment from browser history', () => {
    window.history.replaceState(null, '', '/accept-invitation#token=secret%2Bvalue');
    expect(takeTokenFromFragment()).toBe('secret+value');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/accept-invitation');
  });
});

describe('tenantProblemMessage', () => {
  it.each([
    [400, 'This email domain is not allowed for this company.'],
    [409, 'This account cannot be invited to this company.'],
  ])('surfaces safe authenticated invitation guidance for HTTP %s', (status, detail) => {
    expect(tenantProblemMessage(new HttpErrorResponse({ status, error: { detail } }))).toBe(detail);
  });
});
