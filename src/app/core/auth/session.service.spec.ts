import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

const identity = {
  userId: 'user-1',
  tenantId: 'tenant-a',
  roles: ['Viewer'],
  permissions: ['Projects.View'],
};

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    sessionStorage.removeItem('bidperformance.tenant-logout-pending');
    http.verify();
  });

  it('denies permissions until an authenticated server identity is loaded', () => {
    expect(service.hasPermission('Projects.View')).toBe(false);
    service.load().subscribe();
    http.expectOne('/api/v1/session').flush(identity);
    expect(service.identity()?.tenantId).toBe('tenant-a');
    expect(service.hasPermission('Projects.View')).toBe(true);
    expect(service.hasPermission('Projects.Edit')).toBe(false);
  });

  it.each([401, 403, 500])('fails closed on HTTP %s and clears previous permissions', (status) => {
    service.load().subscribe();
    http.expectOne('/api/v1/session').flush(identity);
    service.load().subscribe();
    expect(service.hasPermission('Projects.View')).toBe(false);
    http.expectOne('/api/v1/session').flush({}, { status, statusText: 'Rejected' });
    expect(service.identity()).toBeNull();
  });

  it.each([
    { ...identity, tenantId: '' },
    { ...identity, tenantId: undefined },
    { ...identity, permissions: '*' },
    { ...identity, permissions: [1] },
  ])('rejects an invalid identity %#', (value) => {
    service.load().subscribe();
    http.expectOne('/api/v1/session').flush(value);
    expect(service.identity()).toBeNull();
  });

  it('cannot resurrect identity when an in-flight request completes after logout', () => {
    service.load().subscribe();
    const request = http.expectOne('/api/v1/session');
    service.clear();
    request.flush(identity);
    expect(service.identity()).toBeNull();
  });

  it('shares concurrent session checks', () => {
    service.load().subscribe();
    service.load().subscribe();
    http.expectOne('/api/v1/session').flush(identity);
    expect(service.identity()).toEqual(identity);
  });

  it('establishes identity only from the login response and refreshes identity-bound CSRF', () => {
    service.login('admin@example.com', 'private passphrase').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush(null);
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({
      email: 'admin@example.com',
      password: 'private passphrase',
    });
    login.flush(identity);
    http.expectOne('/api/v1/auth/csrf').flush(null);
    expect(service.identity()).toEqual(identity);
  });

  it('signs nobody in on a TOTP challenge, then establishes identity from the code step (CF-065)', () => {
    let answer: unknown = 'none';
    service.login('admin@example.com', 'private passphrase').subscribe((value) => (answer = value));
    http.expectOne('/api/v1/auth/csrf').flush(null);
    const challenge = {
      status: 'enrollment_required',
      challenge: 'challenge-1',
      secret: 'JBSWY3DPEHPK3PXP',
      provisioningUri: 'otpauth://totp/x',
    };
    http.expectOne('/api/v1/auth/login').flush(challenge);
    expect(answer).toEqual(challenge);
    expect(service.identity()).toBeNull();
    let codes: unknown = null;
    service.verify('challenge-1', '123456').subscribe((value) => (codes = value));
    const totp = http.expectOne('/api/v1/auth/totp');
    expect(totp.request.body).toEqual({ challenge: 'challenge-1', code: '123456' });
    totp.flush({ ...identity, recoveryCodes: ['AAAA-BBBB', 'CCCC-DDDD'] });
    http.expectOne('/api/v1/auth/csrf').flush(null);
    expect(service.identity()).toEqual(expect.objectContaining({ userId: identity.userId }));
    expect(codes).toEqual(['AAAA-BBBB', 'CCCC-DDDD']);
  });

  it('rejects a login response that claims platform authority', () => {
    service.login('admin@example.com', 'private passphrase').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/login').flush({ ...identity, roles: ['PlatformOperator'] });
    expect(service.identity()).toBeNull();
  });

  it('records logout before network work and clears the marker only after server revocation', () => {
    service.logout().subscribe();
    expect(sessionStorage.getItem('bidperformance.tenant-logout-pending')).toBe('1');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/logout').flush(null);
    expect(sessionStorage.getItem('bidperformance.tenant-logout-pending')).toBeNull();
    http.expectOne('/api/v1/auth/csrf').flush(null);
  });

  it('finishes an interrupted logout on reload before resolving any protected session', () => {
    sessionStorage.setItem('bidperformance.tenant-logout-pending', '1');
    service.load().subscribe();
    http.expectNone('/api/v1/session');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/logout').flush(null);
    expect(sessionStorage.getItem('bidperformance.tenant-logout-pending')).toBeNull();
    http.expectOne('/api/v1/auth/csrf').flush(null);
    expect(service.identity()).toBeNull();
  });

  it('signs out on every device only when asked, also when a reload interrupts it (CF-087)', () => {
    service.logout(true).subscribe();
    expect(sessionStorage.getItem('bidperformance.tenant-logout-pending')).toBe('everywhere');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/logout?everywhere=true').flush(null);
    http.expectOne('/api/v1/auth/csrf').flush(null);

    sessionStorage.setItem('bidperformance.tenant-logout-pending', 'everywhere');
    service.load().subscribe();
    http.expectNone('/api/v1/session');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    http.expectOne('/api/v1/auth/logout?everywhere=true').flush(null);
    expect(sessionStorage.getItem('bidperformance.tenant-logout-pending')).toBeNull();
    http.expectOne('/api/v1/auth/csrf').flush(null);
  });
});
