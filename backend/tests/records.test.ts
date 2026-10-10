import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app';
import { config } from '../src/config/env.config';
import {
  RecordStatus,
  RiskLevel,
  UserRole,
  VerificationType,
  type PaginationMeta,
  type VerificationRecord,
} from '../src/models';
import { seedService } from '../src/services/seed.service';

interface ListBody {
  success: true;
  data: VerificationRecord[];
  pagination: PaginationMeta;
  meta: { role: string; delay: number; requestId: string; timestamp: string };
}

interface ItemBody {
  success: true;
  data: VerificationRecord;
  meta: { role: string; delay: number };
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

/**
 * The records API: role based access control, filtering, search, pagination and
 * the configurable (and validated) asynchronous delay.
 *
 * The seeded store has 16 records - 10 assigned to the general user (`USR-002`)
 * and 6 to the administrator (`USR-001`).
 */
describe('Records API', () => {
  let server: Server;
  let baseUrl = '';
  let adminToken = '';
  let generalToken = '';

  const url = (path: string): string => `${baseUrl}${config.apiPrefix}${path}`;

  const get = (path: string, token?: string): Promise<Response> =>
    fetch(url(path), {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  const errorOf = async (response: Response): Promise<ErrorBody> => {
    assert.equal(response.status >= 400, true, `expected an error status, got ${response.status}`);
    return (await response.json()) as ErrorBody;
  };

  const listOf = async (path: string, token: string): Promise<ListBody> => {
    const response = await get(path, token);

    if (response.status !== 200) {
      assert.fail(`GET ${path} failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as ListBody;
  };

  const login = async (userId: string, password: string, role: UserRole): Promise<string> => {
    const response = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, password, role }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { token: string } };
    return body.data.token;
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

  // --- Authentication --------------------------------------------------------

  describe('Authentication', () => {
    it('rejects a request with no token (401)', async () => {
      const response = await get('/records');
      assert.equal(response.status, 401);
      assert.equal((await errorOf(response)).error.code, 'TOKEN_MISSING');
    });

    it('rejects an invalid token (401)', async () => {
      const response = await get('/records', 'not-a-real-token');
      assert.equal(response.status, 401);
      assert.equal((await errorOf(response)).error.code, 'INVALID_TOKEN');
    });

    it('rejects an invalid token on the by-id endpoint (401)', async () => {
      const response = await get('/records/REC-001', 'garbage.token.value');
      assert.equal(response.status, 401);
    });
  });

  // --- Role based access control ---------------------------------------------

  describe('GET /api/records (role scope)', () => {
    it('returns every record to an administrator', async () => {
      const body = await listOf('/records?limit=100', adminToken);

      assert.equal(body.meta.role, UserRole.ADMIN);
      assert.equal(body.pagination.totalRecords, 16);
      assert.equal(body.data.length, 16);
      assert.deepEqual(body.data.map((record) => record.id), [
        'REC-001', 'REC-002', 'REC-003', 'REC-004', 'REC-005', 'REC-006', 'REC-007', 'REC-008',
        'REC-009', 'REC-010', 'REC-011', 'REC-012', 'REC-013', 'REC-014', 'REC-015', 'REC-016',
      ]);
    });

    it('returns only the assigned records to a general user', async () => {
      const body = await listOf('/records?limit=100', generalToken);

      assert.equal(body.meta.role, UserRole.GENERAL_USER);
      assert.equal(body.pagination.totalRecords, 10);
      assert.equal(body.data.length, 10);
      assert.ok(body.data.every((record) => record.assignedUserId === 'USR-002'));
      assert.ok(!body.data.some((record) => record.id === 'REC-011'));
    });

    it('ignores a userId query parameter (access comes from the token only)', async () => {
      const body = await listOf('/records?limit=100&userId=USR-001', generalToken);

      assert.equal(body.pagination.totalRecords, 10, 'the query parameter cannot widen access');
      assert.ok(body.data.every((record) => record.assignedUserId === 'USR-002'));
    });
  });

  describe('GET /api/records/:id (role scope)', () => {
    it('serves a record assigned to the caller (200)', async () => {
      const response = await get('/records/REC-001', generalToken);

      assert.equal(response.status, 200);
      const body = (await response.json()) as ItemBody;
      assert.equal(body.data.id, 'REC-001');
      assert.equal(body.data.candidateName, 'Arun Kumar');
      assert.equal(body.data.status, RecordStatus.COMPLETED);
      assert.equal(body.meta.role, UserRole.GENERAL_USER);
    });

    it("returns 403 for another user's record", async () => {
      const response = await get('/records/REC-011', generalToken);

      assert.equal(response.status, 403);
      assert.equal((await errorOf(response)).error.code, 'RECORD_FORBIDDEN');
    });

    it('serves any record to an administrator (200)', async () => {
      const response = await get('/records/REC-011', adminToken);

      assert.equal(response.status, 200);
      const body = (await response.json()) as ItemBody;
      assert.equal(body.data.id, 'REC-011');
      assert.equal(body.data.assignedUserId, 'USR-001');
      assert.equal(body.meta.role, UserRole.ADMIN);
    });

    it('returns 404 for an unknown record id', async () => {
      const response = await get('/records/REC-999', adminToken);

      assert.equal(response.status, 404);
      assert.equal((await errorOf(response)).error.code, 'RECORD_NOT_FOUND');
    });
  });

  // --- Filtering and search --------------------------------------------------

  describe('Filtering and search', () => {
    it('filters by status', async () => {
      const body = await listOf(`/records?status=${RecordStatus.COMPLETED}&limit=100`, adminToken);

      assert.equal(body.pagination.totalRecords, 7);
      assert.ok(body.data.every((record) => record.status === RecordStatus.COMPLETED));
    });

    it('filters by risk level', async () => {
      const body = await listOf(`/records?riskLevel=${RiskLevel.HIGH}&limit=100`, adminToken);

      assert.equal(body.pagination.totalRecords, 4);
      assert.ok(body.data.every((record) => record.riskLevel === RiskLevel.HIGH));
    });

    it('filters by verification type', async () => {
      const body = await listOf(
        `/records?verificationType=${VerificationType.EMPLOYMENT}&limit=100`,
        adminToken,
      );

      assert.equal(body.pagination.totalRecords, 5);
      assert.ok(
        body.data.every((record) => record.verificationType === VerificationType.EMPLOYMENT),
      );
    });

    it('searches candidate names case insensitively', async () => {
      const body = await listOf('/records?search=arun&limit=100', adminToken);

      assert.equal(body.pagination.totalRecords, 1);
      assert.equal(body.data[0]?.id, 'REC-001');
      assert.equal(body.data[0]?.candidateName, 'Arun Kumar');
    });

    it('searches company names case insensitively', async () => {
      const body = await listOf('/records?search=tech&limit=100', adminToken);

      assert.equal(body.pagination.totalRecords, 4);
      assert.ok(body.data.every((record) => /tech/i.test(record.company)));
    });

    it('combines filters with search', async () => {
      const body = await listOf(
        '/records?search=tech&status=COMPLETED&limit=100',
        adminToken,
      );

      assert.ok(body.data.length > 0);
      assert.ok(
        body.data.every(
          (record) => record.status === RecordStatus.COMPLETED && /tech/i.test(record.company),
        ),
      );
    });

    it('rejects an unknown status value (400)', async () => {
      const response = await get('/records?status=NOT_A_STATUS', adminToken);
      assert.equal(response.status, 400);
      assert.equal((await errorOf(response)).error.code, 'VALIDATION_ERROR');
    });
  });

  // --- Pagination ------------------------------------------------------------

  describe('Pagination', () => {
    it('returns the first page with correct bookkeeping', async () => {
      const body = await listOf('/records?page=1&limit=5', adminToken);

      assert.equal(body.data.length, 5);
      assert.deepEqual(body.pagination, {
        page: 1,
        limit: 5,
        totalRecords: 16,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('returns a later page that does not overlap the first', async () => {
      const first = await listOf('/records?page=1&limit=5', adminToken);
      const second = await listOf('/records?page=2&limit=5', adminToken);

      assert.equal(second.pagination.page, 2);
      assert.equal(second.pagination.hasPreviousPage, true);
      assert.equal(second.pagination.hasNextPage, true);
      assert.equal(second.data.length, 5);

      const firstIds = new Set(first.data.map((record) => record.id));
      assert.ok(second.data.every((record) => !firstIds.has(record.id)), 'pages do not overlap');
    });

    it('marks the last page as having no next page', async () => {
      const body = await listOf('/records?page=2&limit=10', adminToken);

      assert.equal(body.data.length, 6);
      assert.equal(body.pagination.hasNextPage, false);
      assert.equal(body.pagination.hasPreviousPage, true);
    });

    it('paginates within the general user scope', async () => {
      const body = await listOf('/records?page=2&limit=5', generalToken);

      assert.equal(body.pagination.totalRecords, 10);
      assert.equal(body.pagination.totalPages, 2);
      assert.equal(body.data.length, 5);
      assert.ok(body.data.every((record) => record.assignedUserId === 'USR-002'));
    });

    it('rejects an invalid page (400)', async () => {
      const response = await get('/records?page=abc', adminToken);
      assert.equal(response.status, 400);
      assert.equal((await errorOf(response)).error.code, 'VALIDATION_ERROR');
    });

    it('rejects a negative limit (400)', async () => {
      const response = await get('/records?limit=-1', adminToken);
      assert.equal(response.status, 400);
    });

    it('rejects an absurd limit (400)', async () => {
      const response = await get('/records?limit=100000', adminToken);
      assert.equal(response.status, 400);
    });
  });

  // --- Configurable asynchronous delay ---------------------------------------

  describe('Configurable asynchronous delay', () => {
    const wait = async (ms: number): Promise<{ elapsed: number; body: ListBody }> => {
      const startedAt = Date.now();
      const response = await get(`/records?delay=${ms}&limit=1`, generalToken);
      const elapsed = Date.now() - startedAt;

      assert.equal(response.status, 200, `delay=${ms} should succeed`);
      return { elapsed, body: (await response.json()) as ListBody };
    };

    it('applies no delay for delay=0', async () => {
      const { body } = await wait(0);
      assert.equal(body.meta.delay, 0);
    });

    it('applies ~1 second for delay=1000', async () => {
      const { elapsed, body } = await wait(1000);

      assert.equal(body.meta.delay, 1000);
      assert.ok(elapsed >= 950, `expected >= ~1000ms, measured ${elapsed}ms`);
    });

    it('applies ~3 seconds for delay=3000', async () => {
      const { elapsed, body } = await wait(3000);

      assert.equal(body.meta.delay, 3000);
      assert.ok(elapsed >= 2950, `expected >= ~3000ms, measured ${elapsed}ms`);
    });

    it('applies ~5 seconds for delay=5000', async () => {
      const { elapsed, body } = await wait(5000);

      assert.equal(body.meta.delay, 5000);
      assert.ok(elapsed >= 4950, `expected >= ~5000ms, measured ${elapsed}ms`);
    });

    it('does not block the event loop while delaying', async () => {
      // Kick off a slow request and, while it waits, confirm another request is
      // served promptly. A blocking `sleep` would hold the second one behind the first.
      const slow = get('/records?delay=1500&limit=1', generalToken);
      const fastStartedAt = Date.now();
      const fast = await get('/records?limit=1', generalToken);
      const fastElapsed = Date.now() - fastStartedAt;

      assert.equal(fast.status, 200);
      assert.ok(fastElapsed < 1000, `a second request should not be blocked, measured ${fastElapsed}ms`);

      assert.equal((await slow).status, 200);
    });

    it('rejects delay=-1 (400)', async () => {
      const response = await get('/records?delay=-1', generalToken);

      assert.equal(response.status, 400);
      const body = await errorOf(response);
      assert.equal(body.error.code, 'INVALID_DELAY');
      assert.equal(body.error.message, 'Delay must be between 0 and 10000 milliseconds');
    });

    it('rejects delay=abc (400)', async () => {
      const response = await get('/records?delay=abc', generalToken);

      assert.equal(response.status, 400);
      assert.equal((await errorOf(response)).error.code, 'INVALID_DELAY');
    });

    it('rejects delay=999999 (400)', async () => {
      const response = await get('/records?delay=999999', generalToken);

      assert.equal(response.status, 400);
      assert.equal((await errorOf(response)).error.code, 'INVALID_DELAY');
    });
  });
});
