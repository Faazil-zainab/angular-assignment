import { randomUUID } from 'node:crypto';

import jwt, { type Algorithm, type JwtPayload } from 'jsonwebtoken';

import { config } from '../config/env.config';
import { UserRole, type IssuedToken, type TokenClaims, type User } from '../models';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';

const log = logger.child('token');

/** Single signing algorithm, whitelisted again on verification. */
const ALGORITHM: Algorithm = 'HS256';

/**
 * Signs and verifies the access tokens used by the API.
 *
 * Stateless by design: the token carries only the immutable user id plus
 * convenience claims, everything authoritative is re-read from the store on each
 * request. All verification failures surface as 401 with a distinct `code`, never
 * as a 500.
 */
export class TokenService {
  /** Issues a signed access token for a user. */
  sign(user: User): IssuedToken {
    const expiresInSeconds = config.auth.jwtExpiresInSeconds;

    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      config.auth.jwtSecret,
      {
        algorithm: ALGORITHM,
        expiresIn: expiresInSeconds,
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
        subject: user.id,
        jwtid: randomUUID(),
      },
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresInSeconds,
      issuedAt: new Date().toISOString(),
    };
  }

  /** Verifies signature, issuer, audience and expiry, then validates the claims. */
  verify(token: string): TokenClaims {
    let decoded: string | JwtPayload;

    try {
      decoded = jwt.verify(token, config.auth.jwtSecret, {
        algorithms: [ALGORITHM],
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('The access token has expired. Please sign in again.', {
          code: 'TOKEN_EXPIRED',
          cause: error,
        });
      }

      log.warn('rejected an invalid access token', {
        reason: error instanceof Error ? error.message : String(error),
      });
      throw ApiError.unauthorized('The access token is invalid.', {
        code: 'INVALID_TOKEN',
        cause: error,
      });
    }

    return assertClaims(decoded);
  }
}

/**
 * Narrows a decoded payload to {@link TokenClaims}.
 *
 * A signature-valid token can still carry a useless payload (for example one
 * minted by an older release), so every claim is checked before it is trusted.
 */
function assertClaims(decoded: string | JwtPayload): TokenClaims {
  if (typeof decoded === 'string') {
    throw invalidClaims('the payload is not an object');
  }

  const { sub, userId, role, iss, aud, iat, exp } = decoded as Partial<TokenClaims>;

  if (typeof sub !== 'string' || sub.length === 0) {
    throw invalidClaims('the "sub" claim is missing');
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    throw invalidClaims('the "userId" claim is missing');
  }
  if (typeof role !== 'string' || !Object.values(UserRole).includes(role as UserRole)) {
    throw invalidClaims('the "role" claim is not a known role');
  }
  if (typeof iss !== 'string' || typeof aud === 'undefined') {
    throw invalidClaims('the issuer or audience claim is missing');
  }
  if (typeof iat !== 'number' || typeof exp !== 'number') {
    throw invalidClaims('the "iat" or "exp" claim is missing');
  }

  return { sub, userId, role: role as UserRole, iss, aud: String(aud), iat, exp };
}

function invalidClaims(reason: string): ApiError {
  log.warn('rejected a token with unsupported claims', { reason });
  return ApiError.unauthorized('The access token is invalid.', { code: 'INVALID_TOKEN' });
}

/** Shared instance - stateless, so a single instance is enough. */
export const tokenService = new TokenService();
