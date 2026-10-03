import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { PlatformSessionService } from './platform-session.service';

export const platformGuard: CanActivateFn = () => {
  const session = inject(PlatformSessionService);
  const router = inject(Router);
  return session
    .load()
    .pipe(map(() => (session.identity() ? true : router.createUrlTree(['/platform/login']))));
};
