import { z } from 'zod';

import { RecordStatus, RiskLevel, VerificationType } from '../models/record.model';

/** Upper bound on a page size, so `?limit=100000` cannot exhaust memory. */
export const MAX_PAGE_SIZE = 100;

/**
 * Schema for the `GET /api/records` query string.
 *
 * - `page` / `limit` are coerced from strings and bounded (`limit` <= 100).
 * - the filters are only applied when supplied, and an unknown value is a 400.
 * - `search` is trimmed; an empty `?search=` is treated as "no search".
 *
 * The schema strips unknown keys, so a client cannot smuggle extra state through
 * the query string - notably `userId` is *not* accepted, because access is always
 * decided from the authenticated token.
 *
 * `delay` is deliberately absent: latency is validated and applied by the shared
 * `apiDelay` middleware, before this schema runs.
 */
export const recordListQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'Page must be a positive integer.' })
    .int('Page must be a positive integer.')
    .min(1, 'Page must be a positive integer.')
    .default(1),
  limit: z.coerce
    .number({ error: `Limit must be between 1 and ${MAX_PAGE_SIZE}.` })
    .int(`Limit must be between 1 and ${MAX_PAGE_SIZE}.`)
    .min(1, `Limit must be between 1 and ${MAX_PAGE_SIZE}.`)
    .max(MAX_PAGE_SIZE, `Limit must be between 1 and ${MAX_PAGE_SIZE}.`)
    .default(10),
  search: z
    .string({ error: 'Search must be a string.' })
    .trim()
    .max(120, 'Search must be at most 120 characters.')
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? undefined : value)),
  status: z
    .enum([RecordStatus.PENDING, RecordStatus.IN_PROGRESS, RecordStatus.COMPLETED, RecordStatus.FAILED], {
      error: `Status must be one of: ${Object.values(RecordStatus).join(', ')}.`,
    })
    .optional(),
  riskLevel: z
    .enum([RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH], {
      error: `Risk level must be one of: ${Object.values(RiskLevel).join(', ')}.`,
    })
    .optional(),
  verificationType: z
    .enum(
      [
        VerificationType.EMPLOYMENT,
        VerificationType.EDUCATION,
        VerificationType.IDENTITY,
        VerificationType.ADDRESS,
        VerificationType.CRIMINAL,
      ],
      { error: `Verification type must be one of: ${Object.values(VerificationType).join(', ')}.` },
    )
    .optional(),
});

/** The validated `GET /api/records` query. */
export type RecordListQuery = z.infer<typeof recordListQuerySchema>;
