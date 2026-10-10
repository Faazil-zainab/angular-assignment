import { Injectable } from '@angular/core';

import type { AuthSession } from '../models/auth.model';

/** Namespaced key so the session never collides with unrelated storage. */
const STORAGE_KEY = 'mploychek.auth.session';

/**
 * Persists the signed-in session and nothing else.
 *
 * **Why `sessionStorage`:** the token is a bearer credential, so the smallest
 * reasonable blast radius wins. `sessionStorage` is scoped to a single tab and
 * is discarded when it closes, which is materially safer than `localStorage`
 * (shared across tabs and permanent until cleared) while still letting a page
 * refresh keep the user signed in. It also avoids an httpOnly cookie flow, which
 * the current stateless-JWT backend does not issue.
 *
 * The class is the **only** place that touches Web Storage, so hardening it
 * further later - an in-memory-only mode, an encrypted store, or a cookie
 * exchange - means changing this one file and nothing else. Access is guarded
 * and wrapped in `try/catch` because storage can be unavailable (private mode,
 * storage disabled) or hold a stale/corrupt value; in every failure case the
 * app simply behaves as signed-out.
 */
@Injectable({ providedIn: 'root' })
export class AuthStorageService {
  /** Reads the stored session, discarding anything that is not a valid shape. */
  read(): AuthSession | null {
    const storage = this.storage();
    if (storage === null) {
      return null;
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) {
        return null;
      }

      const parsed: unknown = JSON.parse(raw);
      if (isAuthSession(parsed)) {
        return parsed;
      }

      // A stale or hand-edited value is not a session - drop it.
      this.clear();
      return null;
    } catch {
      // Corrupt JSON or a storage access failure: treat as signed-out.
      this.clear();
      return null;
    }
  }

  /** Stores the session (best effort - a storage failure never breaks sign-in). */
  write(session: AuthSession): void {
    const storage = this.storage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Quota or disabled storage: the in-memory session still works for this tab.
    }
  }

  /** Removes the stored session. */
  clear(): void {
    const storage = this.storage();
    if (storage === null) {
      return;
    }

    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing else we can do - clearing is idempotent.
    }
  }

  /** The browser's session storage, or `null` where it is unavailable. */
  private storage(): Storage | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  }
}

/** Structural check so a hand-edited or legacy value cannot crash the app. */
function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const user = candidate['user'];

  return (
    typeof candidate['token'] === 'string' &&
    candidate['token'].length > 0 &&
    typeof candidate['tokenType'] === 'string' &&
    typeof candidate['issuedAt'] === 'string' &&
    typeof user === 'object' &&
    user !== null &&
    typeof (user as Record<string, unknown>)['id'] === 'string' &&
    typeof (user as Record<string, unknown>)['role'] === 'string'
  );
}
