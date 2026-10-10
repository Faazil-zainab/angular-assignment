/**
 * `RoutePath` centralises route segments so templates, redirects and guards can
 * never drift apart.
 */
export const RoutePath = {
  auth: 'auth',
  login: 'login',
  dashboard: 'dashboard',
  admin: 'admin',
  users: 'users',
} as const;

export type RoutePathValue = (typeof RoutePath)[keyof typeof RoutePath];

/** Builds an absolute router link from the shared segments. */
export const AppLink = {
  root: '/',
  login: `/${RoutePath.auth}/${RoutePath.login}`,
  dashboard: `/${RoutePath.dashboard}`,
  admin: `/${RoutePath.admin}`,
  adminUsers: `/${RoutePath.admin}/${RoutePath.users}`,
} as const;
