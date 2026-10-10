import { ApiHttpError } from '../models/api-error.model';

/**
 * Turns a normalised `ApiHttpError` into a message fit for the UI.
 *
 * Centralised so every feature phrases the same failure the same way and
 * components stay free of error-code knowledge. Anything that is not an
 * `ApiHttpError` (a programming error, a raw throw) falls back to a generic,
 * user-safe message.
 */
export function describeApiError(
  error: unknown,
  fallback = 'Unable to load data. Please try again.',
): string {
  if (error instanceof ApiHttpError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Cannot reach the MPloyChek API. Check that the backend is running and try again.';
      case 'TIMEOUT':
        return 'The API took too long to respond. Please try again.';
      case 'TOKEN_EXPIRED':
      case 'TOKEN_MISSING':
      case 'INVALID_TOKEN':
      case 'TOKEN_SUBJECT_UNKNOWN':
        return 'Your session has expired. Please sign in again.';
      case 'RECORD_FORBIDDEN':
      case 'INSUFFICIENT_ROLE':
        return 'You do not have access to this data.';
      default:
        return error.message.length > 0 ? error.message : fallback;
    }
  }

  return fallback;
}
