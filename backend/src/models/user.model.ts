/**
 * Domain model for a MPloyChek user.
 *
 * Also the on-disk contract: this is exactly what an entry in
 * `backend/data/users.json` looks like. Passwords are stored as a bcrypt digest in
 * `passwordHash` and never in any other form.
 */

/** Roles recognised by the platform. Drives role based access control. */
export enum UserRole {
  GENERAL_USER = 'GENERAL_USER',
  ADMIN = 'ADMIN',
}

/** Whether the account may sign in. */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Business unit the user belongs to.
 *
 * Values are human readable because they are returned by the API as-is and
 * displayed in the UI.
 */
export enum Department {
  VERIFICATION = 'Verification',
  COMPLIANCE = 'Compliance',
  OPERATIONS = 'Operations',
  ADMINISTRATION = 'Administration',
}

/**
 * A persisted user document.
 *
 * `id` is a business key allocated by the repository (`USR-001`, `USR-002`, ...)
 * rather than a UUID, so records and audit trails stay readable. `updatedAt` is an
 * addition to the assessment's field list, kept so `update()` and
 * `updateStatus()` can be audited.
 */
export interface User {
  id: string;
  /** Human friendly login id, unique and compared case insensitively. */
  userId: string;
  name: string;
  email: string;
  /** bcrypt digest (`$2b$10$...`) - never serialised, logged or returned. */
  passwordHash: string;
  role: UserRole;
  department: Department;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The projection every endpoint exposes. Structurally cannot contain a password
 * because it is derived from `User` by omitting `passwordHash`.
 */
export type PublicUser = Omit<User, 'passwordHash' | 'updatedAt'>;

/** Credentials posted to `POST /api/auth/login`. */
export interface LoginCredentials {
  userId: string;
  password: string;
  role: UserRole;
}

/** A user template used by the development seeder (hashed before it is stored). */
export interface SeedUser {
  userId: string;
  name: string;
  email: string;
  /** Plain text only in the seed definition; hashed before it is persisted. */
  password: string;
  role: UserRole;
  department: Department;
  status: UserStatus;
  createdAt: string;
}
