import { config } from '../config/env.config';
import {
  Department,
  UserRole,
  UserStatus,
  type User,
} from '../models';
import { ApiError } from '../utils/api-error';
import { JsonCollectionRepository } from './json.repository';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  department?: Department;
}

export interface UserListResult {
  users: User[];
  totalRecords: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Fields accepted when inserting a user. The password arrives already hashed.
 *
 * `createdAt`/`updatedAt` are optional so seed data can be given fixed timestamps
 * and stay reproducible.
 */
export interface NewUserRecord {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department: Department;
  status?: UserStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** Mutable fields of an existing user. `userId` and `id` are immutable. */
export interface UserRecordPatch {
  name?: string;
  email?: string;
  department?: Department;
  role?: UserRole;
  passwordHash?: string;
}

/**
 * Persistence for `backend/data/users.json`.
 *
 * Reads return `undefined`/`false` so the service layer can decide the HTTP status.
 * Writes throw for *conflicts* (`409`) because uniqueness has to be checked inside
 * the same queued read-modify-write cycle that performs the change - checking in
 * the service first would leave a race between two concurrent requests.
 */
export class UserRepository extends JsonCollectionRepository<User> {
  constructor(file: string = config.storage.usersFile) {
    super({ file, label: 'users', idPrefix: 'USR' });
  }

  /** Validates one entry read from disk. */
  protected parseEntry(raw: unknown, index: number): User {
    const entry = this.requireObject(raw, index);

    return {
      id: this.requireString(entry['id'], 'id', index),
      userId: this.requireString(entry['userId'], 'userId', index),
      name: this.requireString(entry['name'], 'name', index),
      email: this.requireString(entry['email'], 'email', index),
      passwordHash: this.requireString(entry['passwordHash'], 'passwordHash', index),
      role: this.requireEnum(entry['role'], 'role', UserRole, index),
      department: this.requireEnum(entry['department'], 'department', Department, index),
      status: this.requireEnum(entry['status'], 'status', UserStatus, index),
      createdAt: this.requireIsoDate(entry['createdAt'], 'createdAt', index),
      updatedAt: this.requireIsoDate(entry['updatedAt'], 'updatedAt', index),
    };
  }

  /** Looks a user up by login id, compared case insensitively. */
  async findByUserId(userId: string): Promise<User | undefined> {
    const needle = userId.trim().toLowerCase();
    return this.query((users) =>
      users.find((user) => user.userId.toLowerCase() === needle),
    );
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const needle = email.trim().toLowerCase();
    return this.query((users) => users.find((user) => user.email.toLowerCase() === needle));
  }

  /** Lists users with pagination, search, and filtering. */
  async findAllWithParams(params: UserListParams = {}): Promise<UserListResult> {
    return this.query((users) => {
      let filtered = [...users];

      if (params.search) {
        const needle = params.search.trim().toLowerCase();
        filtered = filtered.filter(
          (user) =>
            user.name.toLowerCase().includes(needle) ||
            user.userId.toLowerCase().includes(needle) ||
            user.email.toLowerCase().includes(needle),
        );
      }

      if (params.role) {
        filtered = filtered.filter((user) => user.role === params.role);
      }

      if (params.status) {
        filtered = filtered.filter((user) => user.status === params.status);
      }

      if (params.department) {
        filtered = filtered.filter((user) => user.department === params.department);
      }

      const totalRecords = filtered.length;
      const limit = params.limit && params.limit > 0 ? params.limit : 10;
      const page = params.page && params.page > 0 ? params.page : 1;
      const totalPages = Math.ceil(totalRecords / limit) || 1;
      const start = (page - 1) * limit;
      const paginatedUsers = filtered.slice(start, start + limit);

      return {
        users: paginatedUsers,
        totalRecords,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    });
  }

  /** Inserts a user, allocating the next `USR-nnn` id. */
  async create(input: NewUserRecord): Promise<User> {
    return this.transact((users) => {
      this.assertUnique(users, input.userId, input.email);

      const timestamp = this.now();
      const user: User = {
        id: this.allocateId(users),
        userId: input.userId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        department: input.department,
        status: input.status ?? UserStatus.ACTIVE,
        createdAt: input.createdAt ?? timestamp,
        updatedAt: input.updatedAt ?? input.createdAt ?? timestamp,
      };

      users.push(user);
      return user;
    });
  }

  /** Applies a partial update. Returns `undefined` when the user does not exist. */
  async update(id: string, patch: UserRecordPatch): Promise<User | undefined> {
    return this.transact((users) => {
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return undefined;
      }

      const existing = users[index] as User;

      if (patch.email !== undefined) {
        this.assertEmailAvailable(users, patch.email, existing.id);
      }

      const updated: User = {
        ...existing,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.email === undefined ? {} : { email: patch.email }),
        ...(patch.department === undefined ? {} : { department: patch.department }),
        ...(patch.role === undefined ? {} : { role: patch.role }),
        ...(patch.passwordHash === undefined ? {} : { passwordHash: patch.passwordHash }),
        updatedAt: this.now(),
      };

      users[index] = updated;
      return updated;
    });
  }

  /** Activates or deactivates an account. Returns `undefined` when not found. */
  async updateStatus(id: string, status: UserStatus): Promise<User | undefined> {
    return this.transact((users) => {
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return undefined;
      }

      const updated: User = { ...(users[index] as User), status, updatedAt: this.now() };
      users[index] = updated;
      return updated;
    });
  }

  /** Removes a user. Returns `false` when the id did not exist. */
  async delete(id: string): Promise<boolean> {
    return this.transact((users) => {
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return false;
      }

      users.splice(index, 1);
      return true;
    });
  }

  private assertUnique(users: readonly User[], userId: string, email: string): void {
    const userIdNeedle = userId.trim().toLowerCase();
    if (users.some((user) => user.userId.toLowerCase() === userIdNeedle)) {
      throw ApiError.conflict(`A user with user id "${userId}" already exists.`, {
        code: 'USER_ID_TAKEN',
        details: { userId },
      });
    }
    this.assertEmailAvailable(users, email);
  }

  private assertEmailAvailable(
    users: readonly User[],
    email: string,
    exceptId?: string,
  ): void {
    const needle = email.trim().toLowerCase();
    const clash = users.find(
      (user) => user.email.toLowerCase() === needle && user.id !== exceptId,
    );

    if (clash !== undefined) {
      throw ApiError.conflict(`A user with email "${email}" already exists.`, {
        code: 'EMAIL_TAKEN',
        details: { email },
      });
    }
  }
}

/** Shared instance bound to the configured users file. */
export const userRepository = new UserRepository();
