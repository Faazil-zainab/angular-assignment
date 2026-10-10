import type { Request, Response } from 'express';

import { readQuery } from '../middleware/validate.middleware';
import { recordService } from '../services/record.service';
import { requireAuthenticatedUser } from '../utils/auth-context';
import { sendSuccess } from '../utils/http-response';
import { getRequestContext } from '../utils/request-context';
import type { RecordListQuery } from '../validation';

/**
 * HTTP surface for background verification records.
 *
 * Deliberately thin: it reads the authenticated user and the *already validated*
 * query, calls the service, and shapes the response envelope. It contains no
 * business logic and never touches the filesystem - ownership is decided in
 * {@link RecordService}, and the latency was applied by the shared delay
 * middleware, which this controller merely reports in `meta.delay`.
 */
export class RecordController {
  /** `GET /api/records` - a page of records scoped to the caller's role. */
  listRecords = async (_req: Request, res: Response): Promise<void> => {
    const user = requireAuthenticatedUser(res);
    const query = readQuery<RecordListQuery>(res);

    const { items, pagination } = await recordService.getRecords(user, query);

    sendSuccess(res, items, 200, {
      pagination,
      extraMeta: { role: user.role, delay: getRequestContext(res).delayMs },
    });
  };

  /** `GET /api/records/:id` - one record, subject to ownership (403) or 404. */
  getRecordById = async (req: Request, res: Response): Promise<void> => {
    const user = requireAuthenticatedUser(res);
    const record = await recordService.getRecordById(req.params['id'] as string, user);

    sendSuccess(res, record, 200, {
      extraMeta: { role: user.role, delay: getRequestContext(res).delayMs },
    });
  };
}

export const recordController = new RecordController();
