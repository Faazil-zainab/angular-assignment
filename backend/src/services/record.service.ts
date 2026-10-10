import {
  UserRole,
  type PaginatedRecords,
  type RecordQuery,
  type User,
  type VerificationRecord,
} from '../models';
import { recordRepository, type RecordRepository } from '../repositories';
import { ApiError } from '../utils/api-error';
import type { RecordListQuery } from '../validation';

/**
 * Business logic for reading background verification records.
 *
 * Role-based access control lives here - not in the controller and never in the
 * client - because it is a business rule about *which rows exist for this caller*:
 *
 * - a `GENERAL_USER` may only ever see records whose `assignedUserId` equals their
 *   own `id`;
 * - an `ADMIN` may see every record.
 *
 * The caller's identity always comes from the verified JWT (threaded through as
 * `user`); a `userId` in the query string is ignored, so it cannot be used to widen
 * access.
 */
export class RecordService {
  constructor(private readonly repository: RecordRepository = recordRepository) {}

  /**
   * One page of the records the caller is allowed to see, after applying their
   * optional `status` / `riskLevel` / `verificationType` / `search` filters.
   */
  async getRecords(user: User, query: RecordListQuery): Promise<PaginatedRecords> {
    const criteria: RecordQuery = {
      ...this.accessScope(user),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.riskLevel === undefined ? {} : { riskLevel: query.riskLevel }),
      ...(query.verificationType === undefined
        ? {}
        : { verificationType: query.verificationType }),
      ...(query.search === undefined ? {} : { search: query.search }),
    };

    return this.repository.paginate(criteria, query.page, query.limit);
  }

  /**
   * One record, subject to the same ownership rule.
   *
   * 404 when no such record exists; 403 when it exists but belongs to somebody
   * else. The two are kept distinct because the assessment specifies them
   * explicitly.
   */
  async getRecordById(id: string, user: User): Promise<VerificationRecord> {
    const record = await this.repository.findById(id);

    if (record === undefined) {
      throw ApiError.notFound(`No record exists with id "${id}".`, {
        code: 'RECORD_NOT_FOUND',
        details: { id },
      });
    }

    if (!this.canAccess(record, user)) {
      throw ApiError.forbidden(`You are not authorized to access record "${id}".`, {
        code: 'RECORD_FORBIDDEN',
        details: { id },
      });
    }

    return record;
  }

  /** The extra criteria that restrict a general user to their own records. */
  private accessScope(user: User): RecordQuery {
    return user.role === UserRole.ADMIN ? {} : { assignedUserId: user.id };
  }

  /** Administrators see every record; everyone else only their own. */
  private canAccess(record: VerificationRecord, user: User): boolean {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    return record.assignedUserId.toLowerCase() === user.id.toLowerCase();
  }
}

/** Shared instance used by the record controller. */
export const recordService = new RecordService();
