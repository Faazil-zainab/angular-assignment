import type { Response } from 'express';

import { randomUUID } from 'node:crypto';

/**
 * Per request bookkeeping shared by middleware, controllers and the response
 * helpers. It lives on `res.locals` so values never have to be threaded through
 * function signatures.
 */
export interface RequestContext {
  /** Correlation id, echoed back in the `X-Request-Id` response header. */
  requestId: string;
  /** `Date.now()` at the moment the request entered the pipeline. */
  startedAt: number;
  /** Artificial latency injected into this request, in milliseconds. */
  delayMs: number;
}

const CONTEXT_KEY = 'context';

/** Creates the context for a fresh request and stores it on the response. */
export function initRequestContext(res: Response, requestId?: string): RequestContext {
  const context: RequestContext = {
    requestId: requestId ?? randomUUID(),
    startedAt: Date.now(),
    delayMs: 0,
  };
  (res.locals as Record<string, unknown>)[CONTEXT_KEY] = context;
  return context;
}

/**
 * Returns the context for the request being handled. Falls back to a lazily
 * created context so helpers can never crash when called from a bare response.
 */
export function getRequestContext(res: Response): RequestContext {
  const locals = res.locals as Record<string, unknown>;
  const existing = locals[CONTEXT_KEY] as RequestContext | undefined;
  return existing ?? initRequestContext(res);
}

/** Elapsed milliseconds since the request entered the pipeline. */
export function elapsedMs(res: Response): number {
  return Date.now() - getRequestContext(res).startedAt;
}
