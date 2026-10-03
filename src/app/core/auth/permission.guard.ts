import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from './session.service';

/** UX boundary only. Every corresponding API operation must authorize server-side. */
export const permissionGuard: CanActivateFn = (route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const permission: unknown = route.data['permission'];
  return session.load().pipe(
    map(() => {
      // CF-011 (as featureGuard): signed out — sign in, then come back to the same path and query.
      if (!session.identity())
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      if (typeof permission === 'string' && session.hasPermission(permission)) return true;
      // CF-011: the refused page is named by its route path only (the notice looks its title up; free text never travels).
      return router.createUrlTree(['/'], {
        queryParams: { access: 'denied', page: route.routeConfig?.path ?? null },
      });
    }),
  );
};
