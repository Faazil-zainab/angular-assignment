import { Router } from 'express';

import { recordController } from '../controllers/record.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/async-handler';
import { recordListQuerySchema } from '../validation';

/**
 * Mounted at `${API_PREFIX}/records` by the routes index.
 *
 * Both endpoints require authentication. There is deliberately **no** role guard
 * here: authorisation for records is per-row (does this record belong to the
 * caller?), so it is enforced in the service rather than duplicated as a coarse
 * `requireAdmin()` on the route. A general user reaching `GET /records` is still
 * only ever served their own rows.
 */
export const recordRouter = Router();

recordRouter.get(
  '/',
  authenticate(),
  validateQuery(recordListQuerySchema),
  asyncHandler(recordController.listRecords),
);

recordRouter.get('/:id', authenticate(), asyncHandler(recordController.getRecordById));
