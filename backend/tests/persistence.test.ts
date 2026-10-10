import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { config } from '../src/config/env.config';
import {
  Department,
  RecordStatus,
  RiskLevel,
  UserRole,
  UserStatus,
  VerificationType,
  type User,
} from '../src/models';
import { RecordRepository, UserRepository } from '../src/repositories';
import { AuthService } from '../src/services/auth.service';
import { RecordService } from '../src/services/record.service';
import { SeedService } from '../src/services/seed.service';
import { UserService } from '../src/services/user.service';
import { verifyPassword } from '../src/utils/password';

const SANDBOX = path.join(config.storage.directory, 'persistence');

interface Stack {
  users: UserService;
  records: RecordService;
  seed: SeedService;
  auth: AuthService;
  userRepository: UserRepository;
  recordRepository: RecordRepository;
  usersFile: string;
  recordsFile: string;
}

/**
 * Builds a brand new set of services over a store of its own.
 *
 * Each test gets its own directory, so tests never depend on each other's writes.
 * Rebuilding the objects is also *exactly* what a restart does: every cache and
 * service instance dies with the process, and the next boot reads whatever the
 * previous one left on disk. Doing it in-process is what lets a single test assert
 * that data survives.
 */
function restart(name: string): Stack {
  const directory = path.join(SANDBOX, name);
  const usersFile = path.join(directory, 'users.json');
  const recordsFile = path.join(directory, 'records.json');

  const userRepository = new UserRepository(usersFile);
  const recordRepository = new RecordRepository(recordsFile);
  const users = new UserService(userRepository);

  return {
    users,
    records: new RecordService(recordRepository),
    seed: new SeedService(users, recordRepository, userRepository),
    auth: new AuthService(users),
    userRepository,
    recordRepository,
    usersFile,
    recordsFile,
  };
}

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}

const NEW_USER = {
  userId: 'newhire01',
  name: 'New Hire',
  email: 'new.hire@mploychek.local',
  password: 'Str0ng@Pass',
  role: UserRole.GENERAL_USER,
  department: Department.COMPLIANCE,
} as const;

/**
 * Verifies the promise behind the local JSON store: the generated documents have the
 * documented shape, and nothing is lost when the backend restarts.
 */
