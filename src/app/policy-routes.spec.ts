import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Route,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { routes } from './app.routes';

/** The route as configured in the application (its guard and its data), wherever it sits under a shell. */
function findRoute(path: string, within: readonly Route[] = routes): Route | null {
  for (const route of within) {
    if (route.path === path) return route;
    const child = route.children ? findRoute(path, route.children) : null;
    if (child) return child;
  }
  return null;
}

const ALL_FEATURES = [
  'projects',
  'subcontractor_directory',
  'sourcing',
  'tendering',
  'evaluation',
  'award',
  'performance',
];

/** Runs the route's own guards for a signed-in reader holding `permissions`, on a plan with every feature. */
async function activate(path: string, permissions: readonly string[]): Promise<true | string> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const route = findRoute(path);
  expect(route, path).not.toBeNull();
  const guards = (route!.canActivate ?? []) as CanActivateFn[];
  expect(guards.length, path).toBeGreaterThan(0);
  const snapshot = {
    data: route!.data ?? {},
    routeConfig: route,
  } as unknown as ActivatedRouteSnapshot;
  const http = TestBed.inject(HttpTestingController);
  for (const guard of guards) {
    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        guard(snapshot, { url: `/${path}` } as RouterStateSnapshot),
      ) as Observable<boolean | UrlTree>,
    );
    for (const request of http.match('/api/v1/session'))
      request.flush({ userId: 'u1', tenantId: 't1', roles: [], permissions });
    for (const request of http.match('/api/v1/company/features'))
      request.flush({ features: ALL_FEATURES });
    const outcome = await result;
    if (outcome !== true)
      return outcome instanceof UrlTree
        ? TestBed.inject(Router).serializeUrl(outcome)
        : String(outcome);
  }
  http.verify();
  return true;
}

/** CF-133: who reaches the policy pages, by the permissions each role holds (S-ROLES / AccessContracts). */
describe('Policy page routes (CF-133)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('turns a Technical Evaluator away from the recommendation policies with "access denied" (AC2)', async () => {
    // The Technical Evaluator's evaluation permissions (AccessContracts: EView, ETech, EScore) — neither Decision.View nor
    // Recommendation.ManagePolicy.
    const outcome = await activate('recommendation-policies', [
      'Evaluation.View',
      'Evaluation.ViewTechnical',
      'Evaluation.TechnicalScore',
    ]);
    expect(outcome).not.toBe(true);
    const tree = TestBed.inject(Router).parseUrl(outcome as string);
    expect(tree.root.children['primary']).toBeUndefined();
    expect(tree.queryParams['access']).toBe('denied');
    expect(tree.queryParams['plan']).toBeUndefined();
  });

  it('lets a Decision.View reader and a policy manager open the recommendation policies (AC3, AC4)', async () => {
    expect(await activate('recommendation-policies', ['Decision.View'])).toBe(true);
    expect(await activate('recommendation-policies', ['Recommendation.ManagePolicy'])).toBe(true);
  });

  it('lets a Technical Evaluator read the scorecard policies (AC1)', async () => {
    expect(await activate('evaluation-policies', ['Evaluation.View'])).toBe(true);
    const outcome = await activate('evaluation-policies', ['Decision.View']);
    expect(TestBed.inject(Router).parseUrl(outcome as string).queryParams['access']).toBe('denied');
  });
});
