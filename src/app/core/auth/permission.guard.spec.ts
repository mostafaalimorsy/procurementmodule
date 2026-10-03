import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function run(
    permission: unknown,
    granted: string[] | null,
    path = 'admin/users',
    url = '/admin/users',
  ) {
    const route = {
      data: { permission },
      routeConfig: { path },
    } as unknown as ActivatedRouteSnapshot;
    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        permissionGuard(route, { url } as RouterStateSnapshot),
      ) as Observable<boolean | UrlTree>,
    );
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/session');
    if (granted === null) request.flush({}, { status: 401, statusText: 'Unauthorized' });
    else
      request.flush({
        userId: 'user-1',
        tenantId: 'tenant-a',
        roles: [],
        permissions: granted,
      });
    return result;
  }
  const serialize = (result: boolean | UrlTree) =>
    TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('allows a route only when the server grants its exact permission', async () => {
    expect(await run('Projects.View', ['Projects.View'])).toBe(true);
  });

  it('names the refused page when the permission is absent (CF-011 AC3)', async () => {
    const result = await run('Users.View', ['Projects.View']);
    expect(serialize(result)).toBe('/?access=denied&page=admin%2Fusers');
  });

  it('sends a signed-out reader to sign in and back to the same path and query (CF-011 AC1)', async () => {
    const users = await run('Users.View', null, 'admin/users', '/admin/users?x=1');
    expect(serialize(users)).toBe('/login?returnUrl=%2Fadmin%2Fusers%3Fx%3D1');
    const search = await run('session.read', null, 'search', '/search?q=ACME');
    expect(serialize(search)).toBe('/login?returnUrl=%2Fsearch%3Fq%3DACME');
    const audit = await run('Audit.View', null, 'admin/audit', '/admin/audit');
    expect(serialize(audit)).toBe('/login?returnUrl=%2Fadmin%2Faudit');
  });

  it('fails closed when route metadata is missing', async () => {
    expect(await run(undefined, ['Projects.View'])).toBeInstanceOf(UrlTree);
  });
});
