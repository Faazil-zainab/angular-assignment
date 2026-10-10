import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** A route handler that may return a promise. */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

/**
 * Forwards rejected promises (and synchronously thrown errors) from `async`
 * route handlers into the Express error pipeline.
 *
 * Express 5 already awaits handlers, but wrapping explicitly keeps behaviour
 * identical if a handler is ever invoked from older Express internals or from a
 * test harness, and it documents intent at the call site.
 */
export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
