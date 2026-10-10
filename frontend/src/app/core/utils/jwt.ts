/**
 * Minimal JWT reader used to inspect a token's expiry on the client.
 *
 * It only ever **decodes** the payload for UX (proactively treating a stale
 * token as signed-out so the user is not sent to a page that will 401). It does
 * **not** verify the signature: the backend is the only authority on whether a
 * token is valid, and every protected request is still authorised there.
 */

/** Decodes the JWT payload, or `null` when the token is not a readable JWT. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  const payloadSegment = segments[1];
  if (segments.length !== 3 || payloadSegment === undefined || payloadSegment.length === 0) {
    return null;
  }

  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = decodeBase64Url(padded);
    const parsed: unknown = JSON.parse(decoded);

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * True when the token carries a past `exp` claim.
 *
 * A token with no readable `exp` is treated as **not** expired - the server
 * remains the source of truth, and failing closed on an unreadable token would
 * log the user out of a session that might still be valid.
 */
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.['exp'];

  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return false;
  }

  return exp * 1000 <= nowMs;
}

/** Decodes base64url in the browser, degrading gracefully where `atob` is absent. */
function decodeBase64Url(value: string): string {
  if (typeof atob === 'function') {
    return atob(value);
  }
  // Non-browser environments (SSR/tests without a DOM) cannot decode here.
  return '';
}
