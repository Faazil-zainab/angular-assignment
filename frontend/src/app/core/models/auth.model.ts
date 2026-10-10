import type { User } from './user.model';

/**
 * A signed-in session: the access token returned by `POST /api/auth/login`
 * together with the user it authenticates.
 *
 * This is exactly the backend's `LoginResult` (see
 * `backend/src/models/auth.model.ts`), so the session can be stored verbatim and
 * restored on a page reload without a second request. It deliberately holds no
 * credentials.
 */
export interface AuthSession {
  token: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds, as reported by the API. */
  expiresInSeconds: number;
  /** ISO-8601 timestamp of when the token was issued. */
  issuedAt: string;
  /** The authenticated user (the API's `PublicUser` - never a password digest). */
  user: User;
}

/** Alias matching the backend's `LoginResult` naming, for readability at call sites. */
export type LoginResult = AuthSession;
