import type { Response } from 'express';

import type { PaginationMeta } from '../models/record.model';
import type { ApiErrorBody, ApiSuccessBody, ResponseMeta } from '../models/api-response.model';
import { getRequestContext } from './request-context';

function buildMeta(res: Response, includeDuration: boolean): ResponseMeta {
  const context = getRequestContext(res);
  const meta: ResponseMeta = {
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  };
  if (includeDuration) {
    meta.durationMs = Date.now() - context.startedAt;
    meta.delayMs = context.delayMs;
  }
  return meta;
}

/** Optional extras a controller can attach to a success envelope. */
export interface SuccessOptions {
  /** Include `durationMs`/`delayMs` in `meta` (defaults to `true`). */
  includeDuration?: boolean;
  /** Page bookkeeping, rendered as a top-level `pagination` field. */
  pagination?: PaginationMeta;
  /** Extra `meta` fields, merged over the standard ones (e.g. `role`, `delay`). */
  extraMeta?: Record<string, unknown>;
}

/** Sends a `{ success: true, data, meta }` envelope, with optional `pagination`. */
export function sendSuccess<TData>(
  res: Response,
  data: TData,
  statusCode = 200,
  options: SuccessOptions = {},
): void {
  const body: ApiSuccessBody<TData> = {
    success: true,
    data,
    meta: {
      ...buildMeta(res, options.includeDuration ?? true),
      ...(options.extraMeta ?? {}),
    },
  };
  if (options.pagination !== undefined) {
    body.pagination = options.pagination;
  }
  res.status(statusCode).json(body);
}

/** Sends a `{ success: false, error, meta }` envelope. */
export function sendError(
  res: Response,
  error: { code: string; message: string; details?: unknown },
  statusCode = 500,
): void {
  const body: ApiErrorBody = {
    success: false,
    error,
    meta: buildMeta(res, false),
  };
  res.status(statusCode).json(body);
}