describe('Local JSON persistence', () => {
  before(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  after(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  describe('users.json', () => {
    it('is a JSON array of users with allocated ids, bcrypt digests and no plain text', async () => {
      const stack = restart('users-document');
      await stack.seed.resetDevelopmentData();

      const document = await readJsonFile(stack.usersFile);
      assert.ok(Array.isArray(document), 'the document is a top level array');
      assert.equal(document.length, 2);

      const [admin, general] = document as Array<Record<string, unknown>>;

      assert.equal(admin?.['id'], 'USR-001');
      assert.equal(admin?.['userId'], 'admin001');
      assert.equal(admin?.['name'], 'System Administrator');
      assert.equal(admin?.['email'], 'admin@mploychek.local');
      assert.equal(admin?.['role'], UserRole.ADMIN);
      assert.equal(admin?.['department'], 'Administration');
      assert.equal(admin?.['status'], UserStatus.ACTIVE);
      assert.equal(admin?.['createdAt'], '2026-10-01T10:00:00.000Z');

      assert.equal(general?.['id'], 'USR-002');
      assert.equal(general?.['userId'], 'user001');
      assert.equal(general?.['department'], 'Verification');

      for (const user of document as Array<Record<string, unknown>>) {
        assert.match(String(user['passwordHash']), /^\$2[aby]\$\d{2}\$/, 'bcrypt digest');
        assert.ok(!('password' in user), 'no plain text password field');
      }

      const raw = await fs.readFile(stack.usersFile, 'utf8');
      assert.ok(!raw.includes('Admin@123'), 'the admin password is not on disk');
      assert.ok(!raw.includes('User@123'), 'the user password is not on disk');
    });
  });

  describe('records.json', () => {
    it('holds realistic records covering every status, risk level and type', async () => {
      const stack = restart('records-document');
      await stack.seed.resetDevelopmentData();

      const document = await readJsonFile(stack.recordsFile);
      assert.ok(Array.isArray(document));
      assert.equal(document.length, 16);

      const records = document as Array<Record<string, unknown>>;
      assert.deepEqual(
        records.map((record) => record['id']),
        Array.from({ length: 16 }, (_value, index) => `REC-${String(index + 1).padStart(3, '0')}`),
      );

      const completed = records[0] as Record<string, unknown>;
      assert.equal(completed['status'], RecordStatus.COMPLETED);
      assert.equal(completed['verificationType'], VerificationType.EMPLOYMENT);
      assert.equal(completed['riskLevel'], RiskLevel.LOW);
      assert.equal(completed['assignedUserId'], 'USR-002');
      assert.equal(completed['company'], 'Tech Solutions Pvt Ltd');
      assert.equal(completed['location'], 'Chennai');
      assert.equal(completed['submittedDate'], '2026-09-15T10:30:00.000Z');
      assert.equal(completed['completedDate'], '2026-09-17T15:30:00.000Z');

      const failed = records.find((record) => record['id'] === 'REC-005') as Record<string, unknown>;
      assert.equal(failed['status'], RecordStatus.FAILED);
      assert.equal(failed['riskLevel'], RiskLevel.HIGH);
      assert.equal(failed['assignedUserId'], 'USR-002');

      const pending = records.find((record) => record['id'] === 'REC-009') as Record<string, unknown>;
      assert.equal(pending['status'], RecordStatus.PENDING);
      assert.ok(!('completedDate' in pending), 'a record that has not completed has no completedDate');
    });
  });

  describe('after a restart', () => {
    it('login still works against the persisted accounts', async () => {
      await restart('login').seed.resetDevelopmentData();

      const second = restart('login');
      const session = await second.auth.login({
        userId: 'admin001',
        password: 'Admin@123',
        role: UserRole.ADMIN,
      });

      assert.equal(session.user.id, 'USR-001');
      assert.equal(session.user.userId, 'admin001');
      assert.ok(session.token.length > 0);
    });

    it('a created user is still there and can authenticate', async () => {
      const created = await restart('create').users.create({ ...NEW_USER });

      const second = restart('create');
      const found = await second.users.findByUserId(NEW_USER.userId);

      assert.ok(found !== undefined, 'the created user survived');
      assert.equal(found.id, created.id);
      assert.ok(await verifyPassword(NEW_USER.password, found.passwordHash));

      const session = await second.auth.login({
        userId: NEW_USER.userId,
        password: NEW_USER.password,
        role: UserRole.GENERAL_USER,
      });
      assert.equal(session.user.department, Department.COMPLIANCE);
    });

    it('an updated profile is still there', async () => {
      const first = restart('update');
      const created = await first.users.create({ ...NEW_USER });

      await first.users.update(created.id, {
        name: 'Renamed Person',
        department: Department.OPERATIONS,
      });

      const found = await restart('update').users.findById(created.id);

      assert.equal(found?.name, 'Renamed Person');
      assert.equal(found?.department, Department.OPERATIONS);
    });

    it('a deactivation is still there and blocks login', async () => {
      const first = restart('status');
      await first.seed.resetDevelopmentData();

      const actor = (await first.users.findByUserId('admin001')) as User;
      const created = await first.users.create({ ...NEW_USER });

      await first.users.updateStatus(created.id, UserStatus.INACTIVE, actor);

      const second = restart('status');
      assert.equal((await second.users.findById(created.id))?.status, UserStatus.INACTIVE);

      await assert.rejects(
        second.auth.login({
          userId: NEW_USER.userId,
          password: NEW_USER.password,
          role: UserRole.GENERAL_USER,
        }),
        (error: { statusCode?: number; code?: string }) =>
          error.statusCode === 403 && error.code === 'ACCOUNT_INACTIVE',
      );
    });

    it('a deletion is still there', async () => {
      const first = restart('delete');
      await first.seed.resetDevelopmentData();

      const actor = (await first.users.findByUserId('admin001')) as User;
      const created = await first.users.create({ ...NEW_USER });

      await first.users.delete(created.id, actor);

      const second = restart('delete');
      assert.equal(await second.users.findById(created.id), undefined);
      assert.equal(await second.users.findByUserId(NEW_USER.userId), undefined);
    });

    it('records written to disk are still queryable by assignment and by id', async () => {
      await restart('records-query').seed.resetDevelopmentData();

      const second = restart('records-query');

      const owned = await second.recordRepository.findByUserId('USR-002');
      assert.equal(owned.length, 10);
      assert.ok(owned.every((record) => record.assignedUserId === 'USR-002'));

      assert.equal((await second.recordRepository.findAll()).length, 16);
      assert.equal((await second.recordRepository.findById('REC-011'))?.assignedUserId, 'USR-001');
    });

    it('booting again neither erases nor duplicates existing data', async () => {
      const first = restart('boot');
      await first.seed.resetDevelopmentData();

      const custom = await first.users.create({ ...NEW_USER });
      await first.recordRepository.upsertMany([
        {
          id: 'REC-900',
          candidateName: 'Custom Record',
          verificationType: VerificationType.IDENTITY,
          status: RecordStatus.PENDING,
          submittedDate: '2026-10-05T10:00:00.000Z',
          riskLevel: RiskLevel.LOW,
          assignedUserId: 'USR-002',
          company: 'Custom Co',
          location: 'Remote',
          description: 'Created by the test to prove custom data survives a restart.',
        },
      ]);

      // Second boot: the documented behaviour is "create what is missing".
      const second = restart('boot');
      const rerun = await second.seed.ensureDevelopmentData();

      assert.deepEqual(rerun?.users.created, [], 'no user was recreated');
      assert.deepEqual(rerun?.records.created, [], 'no record was duplicated');
      assert.equal(
        (await second.userRepository.findAll()).length,
        3,
        'seeded and custom users coexist',
      );
      assert.equal((await second.recordRepository.findAll()).length, 17, 'seeded and custom records coexist');
      assert.ok((await second.users.findById(custom.id)) !== undefined);
    });
  });
});
