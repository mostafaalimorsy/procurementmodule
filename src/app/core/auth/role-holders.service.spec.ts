import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { RoleHoldersService } from './role-holders.service';
import { SessionService } from './session.service';

const url = (permission: string) => `/api/v1/access/role-holders?permission=${permission}`;

describe('RoleHoldersService (S-ROLES)', () => {
  let http: HttpTestingController;
  let service: RoleHoldersService;
  const signIn = (userId: string) =>
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({ userId, tenantId: 't1', roles: [], permissions: [] });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RoleHoldersService);
  });
  afterEach(() => http.verify());

  it('reads the roles holding a permission once per session', async () => {
    signIn('u1');
    const first = firstValueFrom(service.rolesWith('Performance.Reopen'));
    http
      .expectOne(url('Performance.Reopen'))
      .flush({ permission: 'Performance.Reopen', roles: ['CompanyAdmin'] });
    expect(await first).toEqual(['CompanyAdmin']);
    // The same session asks again: answered from the cache.
    expect(await firstValueFrom(service.rolesWith('Performance.Reopen'))).toEqual(['CompanyAdmin']);
    http.expectNone(url('Performance.Reopen'));
  });

  it('forgets the answers when the signed-in account changes', async () => {
    signIn('u1');
    const first = firstValueFrom(service.rolesWith('Performance.Reopen'));
    http.expectOne(url('Performance.Reopen')).flush({ roles: ['CompanyAdmin'] });
    await first;
    signIn('u2');
    const second = firstValueFrom(service.rolesWith('Performance.Reopen'));
    http
      .expectOne(url('Performance.Reopen'))
      .flush({ roles: ['CompanyAdmin', 'ProcurementManager'] });
    expect(await second).toEqual(['CompanyAdmin', 'ProcurementManager']);
  });

  it('does not keep a failed read, so the next one asks again', async () => {
    signIn('u1');
    const failed = firstValueFrom(service.rolesWith('Evaluation.ManagePolicy'));
    http
      .expectOne(url('Evaluation.ManagePolicy'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    await expect(failed).rejects.toBeTruthy();
    const retried = firstValueFrom(service.rolesWith('Evaluation.ManagePolicy'));
    http.expectOne(url('Evaluation.ManagePolicy')).flush({ roles: ['ProcurementManager'] });
    expect(await retried).toEqual(['ProcurementManager']);
  });
});
