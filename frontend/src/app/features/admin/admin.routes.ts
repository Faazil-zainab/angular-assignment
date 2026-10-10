import type { Routes } from '@angular/router';

import { RoutePath } from '../../core/constants/app-routes';
import { adminGuard } from '../../core/guards';

/**
 * Routes owned by the admin feature.
 *
 * Every entry is protected by `adminGuard` (role based access control): the
 * guard is declared once on the parent route table so a new admin page cannot be
 * added without inheriting the protection.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/user-management/user-management').then((module) => module.UserManagement),
        title: 'Admin - MPloyChek',
      },
      {
        path: RoutePath.users,
        loadComponent: () =>
          import('./pages/user-management/user-management').then((module) => module.UserManagement),
        title: 'User management - MPloyChek',
      },
    ],
  },
];
