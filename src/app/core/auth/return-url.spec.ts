import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { featureGuard } from './feature.guard';
import { safeReturnUrl } from './return-url';

describe('Return after sign-in (CF-011)', () => {
  it('accepts only a path inside the workspace', () => {
    expect(safeReturnUrl('/tenders/t1/decision?tab=approval')).toBe(
      '/tenders/t1/decision?tab=approval',
    );
    for (const unsafe of [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      '/%6Aavascript:alert(1)',
      'tenders/t1',
      '/login?returnUrl=/x',
      '/tenders\u0000',
      '',
      null,
    ])
      expect(safeReturnUrl(unsafe), String(unsafe)).toBeNull();
  });

  it('sends a signed-out deep link to sign-in with the page to come back to', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const snapshot = {
      data: { permission: 'Tenders.View', feature: ['tendering'] },
    } as unknown as ActivatedRouteSnapshot;
    const outcome = TestBed.runInInjectionContext(() =>
      featureGuard(snapshot, { url: '/tenders/t1/evaluation?tab=technical' } as never),
    );
    const decided = firstValueFrom(isObservable(outcome) ? outcome : of(outcome));
    http.expectOne('/api/v1/session').flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/v1/company/features')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    const tree = (await decided) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe(
      '/login?returnUrl=%2Ftenders%2Ft1%2Fevaluation%3Ftab%3Dtechnical',
    );
  });
});
