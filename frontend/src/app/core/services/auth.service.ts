import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type Observable, map, tap } from 'rxjs';

import { AppLink } from '../constants/app-routes';
import { ApiHttpError } from '../models/api-error.model';
import type { ApiSuccessBody } from '../models/api-response.model';
import type { AuthSession } from '../models/auth.model';
import { type LoginCredentials, type User, type UserRole } from '../models/user.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { isTokenExpired } from '../utils/jwt';
import { AuthStorageService } from './auth-storage.service';

/**
 * The single source of truth for authentication across the SPA.
 *
 * Everything authentication-related funnels through here - components never
 * touch the token, storage or the login endpoint directly, which is what keeps
 * the login screen, the guards and the HTTP interceptor consistent and
 * independently testable:
 *
 * - the guards ask {@link isAuthenticated} / {@link hasRole}
 * - the interceptor reads {@link token} and calls {@link handleUnauthorized}
 * - the shell and pages read {@link currentUser}
 *
 * State is exposed as read-only signals, so Angular's `OnPush` components react
 * without any manual subscription bookkeeping.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly storage = inject(AuthStorageService);
  private readonly router = inject(Router);

  private readonly sessionState = signal<AuthSession | null>(this.restoreSession());

  /** The current session, or `null` when signed out. */
  readonly session = this.sessionState.asReadonly();

  /** The authenticated user, or `null` when signed out. */
  readonly currentUser = computed<User | null>(() => this.sessionState()?.user ?? null);

  /** The authenticated user's role, or `null` when signed out. */
  readonly role = computed<UserRole | null>(() => this.sessionState()?.user.role ?? null);

  /**
   * True when a non-expired session is held.
   *
   * A locally expired token counts as signed-out so the app redirects to the
   * login screen instead of firing a request that would 401. The backend still
   * re-verifies every token - this is a UX optimisation, not the security
   * boundary.
   */
  readonly isAuthenticated = computed<boolean>(() => {
    const session = this.sessionState();
    return session !== null && !isTokenExpired(session.token);
  });

  /**
   * `POST /api/auth/login` - exchanges credentials for a session.
   *
   * On success the session is stored and the returned observable completes with
   * it; on failure the normalised `ApiHttpError` is propagated so the caller can
   * decide how to present it.
   */
  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http
      .post<ApiSuccessBody<AuthSession>>(`${this.baseUrl}/auth/login`, credentials)
      .pipe(
        map((body) => body.data),
        tap((session) => this.setSession(session)),
      );
  }

  /** `GET /api/users/me` - re-reads the current profile from the server. */
  refreshCurrentUser(): Observable<User> {
    return this.http.get<ApiSuccessBody<User>>(`${this.baseUrl}/users/me`).pipe(
      map((body) => body.data),
      tap((user) => {
        const session = this.sessionState();
        if (session !== null) {
          this.setSession({ ...session, user });
        }
      }),
    );
  }

  /**
   * Signs the user out.
   *
   * There is no server-side logout (tokens are stateless), so this clears the
   * local session and, unless told otherwise, returns to the login screen -
   * optionally pinning the URL to return to afterwards.
   */
  logout(options: { redirect?: boolean; redirectTo?: string } = {}): void {
    this.clearSession();

    if (options.redirect === false) {
      return;
    }

    void this.router.navigateByUrl(options.redirectTo ?? AppLink.login);
  }

  /** True when the signed-in user holds any of the given roles. */
  hasRole(...roles: readonly UserRole[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  /** The current bearer token, or `null` when signed out. Used by the interceptor. */
  token(): string | null {
    return this.sessionState()?.token ?? null;
  }

  /**
   * Called by the interceptor when the API rejects the token (expired, revoked
   * or belonging to a deleted account): drops the dead session and sends the user
   * back to sign in. Safe to call when already signed out.
   */
  handleUnauthorized(): void {
    if (this.sessionState() === null) {
      return;
    }
    this.logout();
  }

  private setSession(session: AuthSession): void {
    this.sessionState.set(session);
    this.storage.write(session);
  }

  private clearSession(): void {
    this.sessionState.set(null);
    this.storage.clear();
  }

  /** Restores a persisted session, discarding it when the token has already expired. */
  private restoreSession(): AuthSession | null {
    const restored = this.storage.read();

    if (restored === null) {
      return null;
    }

    if (isTokenExpired(restored.token)) {
      this.storage.clear();
      return null;
    }

    return restored;
  }
}

/**
 * Maps a login failure to a message safe and useful to show the user.
 *
 * Kept next to the service (rather than in the component) so the same wording is
 * reused wherever an auth error has to be presented, and so the login screen
 * stays a thin presentation layer.
 */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid user ID or password.';
      case 'ROLE_MISMATCH':
        return 'This account is not registered with the selected role.';
      case 'ACCOUNT_INACTIVE':
        return 'This account is inactive. Please contact an administrator.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the MPloyChek API. Check that the backend is running and try again.';
      case 'TIMEOUT':
        return 'The API took too long to respond. Please try again.';
      default:
        return error.message;
    }
  }

  return 'Sign in failed. Please try again.';
}
