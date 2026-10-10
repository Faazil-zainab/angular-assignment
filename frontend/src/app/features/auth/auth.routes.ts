import type { Routes } from '@angular/router';

import { RoutePath } from '../../core/constants/app-routes';

/**
 * Routes owned by the auth feature - the feature's lazy boundary.
 *
 * This table is the only place that knows how the sign-in experience is composed.
 * The login page is public and delegates to `AuthService`; the authenticated area
 * is kept out of this feature and guarded in `app.routes.ts`.
 */
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: RoutePath.login,
  },
  {
    path: RoutePath.login,
    loadComponent: () => import('./pages/login/login-page').then((module) => module.LoginPage),
    title: 'Sign in - MPloyChek',
  },
];
