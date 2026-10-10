import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { API_BASE_URL, API_DELAY_MS } from '../tokens/api.tokens';

/**
 * Demonstrates the *configurable API delay* on the client side.
 *
 * When `apiDelayMs` is configured (environment -> injection token) every request
 * to the MPloyChek API carries `?delay=<ms>`, which the backend clamps to
 * `API_DELAY_MAX_MS`. The UI therefore shows genuine network latency, so loading
 * states and RxJS switching can be observed rather than simulated with timers.
 *
 * Requests that already specify their own `delay` parameter are left untouched.
 */
export const apiDelayInterceptor: HttpInterceptorFn = (request, next) => {
  const delayMs = inject(API_DELAY_MS);
  const baseUrl = inject(API_BASE_URL);

  const isApiRequest = request.url.startsWith(baseUrl);
  const alreadyDelayed = request.params.has('delay');

  if (!isApiRequest || alreadyDelayed || !Number.isFinite(delayMs) || delayMs <= 0) {
    return next(request);
  }

  return next(request.clone({ setParams: { delay: String(Math.floor(delayMs)) } }));
};
