import type { PaginationMeta } from './record.model';

/**
 * Response envelope shared by every endpoint.
 *
 * Clients (including the Angular frontend) can rely on `success` to
 * discriminate the union without inspecting HTTP status codes.
 */
export interface ResponseMeta {
  /** Correlation id echoed in the `X-Request-Id` header. */
  requestId: string;
  /** ISO-8601 timestamp of when the response was produced. */
  timestamp: string;
  /** Wall clock time spent handling the request, in milliseconds. */
  durationMs?: number;
  /** Artificial latency injected for this request, in milliseconds. */
  delayMs?: number;
  /** Which role the response was scoped to, e.g. `ADMIN` on the records API. */
  role?: string;
  /** The configured delay applied to this request, in milliseconds. */
  delay?: number;
  /** Endpoint-specific metadata that does not warrant a first-class field. */
  [key: string]: unknown;
}

export interface ApiSuccessBody<TData> {
  success: true;
  data: TData;
  /** Present on list endpoints that page their result (e.g. `GET /api/records`). */
  pagination?: PaginationMeta;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ResponseMeta;
}

export type ApiResponseBody<TData> = ApiSuccessBody<TData> | ApiErrorBody;

/** Payload returned by `GET /api/health`. */
export interface HealthReport {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  startedAt: string;
  timestamp: string;
  nodeVersion: string;
  apiDelayMs: number;
  storageDriver: string;
  /** Absolute paths of the JSON documents the local store uses. */
  storageFiles: string[];
}

