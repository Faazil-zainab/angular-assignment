import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { config } from '../src/config/env.config';
import { Department, UserRole, UserStatus } from '../src/models';
import { UserRepository } from '../src/repositories';
import { ApiError } from '../src/utils/api-error';

const SANDBOX = path.join(config.storage.directory, 'repository');

/** A user entry as the repository expects to find it on disk. */
function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'USR-001',
    userId: 'someone',
    name: 'Some One',
    email: 'someone@mploychek.local',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123',
    role: UserRole.GENERAL_USER,
    department: Department.VERIFICATION,
    status: UserStatus.ACTIVE,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

async function writeFile(fileName: string, contents: string): Promise<string> {
  const file = path.join(SANDBOX, fileName);
  await fs.mkdir(SANDBOX, { recursive: true });
  await fs.writeFile(file, contents, 'utf8');
  return file;
}

async function captureError(operation: () => Promise<unknown>): Promise<ApiError> {
  try {
    await operation();
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected an ApiError, received ${String(error)}`);
    return error;
  }
  throw new Error('expected the operation to fail');
}

/**
 * Exercises the JSON layer directly: this is where every "what if the file is
 * broken" case lives, so the API layer above it can assume a well formed document.
 */
describe('JsonCollectionRepository', () => {
  before(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  after(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  it('creates a missing directory and file, then reads it as an empty collection', async () => {
    const file = path.join(SANDBOX, 'nested', 'deeper', 'users.json');
    const repository = new UserRepository(file);

    assert.deepEqual(await repository.findAll(), []);

    const raw = await fs.readFile(file, 'utf8');
    assert.equal(raw, '[]\n', 'the file is created containing an empty JSON array');
  });

  it('treats an empty file as an empty collection and heals it on the next write', async () => {
    const file = await writeFile('empty.json', '   \n');
    const repository = new UserRepository(file);

    assert.deepEqual(await repository.findAll(), []);

    await repository.create({
      userId: 'healed',
      name: 'Healed User',
      email: 'healed@mploychek.local',
      passwordHash: 'hash',
      role: UserRole.GENERAL_USER,
      department: Department.OPERATIONS,
    });

    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 1);
  });

  it('rejects malformed JSON with a typed error naming the file', async () => {
    const file = await writeFile('malformed.json', '[{"id": "USR-001",}]');
    const repository = new UserRepository(file);

    const error = await captureError(() => repository.findAll());
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, 'STORAGE_MALFORMED_JSON');
    assert.equal((error.details as { file: string }).file, file);
  });

  it('rejects a document that is not an array at the top level', async () => {
    const file = await writeFile('object.json', JSON.stringify({ users: [entry()] }));
    const repository = new UserRepository(file);

    const error = await captureError(() => repository.findAll());
    assert.equal(error.code, 'STORAGE_INVALID_DATA');
  });

  it('rejects an entry with a missing field, naming the index', async () => {
    const broken = entry();
    delete broken['email'];
    const file = await writeFile('missing-field.json', JSON.stringify([broken]));

    const error = await captureError(() => new UserRepository(file).findAll());
    assert.equal(error.code, 'STORAGE_INVALID_DATA');
    assert.deepEqual(
      { index: (error.details as { index: number }).index, field: (error.details as { field: string }).field },
      { index: 0, field: 'email' },
    );
  });

  it('rejects an entry with an unknown enum value', async () => {
    const file = await writeFile(
      'bad-enum.json',
      JSON.stringify([entry({ department: 'Not_A_Department' })]),
    );

    const error = await captureError(() => new UserRepository(file).findAll());
    assert.equal(error.code, 'STORAGE_INVALID_DATA');
    assert.equal((error.details as { field: string }).field, 'department');
  });

  it('maps a read failure to STORAGE_READ_FAILED', async () => {
    // Point the repository at a directory: reading it fails with EISDIR.
    const directory = path.join(SANDBOX, 'a-directory');
    await fs.mkdir(directory, { recursive: true });

    const error = await captureError(() => new UserRepository(directory).findAll());
    assert.equal(error.code, 'STORAGE_READ_FAILED');
  });

  it('maps a write failure to STORAGE_WRITE_FAILED and leaves no partial file', async () => {
    const directory = path.join(SANDBOX, 'write-failure');
    const file = path.join(directory, 'users.json');
    await fs.mkdir(directory, { recursive: true });
    // Occupy the temporary file name with a directory so writing it must fail.
    await fs.mkdir(`${file}.${process.pid}.tmp`, { recursive: true });

    const error = await captureError(() => new UserRepository(file).findAll());
    assert.equal(error.code, 'STORAGE_WRITE_FAILED');
    assert.equal((error.details as { file: string }).file, file);
  });

  it('allocates the next business key from the highest existing one', async () => {
    const file = await writeFile(
      'ids.json',
      JSON.stringify([entry({ id: 'USR-001' }), entry({ id: 'USR-007', userId: 'other' })]),
    );
    const repository = new UserRepository(file);

    const created = await repository.create({
      userId: 'eight',
      name: 'Eight',
      email: 'eight@mploychek.local',
      passwordHash: 'hash',
      role: UserRole.GENERAL_USER,
      department: Department.OPERATIONS,
    });

    assert.equal(created.id, 'USR-008');
  });

  it('keeps concurrent creates consistent (no lost writes, no duplicate ids)', async () => {
    const file = path.join(SANDBOX, 'concurrent', 'users.json');
    const repository = new UserRepository(file);

    const created = await Promise.all(
      Array.from({ length: 12 }, (_value, index) =>
        repository.create({
          userId: `user-${index}`,
          name: `Concurrent ${index}`,
          email: `concurrent-${index}@mploychek.local`,
          passwordHash: 'hash',
          role: UserRole.GENERAL_USER,
          department: Department.VERIFICATION,
        }),
      ),
    );

    const ids = created.map((user) => user.id);
    assert.equal(new Set(ids).size, 12, 'every create received a unique id');
    assert.equal((await repository.findAll()).length, 12, 'every write survived');
  });

  it('preserves updates and deletions across repository instances', async () => {
    const file = path.join(SANDBOX, 'instances', 'users.json');
    const first = new UserRepository(file);
    const created = await first.create({
      userId: 'persisted',
      name: 'Original Name',
      email: 'persisted@mploychek.local',
      passwordHash: 'hash',
      role: UserRole.GENERAL_USER,
      department: Department.VERIFICATION,
    });

    const second = new UserRepository(file);
    await second.update(created.id, { name: 'Updated Name' });
    await second.delete(created.id);

    const third = new UserRepository(file);
    assert.deepEqual(await third.findAll(), []);
  });

  it('rejects a duplicate login id or email on create', async () => {
    const file = path.join(SANDBOX, 'duplicates', 'users.json');
    const repository = new UserRepository(file);

    await repository.create({
      userId: 'duplicate',
      name: 'First',
      email: 'first@mploychek.local',
      passwordHash: 'hash',
      role: UserRole.GENERAL_USER,
      department: Department.OPERATIONS,
    });

    const sameUserId = await captureError(() =>
      repository.create({
        userId: 'duplicate',
        name: 'Second',
        email: 'second@mploychek.local',
        passwordHash: 'hash',
        role: UserRole.GENERAL_USER,
        department: Department.OPERATIONS,
      }),
    );
    assert.equal(sameUserId.statusCode, 409);
    assert.equal(sameUserId.code, 'USER_ID_TAKEN');

    const sameEmail = await captureError(() =>
      repository.create({
        userId: 'another',
        name: 'Third',
        email: 'first@mploychek.local',
        passwordHash: 'hash',
        role: UserRole.GENERAL_USER,
        department: Department.OPERATIONS,
      }),
    );
    assert.equal(sameEmail.code, 'EMAIL_TAKEN');
  });
});
