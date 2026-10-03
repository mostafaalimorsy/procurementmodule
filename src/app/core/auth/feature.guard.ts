import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { EntitlementsService } from './entitlements.service';
import { SessionService } from './session.service';

/**
 * Keeps a route out of reach when the company has not purchased the capability or the person lacks
 * the permission. UX boundary only: the corresponding API enforces both independently.
 */
export const featureGuard: CanActivateFn = (route, state) => {
  const session = inject(SessionService);
  const entitlements = inject(EntitlementsService);
  const router = inject(Router);
  const permission: unknown = route.data['permission'];
  const feature: unknown = route.data['feature'];
  return forkJoin([session.load(), entitlements.load()]).pipe(
    map(() => {
      // CF-011: signed out — sign in, then come back here.
      if (!session.identity())
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      // A list means any one of them (a composite read, e.g. the approval matrix for approvers and submitters).
      const permissions =
        typeof permission === 'string' ? [permission] : Array.isArray(permission) ? permission : [];
      if (
        permissions.length > 0 &&
        !permissions.some((key) => typeof key === 'string' && session.hasPermission(key))
      )
        // CF-011: the page is named by its route path only (the notice looks its title up; free text never travels).
        return router.createUrlTree(['/'], {
          queryParams: { access: 'denied', page: route.routeConfig?.path ?? null },
        });
      // A capability that works on others' records (sourcing) names every feature it needs.
      const features =
        typeof feature === 'string' ? [feature] : Array.isArray(feature) ? feature : [];
      if (features.some((key) => typeof key !== 'string' || !entitlements.has(key)))
        return router.createUrlTree(['/'], { queryParams: { plan: 'unavailable' } });
      return true;
    }),
  );
};
