import type { PublicUser, UserRole } from './user.model';

/**
 * Authentication contract: request bodies, JWT claims and login response.
 */

/** Validated body of `POST /api/auth/login`. */
export interface LoginRequest {
  userId: string;
  password: string;
  role: UserRole;
}

/** A signed access token plus its metadata. */
export interface IssuedToken {
  token: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  issuedAt: string;
}

/**
 * Claims carried by the access token.
 *
 * `sub` is the immutable user `id`; `userId`/`role` are denormalised for
 * convenience only - authorisation always re-reads the user from the store so a
 * role change takes effect immediately instead of at the next login.
 */
export interface TokenClaims {
  sub: string;
  userId: string;
  role: UserRole;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Payload returned by a successful login. */
export interface LoginResult extends IssuedToken {
  user: PublicUser;
}
