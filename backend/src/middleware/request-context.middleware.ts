import type { RequestHandler } from 'express';

import { initRequestContext } from '../utils/request-context';

/**
 * Assigns every request a correlation id and a start timestamp.
 *
 * Must be registered before any middleware or handler that answers the request,
 * because the response envelope and the request logger both read from it.
 */
export function requestContext(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const context = initRequestContext(res, incoming && incoming.trim().length > 0 ? incoming : undefined);
    res.setHeader('X-Request-Id', context.requestId);
    next();
  };
}
