import { z } from 'zod';

import type { LoginRequest } from '../models/auth.model';
import { UserRole } from '../models/user.model';

/** Login ids are issued by an administrator, so the character set is fixed. */
const USER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Schema for `POST /api/auth/login`.
 *
 * It validates *shape and format only*. Whether the credentials are correct,
 * whether the account is active and whether the requested role matches are
 * business rules that belong to `AuthService` - they need the data store and
 * must answer 401/403, not 400.
 */
export const loginSchema: z.ZodType<LoginRequest> = z.object({
  userId: z
    .string({ error: 'User ID is required.' })
    .trim()
    .min(3, 'User ID must be at least 3 characters.')
    .max(32, 'User ID must be at most 32 characters.')
    .regex(USER_ID_PATTERN, 'User ID may only contain letters, digits, dot, underscore or hyphen.'),
  password: z
    .string({ error: 'Password is required.' })
    .min(1, 'Password is required.')
    .max(128, 'Password must be at most 128 characters.'),
  role: z.enum([UserRole.ADMIN, UserRole.GENERAL_USER], {
    error: `Role must be one of: ${UserRole.GENERAL_USER}, ${UserRole.ADMIN}.`,
  }),
});
