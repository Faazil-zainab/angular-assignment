import fs from 'node:fs/promises';
import path from 'node:path';

import { ApiError } from '../utils/api-error';
import { AsyncQueue } from '../utils/async-queue';
import { type Logger, logger } from '../utils/logger';

/** Every stored entity has a business key. */
export interface IdentifiedEntity {
  id: string;
}

export interface JsonRepositoryOptions {
  /** Absolute path of the JSON document this repository owns. */
  file: string;
  /** Human readable collection name, used in logs and error details. */
  label: string;
  /** Business key prefix, e.g. `USR` for `USR-001`. */
  idPrefix: string;
}

/**
 * Base class for a repository backed by a single JSON document holding an array of
 * entities.
 *
 * Responsibilities (and the reason services never touch the filesystem):
 *
 * - **All JSON parsing and stringifying happens here** and nowhere else.
 * - **Safe file handling**: missing directory/file, empty file, malformed JSON,
 *   structurally invalid entries, read failures and write failures each surface as
 *   a typed `ApiError` with the file path in `details`.
 * - **Concurrency**: every operation runs through one `AsyncQueue`, so a
 *   read-modify-write cycle cannot interleave with another and lose a write.
 * - **Atomic writes**: content goes to a process-unique temporary file that is then
 *   renamed over the target, so a crash mid-write can never leave a half-written
 *   document behind (and a reader never observes a partial file).
 * - **Idempotent bootstrap**: the directory is created and an empty collection file
 *   is written on first use.
 */
export abstract class JsonCollectionRepository<TEntity extends IdentifiedEntity> {
  private readonly queue = new AsyncQueue();
  private readonly filePath: string;
  private readonly label: string;
  private readonly idPrefix: string;
  private readonly log: Logger;
  private initialisation: Promise<void> | undefined;

  protected constructor(options: JsonRepositoryOptions) {
    this.filePath = options.file;
    this.label = options.label;
    this.idPrefix = options.idPrefix;
    this.log = logger.child(options.label);
  }

  /** Absolute path of the backing document. */
  get location(): string {
    return this.filePath;
  }

  /**
   * Validates and maps one raw entry from the file.
   *
   * Implementations must throw (use the `require*` helpers) rather than silently
   * skip entries: quietly dropping a user or a record would hide data corruption.
   */
  protected abstract parseEntry(raw: unknown, index: number): TEntity;

  /** Reads the whole collection. Serialised with other operations. */
  async findAll(): Promise<TEntity[]> {
    return this.queue.run(async () => {
      await this.ready();
      return this.readDocument();
    });
  }

  async findById(id: string): Promise<TEntity | undefined> {
    return this.query((entities) => entities.find((entity) => entity.id === id));
  }

  /** Serialised read-only access for subclass finders. */
  protected query<TResult>(selector: (entities: TEntity[]) => TResult): Promise<TResult> {
    return this.queue.run(async () => {
      await this.ready();
      return selector(await this.readDocument());
    });
  }

  /**
   * Serialised read-modify-write cycle.
   *
   * `mutator` receives the live array, mutates it, and its return value is handed
   * back to the caller. The modified array is persisted exactly once, atomically.
   * Running the whole cycle inside the queue is what makes concurrent creates safe.
   */
  protected transact<TResult>(
    mutator: (entities: TEntity[]) => TResult | Promise<TResult>,
  ): Promise<TResult> {
    return this.queue.run(async () => {
      await this.ready();
      const entities = await this.readDocument();
      const result = await mutator(entities);
      await this.persist(entities);
      return result;
    });
  }

  /** Next business key, derived from the highest existing one (`USR-007` -> `USR-008`). */
  protected allocateId(entities: readonly TEntity[]): string {
    const pattern = new RegExp(`^${this.idPrefix}-(\\d+)$`);
    let highest = 0;

    for (const entity of entities) {
      const match = pattern.exec(entity.id);
      if (match?.[1] !== undefined) {
        highest = Math.max(highest, Number(match[1]));
      }
    }

    return `${this.idPrefix}-${String(highest + 1).padStart(3, '0')}`;
  }

  protected now(): string {
    return new Date().toISOString();
  }

  // --- Validation helpers used by parseEntry ---------------------------------

