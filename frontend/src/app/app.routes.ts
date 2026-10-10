import type { Routes } from '@angular/router';

import { RoutePath } from './core/constants/app-routes';
import { authGuard } from './core/guards';

/**
 * Root route table.
 *
 * Two composition strategies are demonstrated deliberately:
 *
 * 1. `auth` is a top level lazy feature - the sign-in experience must not carry
 *    the application chrome.
 * 2. `dashboard` and `admin` are children of a pathless layout route, so the
 *    shell (toolbar, navigation, footer) is rendered once and only the view
 *    inside `<router-outlet />` is swapped.
 *
 * Every feature is loaded with `loadChildren`/`loadComponent`, which is the
 * runtime equivalent of modularisation: routes, components and services for a
 * feature end up in their own bundle, built when the user navigates to it.
 */
export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: RoutePath.dashboard,
  },

  // --- Public area (no application chrome) ---------------------------------
  {
    path: RoutePath.auth,
    loadChildren: () => import('./features/auth/auth.routes').then((module) => module.AUTH_ROUTES),
  },

  // --- Authenticated area, wrapped in the application shell ----------------
  // NOTE: a pathless layout route still has to declare `path: ''`. Omitting it
  // makes Angular reject the whole table at startup with NG04014, so the app
  // never boots (see app.routes.spec.ts, which guards against exactly that).
  {
    path: '',
    loadComponent: () => import('./layout/app-shell/app-shell').then((module) => module.AppShell),
    // `authGuard` protects the whole shell: every child route below is only
    // reachable with a valid session.
    canActivate: [authGuard],
    children: [
      {
        path: RoutePath.dashboard,
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((module) => module.DASHBOARD_ROUTES),
      },
      {
        path: RoutePath.admin,
        loadChildren: () =>
          import('./features/admin/admin.routes').then((module) => module.ADMIN_ROUTES),
      },
    ],
  },

  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found').then((module) => module.NotFound),
    title: 'Not found · MPloyChek',
  },
];
