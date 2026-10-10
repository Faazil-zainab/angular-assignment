import type { Request, RequestHandler, Response } from 'express';

import { UserRole, UserStatus } from '../models';
import { tokenService } from '../services/token.service';
import { userService } from '../services/user.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getAuthenticatedUser, setAuthenticatedUser } from '../utils/auth-context';

/** Sent on every 401 so clients know how to authenticate (RFC 6750). */
const BEARER_CHALLENGE = 'Bearer realm="MPloyChek", error="invalid_token"';

/**
 * Verifies the bearer token and resolves the *current* user record.
 *
 * The user is re-read from the store on every request rather than trusted from
 * the token: a deactivated account or a role change therefore takes effect on the
 * next request instead of when the token expires. Failures are 401 (not
 * authenticated) and the resolved user is published on the request context for
 * controllers.
 */
export function authenticate(): RequestHandler {
  return asyncHandler(async (req: Request, res: Response, next) => {
    const token = readBearerToken(req);

    if (token === undefined) {
      res.setHeader('WWW-Authenticate', BEARER_CHALLENGE);
      throw ApiError.unauthorized(
        'An access token is required. Send it as "Authorization: Bearer <token>".',
        { code: 'TOKEN_MISSING' },
      );
    }

    // Throws 401 for malformed, tampered with, expired or foreign-issued tokens.
    const claims = tokenService.verify(token);

    const user = await userService.findById(claims.sub);
    if (user === undefined) {
      res.setHeader('WWW-Authenticate', BEARER_CHALLENGE);
      throw ApiError.unauthorized('This token no longer maps to a user account.', {
        code: 'TOKEN_SUBJECT_UNKNOWN',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw ApiError.forbidden('This account is not active. Contact an administrator.', {
        code: 'ACCOUNT_INACTIVE',
      });
    }

    setAuthenticatedUser(res, user);
    next();
  });
}

/**
 * Role based access control for a route.
 *
 * Must be registered after {@link authenticate}. Returns 403 - not 401 - when the
 * caller is authenticated but lacks the role, and it is wired to the admin routes
 * in the next phase.
 */
export function authorize(...allowedRoles: readonly UserRole[]): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error('authorize() requires at least one role.');
  }

  return (_req, res, next) => {
    const user = getAuthenticatedUser(res);

    if (user === undefined) {
      next(
        ApiError.unauthorized('Authentication is required before a role can be checked.', {
          code: 'TOKEN_MISSING',
        }),
      );
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
          { code: 'INSUFFICIENT_ROLE', details: { requiredRoles: allowedRoles, actualRole: user.role } },
        ),
      );
      return;
    }

    next();
  };
}

/** Convenience guard for administrator-only endpoints. */
export function requireAdmin(): RequestHandler {
  return authorize(UserRole.ADMIN);
}

/** `Authorization: Bearer <token>` -> `<token>`, or `undefined`. */
function readBearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header === undefined) {
    return undefined;
  }

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') {
    return undefined;
  }

  const token = rest.join('').trim();
  return token.length > 0 ? token : undefined;
}
