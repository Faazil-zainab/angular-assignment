import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ApiHttpError } from '../models/api-error.model';
import { AuthService } from '../services/auth.service';
import { API_BASE_URL } from '../tokens/api.tokens';

/** Error codes that mean "this token is no longer usable" - sign the user out. */
const SESSION_INVALID_CODES = new Set([
  'TOKEN_EXPIRED',
  'TOKEN_MISSING',
  'INVALID_TOKEN',
  'TOKEN_SUBJECT_UNKNOWN',
]);

/**
 * Attaches the bearer token to every API request and reacts to a dead session.
 *
 * Two responsibilities, both centralised so no feature has to remember them:
 *
 * 1. **Attach** `Authorization: Bearer <token>` to outbound API calls. The login
 *    request itself is exempt - it carries credentials in its body and a stale
 *    header would only be noise.
 * 2. **React to expiry**: when the API rejects the token, the session is cleared
 *    and the user is redirected to sign in (via {@link AuthService.handleUnauthorized}),
 *    rather than leaving the UI in a half-authenticated state.
 *
 * This interceptor sits *outside* `httpErrorInterceptor` (it is listed first), so
 * the failures it catches are already the normalised `ApiHttpError` - it never has
 * to inspect a raw `HttpErrorResponse`.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const baseUrl = inject(API_BASE_URL);

  const isApiRequest = request.url.startsWith(baseUrl);
  const isLoginRequest = request.url === `${baseUrl}/auth/login`;
  const token = auth.token();

  const authorized =
    isApiRequest && !isLoginRequest && token !== null
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (isSessionInvalid(error)) {
        auth.handleUnauthorized();
      }
      return throwError(() => error);
    }),
  );
};

/** True when a normalised error means the held token can no longer be used. */
function isSessionInvalid(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === 401 && SESSION_INVALID_CODES.has(error.code);
}
