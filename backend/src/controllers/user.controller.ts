import type { Request, Response } from 'express';

import { readBody, readQuery } from '../middleware/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  type UserListQuery,
} from '../validation';
import type { z } from 'zod';
import { userService, type CreateUserInput, type UpdateUserInput } from '../services/user.service';
import { requireAuthenticatedUser } from '../utils/auth-context';
import { sendSuccess } from '../utils/http-response';
import type { PaginationMeta } from '../models/record.model';

/** Bodies as validated by the route's schema. */
type CreateUserBody = z.infer<typeof createUserSchema>;
type UpdateUserBody = z.infer<typeof updateUserSchema>;
type UpdateUserStatusBody = z.infer<typeof updateUserStatusSchema>;

/**
 * HTTP surface for users.
 *
 * Two audiences share this resource: any authenticated user may read *their own*
 * profile (`GET /me`), while the rest is administrator only - enforced by
 * `requireAdmin()` on the routes. The controller never touches the filesystem: it
 * reads the validated body, calls the service and shapes the response.
 */
export class UserController {
  /** `GET /api/users/me` - 200 with the current user, 401 when unauthenticated. */
  getCurrentUser = (_req: Request, res: Response): void => {
    const user = requireAuthenticatedUser(res);

    sendSuccess(res, userService.toPublic(user));
  };

  /** `GET /api/users` - 200 with paginated users, passwords omitted. */
  listUsers = async (_req: Request, res: Response): Promise<void> => {
    // The query was parsed, defaulted and bounded by `validateQuery`, so every
    // field here is already the type the service expects - no raw casts.
    const query = readQuery<UserListQuery>(res);

    const result = await userService.findAll(query);

    const pagination: PaginationMeta = {
      page: result.currentPage,
      limit: query.limit,
      totalRecords: result.totalRecords,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };

    sendSuccess(res, result.users.map((user) => userService.toPublic(user)), 200, { pagination });
  };

  /** `GET /api/users/:id` - 200 with the user, 404 when not found (admin only). */
  getUser = async (req: Request, res: Response): Promise<void> => {
    const user = await userService.getByIdOrFail(req.params['id'] as string);
    sendSuccess(res, userService.toPublic(user));
  };

  /** `POST /api/users` - 201 with the created user. */
  createUser = async (req: Request, res: Response): Promise<void> => {
    const body = readBody<CreateUserBody>(req);
    const created = await userService.create(body as CreateUserInput);

    sendSuccess(res, userService.toPublic(created), 201);
  };

  /** `PATCH /api/users/:id` - 200 with the updated user. */
  updateUser = async (req: Request, res: Response): Promise<void> => {
    const body = readBody<UpdateUserBody>(req);
    const updated = await userService.update(req.params['id'] as string, body as UpdateUserInput);

    sendSuccess(res, userService.toPublic(updated));
  };

  /** `PATCH /api/users/:id/status` - 200 with the updated user. */
  updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    const body = readBody<UpdateUserStatusBody>(req);
    const actingUser = requireAuthenticatedUser(res);
    const updated = await userService.updateStatus(
      req.params['id'] as string,
      body.status,
      actingUser,
    );

    sendSuccess(res, userService.toPublic(updated));
  };

  /** `DELETE /api/users/:id` - 200 with the deleted user, so the caller has proof. */
  deleteUser = async (req: Request, res: Response): Promise<void> => {
    const actingUser = requireAuthenticatedUser(res);
    const deleted = await userService.delete(req.params['id'] as string, actingUser);

    sendSuccess(res, userService.toPublic(deleted));
  };
}

export const userController = new UserController();
