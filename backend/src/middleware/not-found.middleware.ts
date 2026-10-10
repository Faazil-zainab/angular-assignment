import type { RequestHandler } from 'express';

import { ApiError } from '../utils/api-error';

/**
 * Terminal middleware for unmatched routes. Registered after every router, it
 * converts a miss into a normal `ApiError` so the client always receives the
 * standard error envelope.
 */
export function notFound(): RequestHandler {
  return (req, _res, next) => {
    next(
      ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}.`, {
        code: 'ROUTE_NOT_FOUND',
      }),
    );
  };
}
