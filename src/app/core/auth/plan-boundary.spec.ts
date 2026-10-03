import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable } from 'rxjs';
import { CompanyPlanPanel } from '../../features/identity/company-plan-panel';
import { NotInPlan } from '../../shared/ui/not-in-plan';
import { knownProductProblem } from '../localization/product-problem';
import { entitlementRefreshInterceptor } from './entitlement-refresh.interceptor';
import { EntitlementsService } from './entitlements.service';
import { featureGuard } from './feature.guard';
import { SessionService } from './session.service';

/** A page section shown only when the plan includes Performance, with the placeholder in its place otherwise. */
@Component({
  imports: [NotInPlan],
  template: `
    @if (entitlements.has('performance')) {
      <section data-testid="performance-section">Closeouts</section>
    } @else {
      <app-not-in-plan feature="performance" />
    }
  `,
})
class PerformanceHost {
  readonly entitlements = inject(EntitlementsService);
}

/** CF-105 (ADR-122): plan boundaries are named, the copy depends on who reads it, and a denial refreshes the plan. */
function configure(roles: readonly string[], permissions: readonly string[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([entitlementRefreshInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't1', roles, permissions });
  return TestBed.inject(HttpTestingController);
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');

describe('plan boundaries', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('points a Company Admin to the provider and everyone else to their Company Admin', () => {
    configure(['CompanyAdmin'], ['Users.View']);
    const admin = TestBed.createComponent(NotInPlan);
    admin.componentRef.setInput('feature', 'award');
    admin.detectChanges();
    expect(text(admin.nativeElement)).toContain(
      'Negotiation, recommendation and award is not included in your company plan.',
    );
    expect(text(admin.nativeElement)).toContain('Ask your platform provider or account manager');
    const denial = knownProductProblem({ code: 'entitlement.feature_not_entitled' })!;
    expect(denial).toContain('platform provider');
    expect(denial).not.toContain('administrator');
    expect(
      knownProductProblem({
        code: 'quota.exceeded',
        parameters: { quota: 'max_active_projects', limit: '2' },
      }),
    ).not.toContain('administrator');

    TestBed.resetTestingModule();
    configure(['ProcurementManager']);
    const member = TestBed.createComponent(NotInPlan);
    member.componentRef.setInput('feature', 'award');
    member.detectChanges();
    expect(text(member.nativeElement)).toContain('Ask your Company Admin');
    expect(knownProductProblem({ code: 'entitlement.feature_not_entitled' })).toContain(
      'Ask your Company Admin',
    );
  });

  it('reads the plan again after a feature denial, so a feature added meanwhile appears without a new sign-in', () => {
    const http = configure(['ProcurementManager']);
    const entitlements = TestBed.inject(EntitlementsService);
    entitlements.load().subscribe();
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering'] });
    expect(entitlements.has('performance')).toBe(false);

    let failed = false;
    TestBed.inject(HttpClient)
      .get('/api/v1/performance/closeouts')
      .subscribe({ error: () => (failed = true) });
    http
      .expectOne('/api/v1/performance/closeouts')
      .flush(
        { code: 'entitlement.feature_not_entitled' },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(failed).toBe(true);
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering', 'performance'] });
    expect(entitlements.has('performance')).toBe(true);

    // Any other refusal reads nothing again.
    TestBed.inject(HttpClient)
      .get('/api/v1/tenders')
      .subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/tenders')
      .flush({ code: 'access.denied' }, { status: 403, statusText: 'Forbidden' });
    http.expectNone('/api/v1/company/features');
    http.verify();
  });

  it('lists the capabilities the plan does not include', () => {
    configure(['CompanyAdmin'], ['Users.View']);
    const panel = TestBed.createComponent(CompanyPlanPanel);
    panel.componentRef.setInput('plan', {
      packageCode: 'basic',
      packageDisplayName: 'Basic',
      revisionNumber: 1,
      packageRevisionId: 'r1',
      companyIsActive: true,
      features: ['projects', 'tendering'],
      quotas: [],
      notIncluded: ['award', 'performance'],
    });
    panel.detectChanges();
    const listed = (panel.nativeElement as HTMLElement).querySelector(
      '[data-testid="plan-not-included"]',
    )!;
    expect(text(listed)).toContain('Not included:');
    expect(text(listed)).toContain('Negotiation, recommendation and award');
    expect(text(listed)).toContain('Performance');
  });

  it('reads the plan again on every guarded navigation, so a feature added meanwhile is reachable without a new sign-in (CF-105 AC5)', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const entitlements = TestBed.inject(EntitlementsService);
    entitlements.load().subscribe();
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering'] });
    expect(entitlements.has('performance')).toBe(false);

    const navigate = (path: string, feature: string) => {
      const route = {
        data: { feature },
        routeConfig: { path },
      } as unknown as ActivatedRouteSnapshot;
      let result: boolean | UrlTree | undefined;
      (
        TestBed.runInInjectionContext(() =>
          featureGuard(route, { url: `/${path}` } as RouterStateSnapshot),
        ) as Observable<boolean | UrlTree>
      ).subscribe((value) => (result = value));
      http
        .expectOne('/api/v1/session')
        .flush({ userId: 'u1', tenantId: 't1', roles: ['ProcurementManager'], permissions: [] });
      return { features: http.expectOne('/api/v1/company/features'), result: () => result };
    };

    // First navigation: the plan is read again, still without Performance — the guard turns the reader away.
    const first = navigate('tenders', 'tendering');
    first.features.flush({ features: ['tendering'] });
    expect(first.result()).toBe(true);
    const refused = navigate('closeouts', 'performance');
    refused.features.flush({ features: ['tendering'] });
    expect(TestBed.inject(Router).serializeUrl(refused.result() as UrlTree)).toBe(
      '/?plan=unavailable',
    );
    expect(entitlements.has('performance')).toBe(false);

    // The operator adds Performance. The next guarded navigation reads the plan again and lets the reader in.
    const next = navigate('closeouts', 'performance');
    next.features.flush({ features: ['tendering', 'performance'] });
    expect(next.result()).toBe(true);
    expect(entitlements.has('performance')).toBe(true);
    http.verify();
  });

  it('re-reads the plan once when a "not included" placeholder is shown, and shows the section once it is added', () => {
    const http = configure(['ProcurementManager']);
    const entitlements = TestBed.inject(EntitlementsService);
    entitlements.load().subscribe();
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering'] });

    const host = TestBed.createComponent(PerformanceHost);
    host.detectChanges();
    const element = host.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="not-in-plan"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="performance-section"]')).toBeNull();
    // Rendering again does not read again: one read per placeholder instance.
    host.detectChanges();
    const reread = http.match('/api/v1/company/features');
    expect(reread.length).toBe(1);
    reread[0].flush({ features: ['tendering', 'performance'] });
    host.detectChanges();
    expect(element.querySelector('[data-testid="performance-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="not-in-plan"]')).toBeNull();
    http.verify();
  });

  it('keeps the placeholder, without reading in a loop, when the re-read still lacks the feature', () => {
    const http = configure(['ProcurementManager']);
    const entitlements = TestBed.inject(EntitlementsService);
    entitlements.load().subscribe();
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering'] });
    const host = TestBed.createComponent(PerformanceHost);
    host.detectChanges();
    http.expectOne('/api/v1/company/features').flush({ features: ['tendering'] });
    host.detectChanges();
    host.detectChanges();
    expect(
      (host.nativeElement as HTMLElement).querySelector('[data-testid="not-in-plan"]'),
    ).not.toBeNull();
    http.verify();
  });
});
