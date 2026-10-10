import type { Request, RequestHandler, Response } from 'express';
import type { ZodError, ZodType } from 'zod';

import { ApiError } from '../utils/api-error';

/** One user-facing validation problem, addressed by field path. */
export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Validates `req.body` against a schema before the request reaches a controller.
 *
 * On success the parsed value replaces the raw body, so controllers work with
 * trimmed, type checked and whitelisted data (unknown keys are dropped by the
 * schema). On failure the request is rejected with 400 and a per-field breakdown
 * inside the standard error envelope.
 */
export function validateBody<TBody>(schema: ZodType<TBody>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        ApiError.badRequest('The request body failed validation.', {
          code: 'VALIDATION_ERROR',
          details: { fields: toIssues(result.error) },
        }),
      );
      return;
    }

    req.body = result.data;
    next();
  };
}

/** Key under which the parsed query is stashed on `res.locals`. */
const QUERY_KEY = 'validatedQuery';

/**
 * Validates `req.query` against a schema before the request reaches a controller.
 *
 * Express 5 exposes `req.query` as a read-only getter, so the *parsed* result is
 * published on `res.locals` instead of written back. Unknown keys are stripped by
 * the schema (unless it is `.strict()`), which is a security feature here: a
 * client cannot smuggle in an extra `userId` that a careless handler might read.
 * On failure the request is rejected with 400 and a per-field breakdown.
 */
export function validateQuery<TQuery>(schema: ZodType<TQuery>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(
        ApiError.badRequest('The query parameters failed validation.', {
          code: 'VALIDATION_ERROR',
          details: { fields: toIssues(result.error) },
        }),
      );
      return;
    }

    (res.locals as Record<string, unknown>)[QUERY_KEY] = result.data;
    next();
  };
}

/**
 * Reads a body that a {@link validateBody} middleware has already parsed.
 *
 * The cast is confined to this function: the only way to reach it is through a
 * route that validated the body against `TBody` first.
 */
export function readBody<TBody>(req: Request): TBody {
  return req.body as TBody;
}

/**
 * Reads the query that a {@link validateQuery} middleware has already parsed.
 *
 * Like {@link readBody}, the cast is confined to the one call site that is only
 * reachable through a validating route.
 */
export function readQuery<TQuery>(res: Response): TQuery {
  return (res.locals as Record<string, unknown>)[QUERY_KEY] as TQuery;
}

function toIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map((segment) => String(segment)).join('.') : 'body',
    message: issue.message,
  }));
}
