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
import { SessionService } from './session.service';
import { platformGuard } from './platform.guard';

describe('platformGuard', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function run() {
    return firstValueFrom(
      TestBed.runInInjectionContext(() =>
        platformGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ) as Observable<boolean | UrlTree>,
    );
  }
  it('allows only an independently server-resolved Platform Operator', async () => {
    const result = run();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/platform/auth/session')
      .flush({ id: 'operator', email: 'operator@example.com' });
    expect(await result).toBe(true);
  });
  it('cannot promote a tenant administrator using tenant roles or permissions', async () => {
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionService).load().subscribe();
    http.expectOne('/api/v1/session').flush({
      userId: 'admin',
      tenantId: 'tenant',
      roles: ['Administrator', 'PlatformOperator'],
      permissions: ['platform.admin', '*'],
    });
    const result = run();
    http
      .expectOne('/api/v1/platform/auth/session')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(TestBed.inject(Router).serializeUrl((await result) as UrlTree)).toBe('/platform/login');
  });
});
