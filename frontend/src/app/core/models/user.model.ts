/**
 * Domain model for a MPloyChek user, mirroring
 * `backend/src/models/user.model.ts`.
 *
 * `User` matches the backend's `PublicUser` projection exactly - the API never
 * returns a password digest, so there is deliberately no field for one here.
 */

/** Roles recognised by the platform. Drives the role-based access control. */
export enum UserRole {
  GENERAL_USER = 'GENERAL_USER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Business unit a user belongs to.
 *
 * Values are human readable because the API returns them as-is and the UI displays
 * them directly.
 */
export enum Department {
  VERIFICATION = 'Verification',
  COMPLIANCE = 'Compliance',
  OPERATIONS = 'Operations',
  ADMINISTRATION = 'Administration',
}

/** A user as returned by the API (never includes credentials). */
export interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  department: Department;
  status: UserStatus;
  createdAt: string;
}

/** Body of `POST /api/auth/login`. */
export interface LoginCredentials {
  userId: string;
  password: string;
  role: UserRole;
}

/** Label + icon metadata used to render a role in the UI. */
export interface RoleOption {
  readonly value: UserRole;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

/** Options offered by the login form's role selector. */
export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    value: UserRole.GENERAL_USER,
    label: 'General User',
    description: 'Runs verification requests and tracks their own records.',
    icon: 'person',
  },
  {
    value: UserRole.ADMIN,
    label: 'Admin',
    description: 'Manages users, records and platform configuration.',
    icon: 'admin_panel_settings',
  },
];
