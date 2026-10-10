import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import type { ApiSuccessBody, PaginationMeta } from '../models/api-response.model';
import type { User, UserRole, UserStatus, Department } from '../models/user.model';
import { API_BASE_URL } from '../tokens/api.tokens';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  department?: Department;
}

export interface UserListResponse {
  users: User[];
  pagination: PaginationMeta;
}

export interface CreateUserRequest {
  userId: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: Department;
  status?: UserStatus;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  department?: Department;
  role?: UserRole;
  password?: string;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

/**
 * Data access for MPloyChek users.
 *
 * Follows the project's service convention: inject `HttpClient` + `API_BASE_URL`,
 * unwrap the `{ success, data }` envelope with `map`, and return `Observable<T>` -
 * never an `HttpResponse`. Reusable by any feature (the dashboard profile card
 * today, the admin user management screen later).
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** `GET /api/users/me` - the authenticated user's own profile. */
  getCurrentUser(): Observable<User> {
    return this.http
      .get<ApiSuccessBody<User>>(`${this.baseUrl}/users/me`)
      .pipe(map((body) => body.data));
  }

  /** `GET /api/users` - list all users with pagination, search, and filtering (admin only). */
  getUsers(params: UserListParams = {}): Observable<UserListResponse> {
    let httpParams = new HttpParams();

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    if (params.search) {
      httpParams = httpParams.set('search', params.search);
    }
    if (params.role) {
      httpParams = httpParams.set('role', params.role);
    }
    if (params.status) {
      httpParams = httpParams.set('status', params.status);
    }
    if (params.department) {
      httpParams = httpParams.set('department', params.department);
    }

    return this.http
      .get<ApiSuccessBody<User[]> & { pagination: PaginationMeta }>(`${this.baseUrl}/users`, { params: httpParams })
      .pipe(map((body) => ({ users: body.data, pagination: body.pagination! })));
  }

  /** `GET /api/users/:id` - get a single user by ID (admin only). */
  getUser(id: string): Observable<User> {
    return this.http
      .get<ApiSuccessBody<User>>(`${this.baseUrl}/users/${id}`)
      .pipe(map((body) => body.data));
  }

  /** `POST /api/users` - create a new user (admin only). */
  createUser(request: CreateUserRequest): Observable<User> {
    return this.http
      .post<ApiSuccessBody<User>>(`${this.baseUrl}/users`, request)
      .pipe(map((body) => body.data));
  }

  /** `PATCH /api/users/:id` - update a user (admin only). */
  updateUser(id: string, request: UpdateUserRequest): Observable<User> {
    return this.http
      .patch<ApiSuccessBody<User>>(`${this.baseUrl}/users/${id}`, request)
      .pipe(map((body) => body.data));
  }

  /** `PATCH /api/users/:id/status` - update user status (admin only). */
  updateUserStatus(id: string, request: UpdateUserStatusRequest): Observable<User> {
    return this.http
      .patch<ApiSuccessBody<User>>(`${this.baseUrl}/users/${id}/status`, request)
      .pipe(map((body) => body.data));
  }

  /** `DELETE /api/users/:id` - delete a user (admin only). */
  deleteUser(id: string): Observable<User> {
    return this.http
      .delete<ApiSuccessBody<User>>(`${this.baseUrl}/users/${id}`)
      .pipe(map((body) => body.data));
  }
}
