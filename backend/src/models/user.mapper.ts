import type { PublicUser, User } from './user.model';

/**
 * The single sanitiser between the persistence layer and the API.
 *
 * Every response that exposes a user goes through this function, and it copies
 * fields explicitly rather than spreading, so `passwordHash` (and any future
 * sensitive column) can never leak by accident - adding a field to `User` does
 * not add it to the API surface.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    status: user.status,
    createdAt: user.createdAt,
  };
}
