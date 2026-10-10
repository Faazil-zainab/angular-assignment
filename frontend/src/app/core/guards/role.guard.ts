import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AppLink } from '../constants/app-routes';
import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

/**
 * Builds a guard that only allows the given roles through.
 *
 * Role based access control is enforced in two layers, and this is only the
 * first: hiding an admin route from the SPA improves the experience, but the
 * backend independently authorizes every request. A user who edits the URL
 * therefore reaches a guarded route for a moment and then gets 403s from the API.
 *
 * Unauthenticated callers are sent to the login screen; authenticated callers
 * with the wrong role are sent to the dashboard with `?denied=` so the shell can
 * explain what happened, rather than looping back to a route they cannot open.
 */
export function roleGuard(...allowedRoles: readonly UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree([AppLink.login]);
    }

    if (auth.hasRole(...allowedRoles)) {
      return true;
    }

    return router.createUrlTree([AppLink.dashboard], {
      queryParams: { denied: allowedRoles.join(',') },
    });
  };
}

/** Administrator-only routes. */
export const adminGuard = roleGuard(UserRole.ADMIN);

/** Routes reserved for the general-user role. */
export const generalUserGuard = roleGuard(UserRole.GENERAL_USER);
