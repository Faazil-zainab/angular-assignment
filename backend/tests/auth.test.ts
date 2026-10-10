import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';

import { createApp } from '../src/app';
import { config } from '../src/config/env.config';
import { Department, UserRole, UserStatus, type PublicUser } from '../src/models';
import { seedService } from '../src/services/seed.service';

interface LoginPayload {
  token: string;
  tokenType: string;
  expiresInSeconds: number;
  issuedAt: string;
  user: PublicUser;
}

interface SuccessBody<TData> {
  success: true;
  data: TData;
  meta: { requestId: string; timestamp: string };
}

interface ValidationDetails {
  fields?: Array<{ field: string; message: string }>;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: ValidationDetails };
}

interface Credentials {
  userId: string;
  password: string;
  role: UserRole;
}

const ADMIN: Credentials = { userId: 'admin001', password: 'Admin@123', role: UserRole.ADMIN };
const GENERAL_USER: Credentials = { userId: 'user001', password: 'User@123', role: UserRole.GENERAL_USER };

/** PublicUser fields the API is allowed to return - and nothing else. */
const EXPECTED_USER_FIELDS = [
  'createdAt',
  'department',
  'email',
  'id',
  'name',
  'role',
  'status',
  'userId',
];

/**
 * End to end tests of the authentication API.
 *
 * The suite runs against the real Express app on an ephemeral port, with the
 * isolated store from `.env.test` (`data/.test-users.json`), seeded here so the
 * assertions never depend on the developer's local data.
 */
