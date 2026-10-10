import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { ApiHttpError } from '../models/api-error.model';
import type { AuthSession } from '../models/auth.model';
import { Department, UserRole, UserStatus, type User } from '../models/user.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { AuthService, describeAuthError } from './auth.service';

const BASE_URL = 'http://localhost:3000/api';
const STORAGE_KEY = 'mploychek.auth.session';

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

/** Builds a syntactically valid JWT whose only meaningful claim is `exp`. */
function tokenExpiringAt(expSeconds: number): string {
  const encode = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER.id, exp: expSeconds })}.signature`;
}

function sessionWithExpiry(expSeconds: number, user: User = USER): AuthSession {
  return {
    token: tokenExpiringAt(expSeconds),
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    issuedAt: new Date().toISOString(),
    user,
  };
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = Math.floor(Date.now() / 1000) - 60;

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('is signed out by default', () => {
    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.currentUser()).toBeNull();
    expect(service.token()).toBeNull();
  });

  it('POSTs credentials, unwraps the envelope and stores the session', () => {
    const service = TestBed.inject(AuthService);
    const session = sessionWithExpiry(FUTURE_EXP);
    let received: AuthSession | undefined;

    service.login({ userId: 'user001', password: 'User@123', role: UserRole.GENERAL_USER }).subscribe(
      (result) => {
        received = result;
      },
    );

    const request = httpMock.expectOne(`${BASE_URL}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      userId: 'user001',
      password: 'User@123',
      role: UserRole.GENERAL_USER,
    });

    request.flush({ success: true, data: session, meta: { requestId: 't', timestamp: '' } });

    expect(received).toEqual(session);
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.currentUser()).toEqual(USER);
    expect(service.token()).toBe(session.token);
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain(session.token);
  });

  it('restores a persisted, unexpired session at startup', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionWithExpiry(FUTURE_EXP)));

    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.currentUser()).toEqual(USER);
  });

  it('discards an expired persisted session at startup', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionWithExpiry(PAST_EXP)));

    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reports the role and answers hasRole()', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sessionWithExpiry(FUTURE_EXP, { ...USER, role: UserRole.ADMIN })),
    );

    const service = TestBed.inject(AuthService);

    expect(service.role()).toBe(UserRole.ADMIN);
    expect(service.hasRole(UserRole.ADMIN)).toBeTrue();
    expect(service.hasRole(UserRole.GENERAL_USER)).toBeFalse();
  });

  it('logout clears the session and returns to the login screen', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionWithExpiry(FUTURE_EXP)));
    const service = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    expect(service.isAuthenticated()).toBeTrue();

    service.logout();

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/auth/login');
  });

  it('refreshes the current user from GET /users/me and updates the session', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionWithExpiry(FUTURE_EXP)));
    const service = TestBed.inject(AuthService);
    const renamed: User = { ...USER, name: 'Renamed User' };

    service.refreshCurrentUser().subscribe();

    httpMock.expectOne(`${BASE_URL}/users/me`).flush({
      success: true,
      data: renamed,
      meta: { requestId: 't', timestamp: '' },
    });

    expect(service.currentUser()?.name).toBe('Renamed User');
  });
});

describe('describeAuthError()', () => {
  it('explains invalid credentials', () => {
    const error = new ApiHttpError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'nope' });

    expect(describeAuthError(error)).toBe('Invalid user ID or password.');
  });

  it('explains a role mismatch', () => {
    const error = new ApiHttpError({ status: 403, code: 'ROLE_MISMATCH', message: 'nope' });

    expect(describeAuthError(error)).toContain('selected role');
  });

  it('explains an unreachable API', () => {
    const error = new ApiHttpError({ status: 0, code: 'NETWORK_ERROR', message: 'down' });

    expect(describeAuthError(error)).toContain('Cannot reach the MPloyChek API');
  });

  it('falls back to a generic message for unknown failures', () => {
    expect(describeAuthError(new Error('boom'))).toBe('Sign in failed. Please try again.');
  });
});
