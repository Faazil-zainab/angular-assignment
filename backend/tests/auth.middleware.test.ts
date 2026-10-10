import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NextFunction, Request, Response } from 'express';

import { authorize, requireAdmin } from '../src/middleware/auth.middleware';
import {
  Department,
  UserRole,
  UserStatus,
  type User,
} from '../src/models';
import { ApiError } from '../src/utils/api-error';
import { setAuthenticatedUser } from '../src/utils/auth-context';

/**
 * Unit tests for the role based access control guard.
 *
 * It has no route yet - the admin endpoints it protects arrive with user
 * management - so it is verified directly against minimal Express doubles. The
 * 401/403 contract is what matters here: an authenticated caller with the wrong
 * role must never reach the handler.
 */

const BASE_USER: User = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'test001',
  name: 'Test Person',
  email: 'test001@mploychek.dev',
  passwordHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  role: UserRole.GENERAL_USER,
  department: Department.OPERATIONS,
  status: UserStatus.ACTIVE,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ADMIN_USER: User = { ...BASE_USER, role: UserRole.ADMIN };
const GENERAL_USER: User = { ...BASE_USER, role: UserRole.GENERAL_USER };

/** Minimal Express request double - the guard only reads nothing from it. */
function fakeRequest(): Request {
  return { method: 'GET', originalUrl: '/api/anything' } as unknown as Request;
}

/** Minimal Express response double carrying `locals`, like the real thing. */
function fakeResponse(user?: User): Response {
  const response = { locals: {} } as unknown as Response;
  if (user !== undefined) {
    setAuthenticatedUser(response, user);
  }
  return response;
}

/** Captures what a middleware passes to `next()` (`undefined` means "continue"). */
function captureNext(): { next: NextFunction; error: () => unknown } {
  let received: unknown = Symbol('next was never called');
  const next = ((error?: unknown) => {
    received = error;
  }) as NextFunction;

  return { next, error: () => received };
}

describe('authorize() middleware', () => {
  it('lets a caller with an allowed role through', () => {
    const { next, error } = captureNext();

    authorize(UserRole.ADMIN)(fakeRequest(), fakeResponse(ADMIN_USER), next);

    assert.equal(error(), undefined);
  });

  it('lets an admin through when several roles are allowed', () => {
    const { next, error } = captureNext();

    authorize(UserRole.GENERAL_USER, UserRole.ADMIN)(fakeRequest(), fakeResponse(ADMIN_USER), next);

    assert.equal(error(), undefined);
  });

  it('rejects an authenticated caller whose role is not allowed with 403', () => {
    const { next, error } = captureNext();

    authorize(UserRole.ADMIN)(fakeRequest(), fakeResponse(GENERAL_USER), next);

    const received = error();
    assert.ok(received instanceof ApiError, 'expected an ApiError');
    assert.equal(received.statusCode, 403);
    assert.equal(received.code, 'INSUFFICIENT_ROLE');
    assert.match(received.message, /requires one of the following roles: ADMIN/);
  });

  it('rejects an unauthenticated caller with 401 rather than 403', () => {
    const { next, error } = captureNext();

    authorize(UserRole.ADMIN)(fakeRequest(), fakeResponse(), next);

    const received = error();
    assert.ok(received instanceof ApiError);
    assert.equal(received.statusCode, 401);
    assert.equal(received.code, 'TOKEN_MISSING');
  });

  it('refuses to be built without any role', () => {
    assert.throws(() => authorize(), /at least one role/);
  });

  it('requireAdmin() is a shorthand for authorize(ADMIN)', () => {
    const refused = captureNext();
    requireAdmin()(fakeRequest(), fakeResponse(GENERAL_USER), refused.next);
    assert.equal((refused.error() as ApiError).statusCode, 403);

    const allowed = captureNext();
    requireAdmin()(fakeRequest(), fakeResponse(ADMIN_USER), allowed.next);
    assert.equal(allowed.error(), undefined);
  });
});