describe('MPloyChek authentication API', () => {
  let server: Server;
  let baseUrl = '';

  const url = (path: string): string => `${baseUrl}${config.apiPrefix}${path}`;

  const login = (body: unknown): Promise<Response> =>
    fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const loginAs = async (credentials: Credentials): Promise<LoginPayload> => {
    const response = await login(credentials);
    assert.equal(response.status, 200, `expected a successful login for ${credentials.userId}`);
    return ((await response.json()) as SuccessBody<LoginPayload>).data;
  };

  const me = (token?: string): Promise<Response> =>
    fetch(url('/users/me'), {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  before(async () => {
    // Start from a clean sandbox store so assertions never depend on the order in
    // which test files run.
    await fs.rm(config.storage.directory, { recursive: true, force: true });
    await seedService.resetDevelopmentData();

    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', (error: Error) => reject(error));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fs.rm(config.storage.directory, { recursive: true, force: true });
  });

  // --- POST /api/auth/login : success --------------------------------------

  describe('POST /api/auth/login', () => {
    it('signs the seeded administrator in and returns a signed token', async () => {
      const response = await login(ADMIN);
      assert.equal(response.status, 200);

      const body = (await response.json()) as SuccessBody<LoginPayload>;

      assert.equal(body.success, true);
      assert.equal(body.data.tokenType, 'Bearer');
      assert.equal(body.data.expiresInSeconds, config.auth.jwtExpiresInSeconds);
      assert.equal(body.data.token.split('.').length, 3, 'expected a JWT with three segments');
      assert.ok(body.meta.requestId.length > 0);

      assert.equal(body.data.user.userId, 'admin001');
      assert.equal(body.data.user.name, 'System Administrator');
      assert.equal(body.data.user.email, 'admin@mploychek.local');
      assert.equal(body.data.user.role, UserRole.ADMIN);
      assert.equal(body.data.user.department, Department.ADMINISTRATION);
      assert.equal(body.data.user.status, UserStatus.ACTIVE);
      assert.equal(body.data.user.id, 'USR-001', 'ids are allocated as USR-nnn');
    });

    it('signs the seeded general user in with its own role and department', async () => {
      const body = await loginAs(GENERAL_USER);

      assert.equal(body.user.userId, 'user001');
      assert.equal(body.user.name, 'General User');
      assert.equal(body.user.role, UserRole.GENERAL_USER);
      assert.equal(body.user.department, Department.VERIFICATION);
    });

    it('never includes password material in the response', async () => {
      const response = await login(ADMIN);
      const body = (await response.json()) as SuccessBody<LoginPayload>;
      const serialized = JSON.stringify(body);

      assert.ok(!serialized.includes('passwordHash'), 'the digest must not be serialized');
      assert.ok(!serialized.toLowerCase().includes(ADMIN.password.toLowerCase()), 'the password must not be echoed');

      assert.deepEqual(
        Object.keys(body.data.user).sort(),
        EXPECTED_USER_FIELDS,
        'the user projection must contain exactly the public fields',
      );
      assert.deepEqual(Object.keys(body.data).sort(), [
        'expiresInSeconds',
        'issuedAt',
        'token',
        'tokenType',
        'user',
      ]);
    });

    it('matches the user id case insensitively and ignores surrounding spaces', async () => {
      const body = await loginAs({ ...ADMIN, userId: '  ADMIN001 ' });

      assert.equal(body.user.userId, 'admin001', 'the stored casing wins');
    });

    it('returns 401 when the password is wrong', async () => {
      const response = await login({ ...ADMIN, password: 'WrongPassword!' });

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INVALID_CREDENTIALS');
    });

    it('returns 401 for an unknown user id without revealing that it is unknown', async () => {
      const unknown = await login({ ...ADMIN, userId: 'nobody001' });
      const wrongPassword = await login({ ...ADMIN, password: 'WrongPassword!' });

      assert.equal(unknown.status, 401);

      const unknownBody = (await unknown.json()) as ErrorBody;
      const wrongPasswordBody = (await wrongPassword.json()) as ErrorBody;

      assert.equal(unknownBody.error.code, 'INVALID_CREDENTIALS');
      assert.equal(
        unknownBody.error.message,
        wrongPasswordBody.error.message,
        'responses must be indistinguishable to prevent user enumeration',
      );
    });

    it('returns 403 when the credentials are valid but the requested role is not', async () => {
      const response = await login({ ...ADMIN, role: UserRole.GENERAL_USER });

      assert.equal(response.status, 403);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'ROLE_MISMATCH');
      assert.match(body.error.message, /registered as ADMIN/i);
    });

    it('returns 400 with per-field details when the body is incomplete', async () => {
      const response = await login({ userId: 'ab' });

      assert.equal(response.status, 400);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'VALIDATION_ERROR');

      const fields = (body.error.details?.fields ?? []).map((issue) => issue.field).sort();
      assert.deepEqual(fields, ['password', 'role', 'userId']);
    });

    it('returns 400 for an unknown role value', async () => {
      const response = await login({ ...ADMIN, role: 'SUPER_ADMIN' });

      assert.equal(response.status, 400);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.equal(body.error.details?.fields?.[0]?.field, 'role');
    });

    it('returns 400 for an empty body', async () => {
      const response = await login({});

      assert.equal(response.status, 400);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.equal(body.error.details?.fields?.length, 3);
    });
  });

  // --- GET /api/users/me ---------------------------------------------------

  describe('GET /api/users/me', () => {
    it('returns the authenticated user for a valid token', async () => {
      const session = await loginAs(GENERAL_USER);
      const response = await me(session.token);

      assert.equal(response.status, 200);
      const body = (await response.json()) as SuccessBody<PublicUser>;

      assert.equal(body.success, true);
      assert.deepEqual(body.data, session.user, 'the profile must match the login response');
      assert.deepEqual(Object.keys(body.data).sort(), EXPECTED_USER_FIELDS);
    });

    it('returns 401 without a token and advertises the bearer scheme', async () => {
      const response = await me();

      assert.equal(response.status, 401);
      assert.match(response.headers.get('www-authenticate') ?? '', /Bearer/);

      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'TOKEN_MISSING');
    });

    it('returns 401 for a malformed token', async () => {
      const response = await me('not-a-real-token');

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'INVALID_TOKEN');
    });

    it('returns 401 for a token signed with a different secret', async () => {
      const session = await loginAs(ADMIN);
      const forged = jwt.sign({ userId: session.user.userId, role: UserRole.ADMIN }, 'some-other-secret', {
        subject: session.user.id,
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
        expiresIn: 60,
      });

      const response = await me(forged);

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'INVALID_TOKEN', 'a foreign signature must not be accepted');
    });

    it('returns 401 for an expired token', async () => {
      const session = await loginAs(ADMIN);
      const expired = jwt.sign({ userId: session.user.userId, role: UserRole.ADMIN }, config.auth.jwtSecret, {
        subject: session.user.id,
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
        expiresIn: -1,
      });

      const response = await me(expired);

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'TOKEN_EXPIRED');
    });

    it('returns 401 when the token subject no longer maps to a user', async () => {
      const ghost = jwt.sign({ userId: 'ghost001', role: UserRole.ADMIN }, config.auth.jwtSecret, {
        subject: '11111111-2222-3333-4444-555555555555',
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
        expiresIn: 60,
      });

      const response = await me(ghost);

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'TOKEN_SUBJECT_UNKNOWN');
    });

    it('takes the role from the store, not from the token claims', async () => {
      const session = await loginAs(GENERAL_USER);
      const escalated = jwt.sign({ userId: 'user001', role: UserRole.ADMIN }, config.auth.jwtSecret, {
        subject: session.user.id,
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
        expiresIn: 60,
      });

      const response = await me(escalated);

      assert.equal(response.status, 200);
      const body = (await response.json()) as SuccessBody<PublicUser>;
      assert.equal(
        body.data.role,
        UserRole.GENERAL_USER,
        'a forged role claim must not upgrade the caller',
      );
    });
  });

  // --- Status code coverage ------------------------------------------------

  describe('status codes', () => {
    it('returns 404 for an unknown API route', async () => {
      // A path that matches no router at all. (`/users/:id` *is* a known route,
      // so probing it without a token correctly answers 401 first.)
      const response = await fetch(url('/does-not-exist'));

      assert.equal(response.status, 404);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    });
  });
});
