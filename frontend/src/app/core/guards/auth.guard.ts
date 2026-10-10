import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AppLink } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/**
 * Protects the authenticated area.
 *
 * An unauthenticated visitor is redirected to the login screen with the URL they
 * were trying to reach in `?redirectTo=`, so the login page can send them back
 * afterwards. The check is delegated to {@link AuthService} - the guard holds no
 * authentication logic of its own.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree([AppLink.login], {
    queryParams: state.url !== '/' ? { redirectTo: state.url } : {},
  });
};
