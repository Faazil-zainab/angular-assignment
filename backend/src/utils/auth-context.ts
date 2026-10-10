import type { Response } from 'express';

import type { User } from '../models';
import { ApiError } from './api-error';

const AUTH_USER_KEY = 'authUser';

/**
 * Holds the authenticated user for the lifetime of a request.
 *
 * The authentication middleware is the only writer; controllers read it through
 * {@link requireAuthenticatedUser}, which keeps handlers free of token handling.
 * It deliberately mirrors `request-context.ts`.
 */
export function setAuthenticatedUser(res: Response, user: User): User {
  (res.locals as Record<string, unknown>)[AUTH_USER_KEY] = user;
  return user;
}

/** The authenticated user, or `undefined` when the route is not protected. */
export function getAuthenticatedUser(res: Response): User | undefined {
  return (res.locals as Record<string, unknown>)[AUTH_USER_KEY] as User | undefined;
}

/**
 * The authenticated user, or an `ApiError` (401) when it is missing.
 *
 * Used by controllers as a defensive assertion: if a protected handler is ever
 * mounted without the authentication middleware, it fails closed instead of
 * leaking data.
 */
export function requireAuthenticatedUser(res: Response): User {
  const user = getAuthenticatedUser(res);
  if (user === undefined) {
    throw ApiError.unauthorized('This endpoint requires an authenticated user.', {
      code: 'TOKEN_MISSING',
    });
  }
  return user;
}
