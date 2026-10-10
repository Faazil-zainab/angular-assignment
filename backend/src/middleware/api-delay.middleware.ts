import type { Request, RequestHandler } from 'express';

import { config } from '../config/env.config';
import { ApiError } from '../utils/api-error';
import { DELAY_ERROR_MESSAGE, delay as sleep, parseDelay, readRawDelay } from '../utils/delay';
import { getRequestContext } from '../utils/request-context';

/**
 * Injects artificial latency, proving the API processes asynchronously.
 *
 * This is the assessment's "configurable asynchronous API delay": the default
 * comes from `API_DELAY_MS`, and a caller can override it per request with
 * `?delay=<ms>` (alias `?delayMs=`). The wait is a promise around `setTimeout`,
 * so the Node.js event loop stays free to serve other requests - the handler
 * simply `await`s its turn.
 *
 * The parameter is **validated**, not silently clamped: a non-numeric, negative
 * or greater-than-a-sane-upper-bound value is rejected with HTTP 400 and
 * `INVALID_DELAY`. A missing parameter is not an error.
 */
export function apiDelay(): RequestHandler {
  return async (req: Request, res, next) => {
    const raw = readRawDelay(req.query as Record<string, unknown>);
    const parsed = parseDelay(raw);

    if (parsed === null) {
      next(
        ApiError.badRequest(DELAY_ERROR_MESSAGE, {
          code: 'INVALID_DELAY',
          details: { received: raw, allowedRangeMs: '0-10000' },
        }),
      );
      return;
    }

    const delayMs = parsed ?? config.apiDelayMs;

    if (delayMs > 0) {
      await sleep(delayMs);
      // Recorded so the response envelope (`meta.delay`) and the access log report it.
      getRequestContext(res).delayMs = delayMs;
    }

    next();
  };
}
