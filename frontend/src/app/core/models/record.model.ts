/**
 * Domain model for a background verification record, mirroring
 * `backend/src/models/record.model.ts`.
 *
 * The enum values are the exact strings the API sends (`verificationType` is
 * Title Case, `status`/`riskLevel` are SCREAMING_SNAKE), so records can be used
 * verbatim without translation.
 */

/** What the employer asked MPloyChek to verify. */
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

/** A verified/verifying background check as returned by `GET /api/records`. */
export interface VerificationRecord {
  id: string;
  candidateName: string;
  verificationType: VerificationType;
  status: RecordStatus;
  /** ISO-8601 timestamp of when the request was submitted. */
  submittedDate: string;
  /** ISO-8601 timestamp of when the request finished; absent until it completes. */
  completedDate?: string;
  riskLevel: RiskLevel;
  /** `User.id` (`USR-002`) of the user the record is assigned to. */
  assignedUserId: string;
  company: string;
  location: string;
  description: string;
}

/** Human-readable labels for a status chip. */
export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  [RecordStatus.PENDING]: 'Pending',
  [RecordStatus.IN_PROGRESS]: 'In progress',
  [RecordStatus.COMPLETED]: 'Completed',
  [RecordStatus.FAILED]: 'Failed',
};

/** Human-readable labels for a risk indicator. */
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'Low',
  [RiskLevel.MEDIUM]: 'Medium',
  [RiskLevel.HIGH]: 'High',
};

/**
 * Query accepted by `RecordService.getRecords()`.
 *
 * Every field is optional; only the supplied ones are sent to the API. `delayMs`
 * is forwarded as `?delay=<ms>` so the dashboard can demonstrate the API's
 * asynchronous processing without any client-side timers.
 */
export interface RecordQuery {
  page?: number;
  limit?: number;
  status?: RecordStatus;
  riskLevel?: RiskLevel;
  verificationType?: VerificationType;
  search?: string;
  delayMs?: number;
}
