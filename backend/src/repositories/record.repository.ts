import { config } from '../config/env.config';
import { ApiError } from '../utils/api-error';
import {
  RecordStatus,
  RiskLevel,
  VerificationType,
  type PaginatedRecords,
  type PaginationMeta,
  type RecordQuery,
  type VerificationRecord,
} from '../models';
import { JsonCollectionRepository } from './json.repository';

/**
 * A record to write. `id` is optional: seed data supplies one so repeated seeding
 * updates the same rows instead of appending duplicates, anything else gets the
 * next allocated key.
 */
export type NewRecordInput = Omit<VerificationRecord, 'id'> & { id?: string };

/** Outcome of a bulk write, reported by id. */
export interface RecordWriteOutcome {
  created: string[];
  updated: string[];
  skipped: string[];
}

/** Fields that free-text `search` looks through, in the order they are documented. */
const SEARCHABLE_FIELDS = ['candidateName', 'company', 'location', 'verificationType'] as const;

/**
 * Persistence for `backend/data/records.json`.
 *
 * This is the **only** module that reads or writes the records document; the
 * controller and the service above it never touch the filesystem. Beyond the
 * inherited `findAll`/`findById`, it exposes the query primitives the records API
 * needs - `findByUserId`, `count`, `filter` and `paginate` - all asynchronous.
 */
export class RecordRepository extends JsonCollectionRepository<VerificationRecord> {
  constructor(file: string = config.storage.recordsFile) {
    super({ file, label: 'records', idPrefix: 'REC' });
  }

  /** Validates one record read from disk. */
  protected parseEntry(raw: unknown, index: number): VerificationRecord {
    const entry = this.requireObject(raw, index);

    return {
      id: this.requireString(entry['id'], 'id', index),
      candidateName: this.requireString(entry['candidateName'], 'candidateName', index),
      verificationType: this.requireEnum(
        entry['verificationType'],
        'verificationType',
        VerificationType,
        index,
      ),
      status: this.requireEnum(entry['status'], 'status', RecordStatus, index),
      submittedDate: this.requireIsoDate(entry['submittedDate'], 'submittedDate', index),
      ...this.parseCompletedDate(entry['completedDate'], index),
      riskLevel: this.requireEnum(entry['riskLevel'], 'riskLevel', RiskLevel, index),
      assignedUserId: this.requireString(entry['assignedUserId'], 'assignedUserId', index),
      company: this.requireString(entry['company'], 'company', index),
      location: this.requireString(entry['location'], 'location', index),
      description: this.requireString(entry['description'], 'description', index),
    };
  }

  /** Records assigned to one user (`assignedUserId`, matched case insensitively). */
  async findByUserId(userId: string): Promise<VerificationRecord[]> {
    const needle = userId.trim().toLowerCase();
    return this.query((records) =>
      records.filter((record) => record.assignedUserId.toLowerCase() === needle),
    );
  }

  /** Number of records matching `criteria` (all records when omitted). */
  async count(criteria: RecordQuery = {}): Promise<number> {
    return this.query((records) => records.filter((record) => matches(record, criteria)).length);
  }

  /**
   * Records matching `criteria`.
   *
   * Each criterion is applied only when present; `assignedUserId` is how the
   * service restricts a general user to their own records, and `search` matches
   * case-insensitively across candidate name, company, location and type.
   */
  async filter(criteria: RecordQuery = {}): Promise<VerificationRecord[]> {
    return this.query((records) => records.filter((record) => matches(record, criteria)));
  }

  /**
   * One page of the records matching `criteria`, plus the pagination bookkeeping.
   *
   * Filtering happens before slicing, so `totalRecords` reflects the filtered set
   * - which is also the set the caller is allowed to see.
   */
  async paginate(criteria: RecordQuery, page: number, limit: number): Promise<PaginatedRecords> {
    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit >= 1 ? limit : 1;

    const matched = await this.filter(criteria);
    const totalRecords = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / safeLimit));
    const start = (safePage - 1) * safeLimit;

    const pagination: PaginationMeta = {
      page: safePage,
      limit: safeLimit,
      totalRecords,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    };

    return { items: matched.slice(start, start + safeLimit), pagination };
  }

  /**
   * Inserts or replaces records in one queued write.
   *
   * Entries carrying an `id` are matched on it: existing rows are updated when
   * `overwrite` is set and otherwise reported as skipped, so seeding can be run
   * repeatedly without duplicating data. Entries without an `id` are appended with
   * the next allocated key.
   */
  async upsertMany(
    inputs: readonly NewRecordInput[],
    options: { overwrite?: boolean } = {},
  ): Promise<RecordWriteOutcome> {
    return this.transact((records) => {
      const outcome: RecordWriteOutcome = { created: [], updated: [], skipped: [] };

      for (const input of inputs) {
        const { id: providedId, ...fields } = input;
        const index =
          providedId === undefined
            ? -1
            : records.findIndex((record) => record.id === providedId);

        if (index === -1) {
          // `id` first, so the generated document reads like the documented sample.
          const record: VerificationRecord = {
            id: providedId ?? this.allocateId(records),
            ...fields,
          };
          records.push(record);
          outcome.created.push(record.id);
          continue;
        }

        if (!options.overwrite) {
          outcome.skipped.push(providedId as string);
          continue;
        }

        records[index] = { id: providedId as string, ...fields };
        outcome.updated.push(providedId as string);
      }

      return outcome;
    });
  }

  /**
   * `completedDate` is absent until a record is completed, so unlike the other
   * dates it is validated only when present - and still as a real ISO date.
   */
  private parseCompletedDate(raw: unknown, index: number): { completedDate?: string } {
    const completedDate = this.optionalString(raw, 'completedDate', index);
    if (completedDate === undefined) {
      return {};
    }
    if (!Number.isFinite(Date.parse(completedDate))) {
      throw ApiError.internal(
        `The records data file contains an invalid entry at index ${index} (field "completedDate": expected an ISO-8601 date string).`,
        {
          code: 'STORAGE_INVALID_DATA',
          details: { file: this.location, index, field: 'completedDate', reason: 'expected an ISO-8601 date string' },
        },
      );
    }
    return { completedDate };
  }
}

/** Applies every supplied criterion to one record. */
function matches(record: VerificationRecord, criteria: RecordQuery): boolean {
  if (
    criteria.assignedUserId !== undefined &&
    record.assignedUserId.toLowerCase() !== criteria.assignedUserId.trim().toLowerCase()
  ) {
    return false;
  }

  if (criteria.status !== undefined && record.status !== criteria.status) {
    return false;
  }

  if (criteria.riskLevel !== undefined && record.riskLevel !== criteria.riskLevel) {
    return false;
  }

  if (
    criteria.verificationType !== undefined &&
    record.verificationType !== criteria.verificationType
  ) {
    return false;
  }

  if (criteria.search !== undefined) {
    const needle = criteria.search.trim().toLowerCase();
    if (needle.length > 0) {
      const haystack = SEARCHABLE_FIELDS.map((field) => record[field]).join(' ').toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
  }

  return true;
}

/** Shared instance bound to the configured records file. */
export const recordRepository = new RecordRepository();
