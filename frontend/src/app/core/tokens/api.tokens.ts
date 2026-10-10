import { InjectionToken } from '@angular/core';

/**
 * Base URL of the MPloyChek API, including the `/api` prefix.
 *
 * Provided once in `app.config.ts` from the active environment file, and
 * injected by every data access service. Nothing in the app reads
 * `environment` directly, which keeps the configuration testable.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

/**
 * Artificial latency (ms) appended to API requests as `?delay=<ms>`.
 *
 * The backend clamps the value to `API_DELAY_MAX_MS`. Set it to a non zero value
 * to make loading states visible while demonstrating asynchronous processing.
 */
export const API_DELAY_MS = new InjectionToken<number>('API_DELAY_MS');

/** Per request ceiling, mirroring the backend `apiTimeoutMs` setting. */
export const API_TIMEOUT_MS = new InjectionToken<number>('API_TIMEOUT_MS');
