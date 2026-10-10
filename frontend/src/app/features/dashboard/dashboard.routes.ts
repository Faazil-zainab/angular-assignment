import type { Routes } from '@angular/router';

/**
 * Routes owned by the dashboard feature.
 *
 * The feature is a lazy `loadChildren` boundary; the single entry point is the
 * signed-in landing page. Filtering, deep links to a single record (`records/:id`)
 * and a profile page can be added here later without touching `app.routes.ts`.
 */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard').then((module) => module.Dashboard),
    title: 'Dashboard - MPloyChek',
  },
];
