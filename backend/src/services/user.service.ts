import {
  UserStatus,
  toPublicUser,
  type Department,
  type PublicUser,
  type User,
  type UserRole,
} from '../models';
import { userRepository, type UserRepository, type UserListParams, type UserListResult } from '../repositories';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { hashPassword } from '../utils/password';

const log = logger.child('users');

/** Input for creating a user - the plain text password is hashed here. */
export interface CreateUserInput {
  userId: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: Department;
  status?: UserStatus;
  /**
   * Optional creation timestamp. Only the seeder sets it, so generated data is
   * reproducible; API requests always get "now".
   */
  createdAt?: string;
}

/** Mutable profile fields. `userId` (the login id) is immutable by design. */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  department?: Department;
  role?: UserRole;
  /** When present, replaces the stored digest. */
  password?: string;
}

/**
 * User business logic between the controllers and the repository.
 *
 * It is the only place that knows the *rules*: passwords are hashed on the way in,
 * a user always leaves as a `PublicUser`, the acting administrator cannot lock
 * themselves out, and every "not found" becomes a 404 `ApiError`.
 *
 * It never touches `fs`, `JSON` or file paths - that is the repository's job.
 */
export class UserService {
  constructor(private readonly repository: UserRepository = userRepository) {}

  findAll(params: UserListParams = {}): Promise<UserListResult> {
    return this.repository.findAllWithParams(params);
  }

  findById(id: string): Promise<User | undefined> {
    return this.repository.findById(id);
  }

  /** Looks a user up by login id, compared case insensitively. */
  findByUserId(userId: string): Promise<User | undefined> {
    return this.repository.findByUserId(userId);
  }

  /** Like {@link findById} but throws `404` when the user does not exist. */
  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.repository.findById(id);
    if (user === undefined) {
      throw ApiError.notFound(`No user exists with id "${id}".`, {
        code: 'USER_NOT_FOUND',
        details: { id },
      });
    }
    return user;
  }

  /** Projects a user for the API - the password digest is dropped. */
  toPublic(user: User): PublicUser {
    return toPublicUser(user);
  }

  /** Creates a user, hashing the password before it reaches the store. */
  async create(input: CreateUserInput): Promise<User> {
    const user = await this.repository.create({
      userId: input.userId.trim(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      department: input.department,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    });

    log.info('user created', { id: user.id, userId: user.userId, role: user.role });
    return user;
  }

  /** Applies a partial update. Rehashes the password when one is supplied. */
  async update(id: string, patch: UpdateUserInput): Promise<User> {
    await this.getByIdOrFail(id);

    const updated = await this.repository.update(id, {
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
      ...(patch.email === undefined ? {} : { email: patch.email.trim().toLowerCase() }),
      ...(patch.department === undefined ? {} : { department: patch.department }),
      ...(patch.role === undefined ? {} : { role: patch.role }),
      ...(patch.password === undefined ? {} : { passwordHash: await hashPassword(patch.password) }),
    });

    if (updated === undefined) {
      throw ApiError.notFound(`No user exists with id "${id}".`, { code: 'USER_NOT_FOUND' });
    }

    log.info('user updated', { id: updated.id, userId: updated.userId });
    return updated;
  }

  /**
   * Activates or deactivates an account.
   *
   * An administrator may not deactivate themselves: it would lock the last
   * administrator out of the platform.
   */
  async updateStatus(id: string, status: UserStatus, actingUser: User): Promise<User> {
    if (id === actingUser.id && status !== UserStatus.ACTIVE) {
      throw ApiError.conflict('You cannot deactivate your own account.', {
        code: 'SELF_DEACTIVATION_NOT_ALLOWED',
        details: { id },
      });
    }

    const updated = await this.repository.updateStatus(id, status);
    if (updated === undefined) {
      throw ApiError.notFound(`No user exists with id "${id}".`, { code: 'USER_NOT_FOUND' });
    }

    log.info('user status changed', { id: updated.id, userId: updated.userId, status });
    return updated;
  }

  /**
   * Deletes a user.
   *
   * Records owned by the deleted user are intentionally left in place: verification
   * history is evidence and must outlive the account that requested it.
   */
  async delete(id: string, actingUser: User): Promise<User> {
    if (id === actingUser.id) {
      throw ApiError.conflict('You cannot delete your own account.', {
        code: 'SELF_DELETION_NOT_ALLOWED',
        details: { id },
      });
    }

    const user = await this.getByIdOrFail(id);
    const removed = await this.repository.delete(id);

    if (!removed) {
      throw ApiError.notFound(`No user exists with id "${id}".`, { code: 'USER_NOT_FOUND' });
    }

    log.info('user deleted', { id: user.id, userId: user.userId });
    return user;
  }
}

/** Shared instance used by the controllers and the seeder. */
export const userService = new UserService();
