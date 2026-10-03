import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { csrfRetryInterceptor } from './csrf-retry.interceptor';

const antiforgery = {
  code: 'request.antiforgery_invalid',
  title: 'A valid antiforgery token is required.',
};

describe('csrfRetryInterceptor (ADR-176)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    document.cookie = 'XSRF-TOKEN=stale; Path=/';
  });

  afterEach(() => {
    backend.verify();
    document.cookie = 'XSRF-TOKEN=; Path=/; Max-Age=0';
  });

  it('refreshes the console token and retries a refused console write once, with the new token', () => {
    let result: unknown;
    http
      .put('/api/v1/platform/companies/c1/access-policy', { locationRules: [] })
      .subscribe((value) => (result = value));
    const first = backend.expectOne('/api/v1/platform/companies/c1/access-policy');
    expect(first.request.headers.get('X-XSRF-TOKEN')).toBe('stale');
    first.flush(antiforgery, { status: 400, statusText: 'Bad Request' });
    const refresh = backend.expectOne('/api/v1/platform/auth/csrf');
    expect(refresh.request.method).toBe('GET');
    document.cookie = 'XSRF-TOKEN=fresh; Path=/';
    refresh.flush(null, { status: 204, statusText: 'No Content' });
    const retry = backend.expectOne('/api/v1/platform/companies/c1/access-policy');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('fresh');
    expect(retry.request.body).toEqual({ locationRules: [] });
    retry.flush({ id: 'c1' });
    expect(result).toEqual({ id: 'c1' });
  });

  it('refreshes the workspace token for a workspace write', () => {
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/auth/login')
      .flush(antiforgery, { status: 400, statusText: 'Bad Request' });
    backend.expectOne('/api/v1/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    backend.expectOne('/api/v1/auth/login').flush({});
  });

  it('retries only once: a second refusal reaches the caller', () => {
    let failure: HttpErrorResponse | undefined;
    http
      .put('/api/v1/platform/x', {})
      .subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
    backend
      .expectOne('/api/v1/platform/x')
      .flush(antiforgery, { status: 400, statusText: 'Bad Request' });
    backend
      .expectOne('/api/v1/platform/auth/csrf')
      .flush(null, { status: 204, statusText: 'No Content' });
    backend
      .expectOne('/api/v1/platform/x')
      .flush(antiforgery, { status: 400, statusText: 'Bad Request' });
    expect(failure?.error).toEqual(antiforgery);
  });

  it('leaves other refusals and reads alone', () => {
    let failure: HttpErrorResponse | undefined;
    http
      .put('/api/v1/platform/x', {})
      .subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
    backend
      .expectOne('/api/v1/platform/x')
      .flush(
        { code: 'platform.access_policy_country_unknown' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(failure?.status).toBe(400);
    http.get('/api/v1/platform/y').subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/platform/y')
      .flush(antiforgery, { status: 400, statusText: 'Bad Request' });
    backend.expectNone('/api/v1/platform/auth/csrf');
  });
});
