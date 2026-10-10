import { z } from 'zod';

import { Department, UserRole, UserStatus } from '../models/user.model';
import { MAX_PAGE_SIZE } from './record.schema';

/** Login ids are issued by an administrator, so the character set is fixed. */
export const USER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Deliberately pragmatic: one `@`, one dot, no whitespace. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password policy for accounts created through the API. */
export const MINIMUM_PASSWORD_LENGTH = 8;

const userId = z
  .string({ error: 'User ID is required.' })
  .trim()
  .min(3, 'User ID must be at least 3 characters.')
  .max(32, 'User ID must be at most 32 characters.')
  .regex(USER_ID_PATTERN, 'User ID may only contain letters, digits, dot, underscore or hyphen.');

const name = z
  .string({ error: 'Name is required.' })
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(80, 'Name must be at most 80 characters.');

const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .max(120, 'Email must be at most 120 characters.')
  .regex(EMAIL_PATTERN, 'Email must be a valid email address.');

const password = z
  .string({ error: 'Password is required.' })
  .min(
    MINIMUM_PASSWORD_LENGTH,
    `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
  )
  .max(128, 'Password must be at most 128 characters.');

const role = z.enum([UserRole.ADMIN, UserRole.GENERAL_USER], {
  error: `Role must be one of: ${UserRole.GENERAL_USER}, ${UserRole.ADMIN}.`,
});

const department = z.enum(
  [Department.VERIFICATION, Department.COMPLIANCE, Department.OPERATIONS, Department.ADMINISTRATION],
  {
    error: `Department must be one of: ${Object.values(Department).join(', ')}.`,
  },
);

const status = z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE], {
  error: `Status must be one of: ${UserStatus.ACTIVE}, ${UserStatus.INACTIVE}.`,
});

/**
 * `POST /api/users` - administrator only.
 *
 * Note what is *absent*: `id` (allocated by the repository) and `passwordHash`
 * (derived from `password`). Unknown keys are stripped by the schema, so a client
 * cannot inject either of them.
 */
export const createUserSchema = z.object({
  userId,
  name,
  email,
  password,
  role,
  department,
  status: status.optional(),
});

/** `PATCH /api/users/:id` - every field optional, but at least one is required. */
export const updateUserSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    role: role.optional(),
    department: department.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    error: 'Provide at least one field to update: name, email, password, role or department.',
  });

/** `PATCH /api/users/:id/status` - activate or deactivate an account. */
export const updateUserStatusSchema = z.object({ status });

/**
 * `GET /api/users` - administrator only.
 *
 * Validating the query string keeps the list endpoint consistent with
 * `GET /api/records`: `page`/`limit` are coerced from strings and bounded (so
 * `?limit=100000` cannot exhaust memory), the filters only accept known enum
 * values, and unknown keys are stripped. Without this, the controller had to
 * parse raw query strings and cast them to enums it could not actually verify.
 */
export const userListQuerySchema = z.object({
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
  role: role.optional(),
  status: status.optional(),
  department: department.optional(),
});

/** The validated `GET /api/users` query. */
export type UserListQuery = z.infer<typeof userListQuerySchema>;
