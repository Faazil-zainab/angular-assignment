import type { ErrorRequestHandler } from 'express';

import { config } from '../config/env.config';
import { ApiError } from '../utils/api-error';
import { sendError } from '../utils/http-response';
import { errorMeta, logger } from '../utils/logger';

const log = logger.child('error');

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

interface HttpishError {
  type?: string;
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
}

const INTERNAL_MESSAGE = 'An unexpected error occurred. Please try again later.';

/**
 * Maps anything that can be thrown into a safe, serialisable HTTP error.
 *
 * Recognised, in order: our own `ApiError`, JSON body parse failures, oversized
 * payloads, framework errors carrying a status code, and everything else as an
 * internal error whose details are only logged - never returned.
 */
function normalizeError(error: unknown): NormalizedError {
  if (ApiError.isApiError(error)) {
    const serialized = error.toJSON();
    return {
      statusCode: serialized.statusCode,
      code: serialized.code,
      message: serialized.message,
      ...(serialized.details === undefined ? {} : { details: serialized.details }),
    };
  }

  // body-parser raises a SyntaxError (with a `body` property) on malformed JSON.
  if (error instanceof SyntaxError && 'body' in error) {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Request body is not valid JSON.' };
  }

  const httpish = error as HttpishError | undefined;
  if (httpish?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `Request body exceeds the ${config.jsonBodyLimit} limit.`,
    };
  }

  const statusCode = httpish?.statusCode ?? httpish?.status;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599) {
    return {
      statusCode,
      code: httpish?.code ?? 'REQUEST_FAILED',
      // Framework messages are safe; anything else gets the generic text.
      message: httpish?.message && httpish.message.length > 0 ? httpish.message : INTERNAL_MESSAGE,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: config.isProduction ? INTERNAL_MESSAGE : (error as Error | undefined)?.message ?? INTERNAL_MESSAGE,
  };
}

/**
 * Central Express error handler - must be the last middleware registered and
 * keeps the four argument signature Express looks for.
 */
export function errorHandler(): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      // The response is already streaming; let Express tear the socket down.
      next(error);
      return;
    }

    const normalized = normalizeError(error);

    const meta = {
      ...errorMeta(error),
      method: req.method,
      path: req.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
    };

    if (normalized.statusCode >= 500) {
      log.error('unhandled error', meta);
    } else {
      log.warn('request error', meta);
    }

    sendError(
      res,
      {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      },
      normalized.statusCode,
    );
  };
}
