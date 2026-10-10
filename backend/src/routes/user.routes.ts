import { Router } from 'express';

import { userController } from '../controllers/user.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { validateBody, validateQuery } from '../middleware/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userListQuerySchema,
} from '../validation';
import { asyncHandler } from '../utils/async-handler';

/**
 * Mounted at `${API_PREFIX}/users` by the routes index.
 *
 * `GET /me` is available to any authenticated user; everything else is
 * administrator only, which is where role based access control finally bites:
 * `authenticate()` establishes *who* the caller is, `requireAdmin()` decides whether
 * they may proceed (403 when they may not).
 *
 * `/me` is registered before `/:id` so it is never captured as an id.
 */
export const userRouter = Router();

userRouter.get('/me', authenticate(), asyncHandler(userController.getCurrentUser));

userRouter.get(
  '/',
  authenticate(),
  requireAdmin(),
  validateQuery(userListQuerySchema),
  asyncHandler(userController.listUsers),
);

userRouter.get(
  '/:id',
  authenticate(),
  requireAdmin(),
  asyncHandler(userController.getUser),
);

userRouter.post(
  '/',
  authenticate(),
  requireAdmin(),
  validateBody(createUserSchema),
  asyncHandler(userController.createUser),
);

userRouter.patch(
  '/:id',
  authenticate(),
  requireAdmin(),
  validateBody(updateUserSchema),
  asyncHandler(userController.updateUser),
);

userRouter.patch(
  '/:id/status',
  authenticate(),
  requireAdmin(),
  validateBody(updateUserStatusSchema),
  asyncHandler(userController.updateUserStatus),
);

userRouter.delete('/:id', authenticate(), requireAdmin(), asyncHandler(userController.deleteUser));
