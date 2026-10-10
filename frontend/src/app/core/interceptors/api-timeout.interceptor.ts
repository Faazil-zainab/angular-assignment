import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, throwError, timeout } from 'rxjs';

import { ApiHttpError } from '../models/api-error.model';
import { API_TIMEOUT_MS } from '../tokens/api.tokens';

/**
 * Fails requests that take longer than `apiTimeoutMs`.
 *
 * Useful together with the configurable API delay: set `?delay=5000` on a slow
 * connection and the request is abandoned with a typed `TIMEOUT` error instead of
 * spinning forever.
 */
export const apiTimeoutInterceptor: HttpInterceptorFn = (request, next) => {
  const timeoutMs = inject(API_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return next(request);
  }

  return next(request).pipe(
    timeout({
      each: timeoutMs,
      with: (): Observable<never> =>
        throwError(
          () =>
            new ApiHttpError({
              status: 0,
              code: 'TIMEOUT',
              message: `The request to ${request.url} took longer than ${timeoutMs}ms.`,
            }),
        ),
    }),
  );
};
