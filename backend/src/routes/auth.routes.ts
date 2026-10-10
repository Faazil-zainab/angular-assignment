import { Router } from 'express';

import { authController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/async-handler';
import { loginSchema } from '../validation';

/**
 * Mounted at `${API_PREFIX}/auth` by the routes index.
 *
 * The route table stays declarative: validate the shape, then hand off to the
 * controller. There is intentionally no `POST /logout` - tokens are stateless, so
 * signing out is a client side concern until refresh tokens arrive.
 */
export const authRouter = Router();

authRouter.post('/login', validateBody(loginSchema), asyncHandler(authController.login));
