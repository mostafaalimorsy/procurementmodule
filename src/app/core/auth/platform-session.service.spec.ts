import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlatformSessionService } from './platform-session.service';

const identity = { id: 'operator-1', email: 'operator@example.com' };
const base = '/api/v1/platform/auth';

describe('PlatformSessionService', () => {
  let service: PlatformSessionService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlatformSessionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
    http.verify();
  });

  it('shares concurrent server session resolution and rejects stale responses', () => {
    service.load().subscribe();
    service.load().subscribe();
    const request = http.expectOne(`${base}/session`);
    service.clear();
    request.flush(identity);
    expect(service.identity()).toBeNull();
  });

  it.each([401, 403, 500])(
    'fails closed and clears previously resolved identity on HTTP %s',
    (status) => {
      service.load().subscribe();
      http.expectOne(`${base}/session`).flush(identity);
      expect(service.identity()).toEqual(identity);
      service.load().subscribe();
      expect(service.identity()).toBeNull();
      http.expectOne(`${base}/session`).flush({}, { status, statusText: 'Denied' });
      expect(service.identity()).toBeNull();
    },
  );

  it.each([
    {
      userId: 'admin-1',
      tenantId: 'company-1',
      roles: ['Administrator', 'PlatformOperator'],
      permissions: ['*'],
    },
    { ...identity, tenantId: 'company-1' },
    { ...identity, id: '' },
    { ...identity, email: undefined },
  ])('rejects tenant identity or malformed operator identity %#', (value) => {
    service.load().subscribe();
    http.expectOne(`${base}/session`).flush(value);
    expect(service.identity()).toBeNull();
  });

  const challenge = {
    status: 'totp_required',
    challenge: 'challenge-1',
    secret: null,
    provisioningUri: null,
  };

  it('obtains CSRF before the password step, which signs nobody in (CF-066)', () => {
    let answer: unknown = null;
    service.login(identity.email, 'test-password').subscribe((value) => (answer = value));
    http.expectNone(`${base}/login`);
    document.cookie = 'XSRF-TOKEN=test-csrf; Path=/';
    http.expectOne(`${base}/csrf`).flush(null);
    const login = http.expectOne(`${base}/login`);
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ email: identity.email, password: 'test-password' });
    expect(login.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    login.flush(challenge);
    expect(answer).toEqual(challenge);
    expect(service.identity()).toBeNull();
  });

  it('signs in with the TOTP step and refreshes CSRF after the identity changes', () => {
    let completed = false;
    service.verify('challenge-1', '123456').subscribe(() => (completed = true));
    const totp = http.expectOne(`${base}/totp`);
    expect(totp.request.body).toEqual({ challenge: 'challenge-1', code: '123456' });
    totp.flush(identity);
    expect(service.identity()).toBeNull();
    http.expectOne(`${base}/csrf`).flush(null);
    expect(service.identity()).toEqual(identity);
    expect(completed).toBe(true);
  });

  it('does not establish client identity if the post-sign-in CSRF refresh fails', () => {
    let failed = false;
    service.verify('challenge-1', '123456').subscribe({ error: () => (failed = true) });
    http.expectOne(`${base}/totp`).flush(identity);
    http.expectOne(`${base}/csrf`).flush({}, { status: 500, statusText: 'Unavailable' });
    expect(service.identity()).toBeNull();
    expect(failed).toBe(true);
  });

  it('cannot restore operator identity from the TOTP step after a newer clear', () => {
    let failed = false;
    service.verify('challenge-1', '123456').subscribe({ error: () => (failed = true) });
    http.expectOne(`${base}/totp`).flush(identity);
    const csrf = http.expectOne(`${base}/csrf`);
    service.clear();
    csrf.flush(null);
    expect(service.identity()).toBeNull();
    expect(failed).toBe(true);
  });

  it('rejects a password step answer that is not a challenge', () => {
    let failed = false;
    service.login(identity.email, 'test-password').subscribe({ error: () => (failed = true) });
    http.expectOne(`${base}/csrf`).flush(null);
    http.expectOne(`${base}/login`).flush(identity);
    expect(failed).toBe(true);
  });

  it('does not submit credentials after the initial CSRF request was superseded', () => {
    let failed = false;
    service.login(identity.email, 'test-password').subscribe({ error: () => (failed = true) });
    const csrf = http.expectOne(`${base}/csrf`);
    service.clear();
    csrf.flush(null);
    http.expectNone(`${base}/login`);
    expect(service.identity()).toBeNull();
    expect(failed).toBe(true);
  });

  it('clears local privileges immediately and posts logout using CSRF', () => {
    service.load().subscribe();
    http.expectOne(`${base}/session`).flush(identity);
    service.logout().subscribe();
    expect(service.identity()).toBeNull();
    document.cookie = 'XSRF-TOKEN=logout-csrf; Path=/';
    http.expectOne(`${base}/csrf`).flush(null);
    const logout = http.expectOne(`${base}/logout`);
    expect(logout.request.headers.get('X-XSRF-TOKEN')).toBe('logout-csrf');
    logout.flush(null);
    http.expectOne(`${base}/csrf`).flush(null);
  });
});