  protected requireObject(raw: unknown, index: number): Record<string, unknown> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw this.invalidEntry(index, 'entry', 'expected a JSON object');
    }
    return raw as Record<string, unknown>;
  }

  protected requireString(
    value: unknown,
    field: string,
    index: number,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw this.invalidEntry(index, field, 'expected a non-empty string');
    }
    return value;
  }

  protected optionalString(value: unknown, field: string, index: number): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return this.requireString(value, field, index);
  }

  protected requireIsoDate(value: unknown, field: string, index: number): string {
    const text = this.requireString(value, field, index);
    if (!Number.isFinite(Date.parse(text))) {
      throw this.invalidEntry(index, field, 'expected an ISO-8601 date string');
    }
    return text;
  }

  protected requireArray(value: unknown, field: string, index: number): unknown[] {
    if (!Array.isArray(value)) {
      throw this.invalidEntry(index, field, 'expected an array');
    }
    return value;
  }

  protected requireEnum<TValue extends string>(
    value: unknown,
    field: string,
    allowed: Record<string, TValue>,
    index: number,
  ): TValue {
    const options = Object.values(allowed) as readonly string[];
    if (typeof value !== 'string' || !options.includes(value)) {
      throw this.invalidEntry(index, field, `expected one of: ${options.join(', ')}`);
    }
    return value as TValue;
  }

  private invalidEntry(index: number, field: string, reason: string): ApiError {
    return ApiError.internal(
      `The ${this.label} data file contains an invalid entry at index ${index} (field "${field}": ${reason}).`,
      {
        code: 'STORAGE_INVALID_DATA',
        details: { file: this.filePath, index, field, reason },
      },
    );
  }

  // --- Filesystem ------------------------------------------------------------

  /** Creates the data directory and an empty collection file when missing. */
  private ready(): Promise<void> {
    this.initialisation ??= this.initialise().catch((error: unknown) => {
      // Allow a later call to retry: a transient failure must not be memoised.
      this.initialisation = undefined;
      throw error;
    });

    return this.initialisation;
  }

  private async initialise(): Promise<void> {
    await this.ensureDirectory();

    try {
      await fs.access(this.filePath);
    } catch {
      this.log.warn('data file is missing, creating an empty collection', { file: this.filePath });
      await this.persist([]);
    }
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    } catch (error) {
      throw ApiError.internal('Unable to create the data directory.', {
        code: 'STORAGE_WRITE_FAILED',
        details: { file: this.filePath },
        cause: error,
      });
    }
  }

  /** Reads and validates the document. Always called from inside the queue. */
  private async readDocument(): Promise<TEntity[]> {
    let raw: string;

    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === 'ENOENT') {
        // Deleted externally between operations - behave like an empty collection
        // and let the next write recreate it.
        this.log.warn('data file disappeared, treating it as empty', { file: this.filePath });
        return [];
      }

      throw ApiError.internal(`Unable to read the ${this.label} data file.`, {
        code: 'STORAGE_READ_FAILED',
        details: { file: this.filePath, reason: code ?? 'unknown' },
        cause: error,
      });
    }

    if (raw.trim().length === 0) {
      this.log.warn('data file is empty, treating it as an empty collection', {
        file: this.filePath,
      });
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw ApiError.internal(`The ${this.label} data file contains malformed JSON.`, {
        code: 'STORAGE_MALFORMED_JSON',
        details: { file: this.filePath, reason: (error as Error).message },
        cause: error,
      });
    }

    if (!Array.isArray(parsed)) {
      throw ApiError.internal(
        `The ${this.label} data file must contain a JSON array at the top level.`,
        {
          code: 'STORAGE_INVALID_DATA',
          details: { file: this.filePath, received: typeof parsed },
        },
      );
    }

    return parsed.map((entry, index) => this.parseEntry(entry, index));
  }

  /** Writes the collection atomically. Always called from inside the queue. */
  private async persist(entities: readonly TEntity[]): Promise<void> {
    const temporaryFile = `${this.filePath}.${process.pid}.tmp`;
    const payload = `${JSON.stringify(entities, null, 2)}\n`;

    try {
      await this.ensureDirectory();
      await fs.writeFile(temporaryFile, payload, 'utf8');
      // Rename is atomic on the same filesystem: readers see either the old or the
      // new complete document, never a partial one.
      await fs.rename(temporaryFile, this.filePath);
    } catch (error) {
      await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
      throw ApiError.internal(`Unable to write the ${this.label} data file.`, {
        code: 'STORAGE_WRITE_FAILED',
        details: { file: this.filePath },
        cause: error,
      });
    }
  }
}
