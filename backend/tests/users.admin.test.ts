import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app';
import { config } from '../src/config/env.config';
import { Department, UserRole, UserStatus, type PublicUser } from '../src/models';
import { seedService } from '../src/services/seed.service';

interface SuccessBody<TData> {
  success: true;
  data: TData;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: { fields?: Array<{ field: string }> } };
}

const USERS_FILE = config.storage.usersFile;

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
 * The administrator surface of `/api/users`.
 *
 * This is where role based access control finally bites: the same routes must be
 * usable by an administrator and refused with 403 for everyone else.
 */
describe('Admin user management API', () => {
  let server: Server;
  let baseUrl = '';
  let adminToken = '';
  let generalToken = '';

  const url = (path: string): string => `${baseUrl}${config.apiPrefix}${path}`;

  const request = (
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
  ): Promise<Response> =>
    fetch(url(path), {
      method,
      headers: {
        ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

  const login = async (userId: string, password: string, role: UserRole): Promise<string> => {
    const response = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, password, role }),
    });
    assert.equal(response.status, 200, `could not sign in as ${userId}`);
    const body = (await response.json()) as SuccessBody<{ token: string }>;
    return body.data.token;
  };

  /** Creates a user through the API and returns it. */
  const createUser = async (overrides: Record<string, unknown> = {}): Promise<PublicUser> => {
    const response = await request('POST', '/users', {
      token: adminToken,
      body: {
        userId: overrides['userId'] ?? `apiuser${Date.now()}${Math.floor(Math.random() * 1000)}`,
        name: overrides['name'] ?? 'API Created User',
        email: overrides['email'] ?? `api-${Date.now()}-${Math.floor(Math.random() * 10000)}@mploychek.local`,
        password: 'Str0ng@Pass',
        role: UserRole.GENERAL_USER,
        department: Department.COMPLIANCE,
        ...overrides,
      },
    });

    if (response.status !== 201) {
      // Read the body only on failure - reading it always would consume the stream.
      assert.fail(`create failed (${response.status}): ${await response.text()}`);
    }
    return ((await response.json()) as SuccessBody<PublicUser>).data;
  };

  before(async () => {
    await fs.rm(config.storage.directory, { recursive: true, force: true });
    await seedService.resetDevelopmentData();

    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', (error: Error) => reject(error));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    adminToken = await login('admin001', 'Admin@123', UserRole.ADMIN);
    generalToken = await login('user001', 'User@123', UserRole.GENERAL_USER);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fs.rm(config.storage.directory, { recursive: true, force: true });
  });

  describe('access control', () => {
    it('lets an administrator list users', async () => {
      const response = await request('GET', '/users', { token: adminToken });

      assert.equal(response.status, 200);
      const body = (await response.json()) as SuccessBody<PublicUser[]>;
      assert.equal(body.data.length, 2);
      assert.deepEqual(Object.keys(body.data[0] as PublicUser).sort(), EXPECTED_USER_FIELDS);
    });

    it('refuses a general user with 403', async () => {
      const response = await request('GET', '/users', { token: generalToken });

      assert.equal(response.status, 403);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'INSUFFICIENT_ROLE');
      assert.match(body.error.message, /requires one of the following roles: ADMIN/);
    });

    it('refuses an anonymous request with 401', async () => {
      const response = await request('GET', '/users');

      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'TOKEN_MISSING');
    });

    it('never serialises a password digest', async () => {
      const response = await request('GET', '/users', { token: adminToken });
      const raw = await response.text();

      assert.ok(!raw.includes('passwordHash'));
      assert.ok(!raw.includes('$2b$'));
    });
  });

  describe('create', () => {
    it('creates a user and allocates the next business id', async () => {
      const created = await createUser({ userId: 'apicreate01', name: 'API Create' });

      assert.equal(created.id, 'USR-003');
      assert.equal(created.userId, 'apicreate01');
      assert.equal(created.status, UserStatus.ACTIVE);
      assert.deepEqual(Object.keys(created).sort(), EXPECTED_USER_FIELDS);

      const listed = await request('GET', '/users', { token: adminToken });
      const body = (await listed.json()) as SuccessBody<PublicUser[]>;
      assert.equal(body.data.length, 3);
    });

    it('hashes the password on the way in and can authenticate the new account', async () => {
      const created = await createUser({ userId: 'apihash01' });

      const raw = await fs.readFile(USERS_FILE, 'utf8');
      const stored = (JSON.parse(raw) as Array<{ id: string; passwordHash: string }>).find(
        (user) => user.id === created.id,
      );

      assert.ok(stored !== undefined);
      assert.match(stored.passwordHash, /^\$2[aby]\$\d{2}\$/);
      assert.ok(!raw.includes('Str0ng@Pass'), 'the plain text password is not on disk');

      const token = await login('apihash01', 'Str0ng@Pass', UserRole.GENERAL_USER);
      assert.ok(token.length > 0);
    });

    it('ignores an injected id and passwordHash', async () => {
      const created = await createUser({
        userId: 'apiinject01',
        id: 'USR-999',
        passwordHash: '$2b$10$injectedinjectedinjectedinjectedinjectedinjectedinjectedinje',
      });

      assert.notEqual(created.id, 'USR-999');

      const raw = await fs.readFile(USERS_FILE, 'utf8');
      assert.ok(!raw.includes('injectedinjected'), 'the injected digest was stripped');

      const token = await login('apiinject01', 'Str0ng@Pass', UserRole.GENERAL_USER);
      assert.ok(token.length > 0, 'the real password still works');
    });

    it('rejects a duplicate login id with 409', async () => {
      const response = await request('POST', '/users', {
        token: adminToken,
        body: {
          userId: 'admin001',
          name: 'Clashing Id',
          email: 'unique-one@mploychek.local',
          password: 'Str0ng@Pass',
          role: UserRole.GENERAL_USER,
          department: Department.OPERATIONS,
        },
      });

      assert.equal(response.status, 409);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'USER_ID_TAKEN');
    });

    it('rejects a duplicate email with 409', async () => {
      const response = await request('POST', '/users', {
        token: adminToken,
        body: {
          userId: 'uniqueemail01',
          name: 'Clashing Email',
          email: 'admin@mploychek.local',
          password: 'Str0ng@Pass',
          role: UserRole.GENERAL_USER,
          department: Department.OPERATIONS,
        },
      });

      assert.equal(response.status, 409);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'EMAIL_TAKEN');
    });

    it('rejects an invalid body with 400 and per-field details', async () => {
      const response = await request('POST', '/users', {
        token: adminToken,
        body: { userId: 'ab', name: 'X', email: 'not-an-email', password: 'short' },
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'VALIDATION_ERROR');

      const fields = (body.error.details?.fields ?? []).map((issue) => issue.field).sort();
      assert.deepEqual(fields, ['department', 'email', 'name', 'password', 'role', 'userId']);
    });
  });

  describe('update', () => {
    it('updates the profile and persists the change', async () => {
      const created = await createUser({ userId: 'apiupdate01' });

      const response = await request('PATCH', `/users/${created.id}`, {
        token: adminToken,
        body: { name: 'Renamed Through API', department: Department.OPERATIONS },
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as SuccessBody<PublicUser>;
      assert.equal(body.data.name, 'Renamed Through API');
      assert.equal(body.data.department, Department.OPERATIONS);

      const raw = await fs.readFile(USERS_FILE, 'utf8');
      assert.ok(raw.includes('Renamed Through API'), 'the change reached the JSON file');
    });

    it('rejects an empty patch with 400', async () => {
      const created = await createUser({ userId: 'apinoop01' });

      const response = await request('PATCH', `/users/${created.id}`, {
        token: adminToken,
        body: {},
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });

    it('returns 404 for an unknown user id', async () => {
      const response = await request('PATCH', '/users/USR-404', {
        token: adminToken,
        body: { name: 'Nobody' },
      });

      assert.equal(response.status, 404);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'USER_NOT_FOUND');
    });
  });

  describe('deactivation', () => {
    it('deactivates an account, which then cannot sign in', async () => {
      const created = await createUser({ userId: 'apideactivate01' });

      const response = await request('PATCH', `/users/${created.id}/status`, {
        token: adminToken,
        body: { status: UserStatus.INACTIVE },
      });

      assert.equal(response.status, 200);
      assert.equal(
        ((await response.json()) as SuccessBody<PublicUser>).data.status,
        UserStatus.INACTIVE,
      );

      const blocked = await fetch(url('/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'apideactivate01',
          password: 'Str0ng@Pass',
          role: UserRole.GENERAL_USER,
        }),
      });

      assert.equal(blocked.status, 403);
      assert.equal(((await blocked.json()) as ErrorBody).error.code, 'ACCOUNT_INACTIVE');
    });

    it('refuses to let an administrator deactivate their own account', async () => {
      const response = await request('PATCH', '/users/USR-001/status', {
        token: adminToken,
        body: { status: UserStatus.INACTIVE },
      });

      assert.equal(response.status, 409);
      const body = (await response.json()) as ErrorBody;
      assert.equal(body.error.code, 'SELF_DEACTIVATION_NOT_ALLOWED');
    });
  });

  describe('delete', () => {
    it('deletes an account and removes it from the store', async () => {
      const created = await createUser({ userId: 'apidelete01' });

      const response = await request('DELETE', `/users/${created.id}`, { token: adminToken });

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as SuccessBody<PublicUser>).data.id, created.id);

      const raw = await fs.readFile(USERS_FILE, 'utf8');
      assert.ok(!raw.includes('apidelete01'), 'the user is gone from the JSON file');

      const afterDelete = await fetch(url('/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'apidelete01',
          password: 'Str0ng@Pass',
          role: UserRole.GENERAL_USER,
        }),
      });
      assert.equal(afterDelete.status, 401);
    });

    it('refuses to let an administrator delete their own account', async () => {
      const response = await request('DELETE', '/users/USR-001', { token: adminToken });

      assert.equal(response.status, 409);
      assert.equal(
        ((await response.json()) as ErrorBody).error.code,
        'SELF_DELETION_NOT_ALLOWED',
      );
    });

    it('returns 404 for an unknown user id', async () => {
      const response = await request('DELETE', '/users/USR-404', { token: adminToken });

      assert.equal(response.status, 404);
    });
  });
});
