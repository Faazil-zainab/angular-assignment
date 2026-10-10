import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Department, UserRole, UserStatus, type User } from '../models/user.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { UserService } from './user.service';

const BASE_URL = 'http://localhost:3000/api';

const USER: User = {
  id: 'USR-002',
  userId: 'user001',
  name: 'General User',
  email: 'user@mploychek.local',
  role: UserRole.GENERAL_USER,
  department: Department.VERIFICATION,
  status: UserStatus.ACTIVE,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const USER_LIST_RESPONSE = {
  users: [USER],
  pagination: {
    page: 1,
    limit: 10,
    totalRecords: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests /users/me and unwraps the envelope', () => {
    let received: User | undefined;

    service.getCurrentUser().subscribe((user) => (received = user));

    const request = httpMock.expectOne(`${BASE_URL}/users/me`);
    expect(request.request.method).toBe('GET');

    request.flush({ success: true, data: USER, meta: { requestId: 't', timestamp: '' } });

    expect(received).toEqual(USER);
  });

  it('requests /users with pagination params and returns users + pagination', () => {
    let received: { users: User[]; pagination: { page: number; limit: number; totalRecords: number } } | undefined;

    service.getUsers({ page: 1, limit: 20, search: 'test', role: UserRole.ADMIN }).subscribe((res) => (received = res));

    const request = httpMock.expectOne((req) =>
      req.url === `${BASE_URL}/users` &&
      req.params.get('page') === '1' &&
      req.params.get('limit') === '20' &&
      req.params.get('search') === 'test' &&
      req.params.get('role') === UserRole.ADMIN
    );
    expect(request.request.method).toBe('GET');

    request.flush({
      success: true,
      data: [USER],
      meta: { requestId: 't', timestamp: '' },
      pagination: { page: 1, limit: 20, totalRecords: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    expect(received).toEqual({
      users: [USER],
      pagination: { page: 1, limit: 20, totalRecords: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } as { users: User[]; pagination: { page: number; limit: number; totalRecords: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } });
  });

  it('POSTs to /users to create a user', () => {
    let received: User | undefined;
    const newUser = { ...USER, id: 'USR-003', userId: 'newuser' };

    service
      .createUser({
        userId: 'newuser',
        name: 'New User',
        email: 'new@test.com',
        password: 'password123',
        role: UserRole.GENERAL_USER,
        department: Department.OPERATIONS,
      })
      .subscribe((user) => (received = user));

    const request = httpMock.expectOne(`${BASE_URL}/users`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      userId: 'newuser',
      name: 'New User',
      email: 'new@test.com',
      password: 'password123',
      role: UserRole.GENERAL_USER,
      department: Department.OPERATIONS,
    });

    request.flush({ success: true, data: newUser, meta: { requestId: 't', timestamp: '' } });
    expect(received).toEqual(newUser);
  });

  it('PATCHes to /users/:id to update a user', () => {
    let received: User | undefined;
    const updatedUser = { ...USER, name: 'Updated Name' };

    service.updateUser('USR-002', { name: 'Updated Name', email: 'updated@test.com' }).subscribe((user) => (received = user));

    const request = httpMock.expectOne(`${BASE_URL}/users/USR-002`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Updated Name', email: 'updated@test.com' });

    request.flush({ success: true, data: updatedUser, meta: { requestId: 't', timestamp: '' } });
    expect(received).toEqual(updatedUser);
  });

  it('PATCHes to /users/:id/status to update user status', () => {
    let received: User | undefined;
    const updatedUser = { ...USER, status: UserStatus.INACTIVE };

    service.updateUserStatus('USR-002', { status: UserStatus.INACTIVE }).subscribe((user) => (received = user));

    const request = httpMock.expectOne(`${BASE_URL}/users/USR-002/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: UserStatus.INACTIVE });

    request.flush({ success: true, data: updatedUser, meta: { requestId: 't', timestamp: '' } });
    expect(received).toEqual(updatedUser);
  });

  it('DELETEs to /users/:id to delete a user', () => {
    let received: User | undefined;
    const deletedUser = { ...USER };

    service.deleteUser('USR-002').subscribe((user) => (received = user));

    const request = httpMock.expectOne(`${BASE_URL}/users/USR-002`);
    expect(request.request.method).toBe('DELETE');

    request.flush({ success: true, data: deletedUser, meta: { requestId: 't', timestamp: '' } });
    expect(received).toEqual(deletedUser);
  });
});
