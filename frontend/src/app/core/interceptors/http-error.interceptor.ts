import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { ApiHttpError } from '../models/api-error.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { appLogger } from '../utils/app-logger';
import { inject } from '@angular/core';

const log = appLogger.child('http');

/**
 * Turns every transport failure into a single, typed `ApiHttpError`.
 *
 * Features therefore never have to inspect `HttpErrorResponse`, and the API's
 * own `{ success: false, error }` envelope is promoted to first class error
 * information. Phase 3 hooks user facing notifications (snackbar/toast) here.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const baseUrl = inject(API_BASE_URL);

  return next(request).pipe(
    catchError((error: unknown) => {
      const normalized = normalize(error, baseUrl);
      log.warn(`${request.method} ${request.urlWithParams} -> ${normalized.code}`, normalized.message);
      return throwError(() => normalized);
    }),
  );
};

function normalize(error: unknown, fallbackUrl: string): ApiHttpError {
  // Already normalised by an inner interceptor (e.g. the timeout guard).
  if (error instanceof ApiHttpError) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    const envelope = extractEnvelope(error.error);

    if (error.status === 0) {
      return new ApiHttpError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: `Cannot reach the MPloyChek API. Is the backend running and is ${fallbackUrl} correct?`,
      });
    }

    return new ApiHttpError({
      status: error.status,
      code: envelope?.code ?? `HTTP_${error.status}`,
      message: envelope?.message ?? error.message ?? 'The request failed.',
      details: envelope?.details,
    });
  }

  return new ApiHttpError({
    status: 0,
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
  });
}

function extractEnvelope(payload: unknown): { code?: string; message?: string; details?: unknown } | undefined {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return undefined;
  }

  const candidate = (payload as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const { code, message, details } = candidate as { code?: string; message?: string; details?: unknown };
  return { code, message, details };
}
