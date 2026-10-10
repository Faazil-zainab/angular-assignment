/**
 * Domain model for a digital background-verification record.
 *
 * Also the on-disk contract: this is exactly what an entry in
 * `backend/data/records.json` looks like. Records contain no secrets, so the model
 * is returned to clients unchanged.
 *
 * Note the two different identifier names, which are easy to confuse:
 *
 * - `id` is the record's own business key (`REC-001`, `REC-002`, ...).
 * - `assignedUserId` is the *user* the record is assigned to, and holds the user's
 *   business key (`USR-002`). Access control compares it against the authenticated
 *   user's `id`.
 */

/** What the employer asked MPloyChek to verify. Human readable, as returned by the API. */
export enum VerificationType {
  EMPLOYMENT = 'Employment',
  EDUCATION = 'Education',
  IDENTITY = 'Identity',
  ADDRESS = 'Address',
  CRIMINAL = 'Criminal',
}

/** Lifecycle of the overall request. */
export enum RecordStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** How much risk the verification has surfaced. */
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/** A persisted background verification record. */
export interface VerificationRecord {
  /** Business key allocated by the repository (`REC-001`, `REC-002`, ...). */
  id: string;
  candidateName: string;
  verificationType: VerificationType;
  status: RecordStatus;
  /** ISO-8601 timestamp of when the request was submitted. */
  submittedDate: string;
  /** ISO-8601 timestamp of when the request finished; absent until it completes. */
  completedDate?: string;
  riskLevel: RiskLevel;
  /** `User.id` (e.g. `USR-002`) of the user the record is assigned to. */
  assignedUserId: string;
  company: string;
  location: string;
  description: string;
}

/** A record template used by the development seeder. */
export type SeedRecord = VerificationRecord;

/**
 * The criteria understood by the record repository's `filter()` / `paginate()`.
 *
 * Every field is optional: an absent field does not narrow the result. `search`
 * matches case-insensitively across candidate name, company, location and
 * verification type.
 */
export interface RecordQuery {
  assignedUserId?: string;
  status?: RecordStatus;
  riskLevel?: RiskLevel;
  verificationType?: VerificationType;
  search?: string;
}

/** A 1-based page request. Validated by the route before it reaches the service. */
export interface PageRequest {
  page: number;
  limit: number;
}

/** Page bookkeeping returned alongside the page's records. */
export interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** One page of records plus its pagination bookkeeping. */
export interface PaginatedRecords {
  items: VerificationRecord[];
  pagination: PaginationMeta;
}
