import { Router } from 'express';

import { healthController } from '../controllers/health.controller';
import { asyncHandler } from '../utils/async-handler';

/**
 * Mounted at `${API_PREFIX}/health` by the routes index.
 */
export const healthRouter = Router();

healthRouter.get('/', asyncHandler(healthController.getHealth));
