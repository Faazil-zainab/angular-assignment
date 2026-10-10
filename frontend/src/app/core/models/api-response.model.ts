/**
 * The API response envelope contract, mirroring `backend/src/models/api-response.model.ts`.
 *
 * Keep the two in sync - it is the only coupling between the SPA and the API
 * besides the individual payload types.
 */

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  durationMs?: number;
  delayMs?: number;
  /** Role the response was scoped to (records endpoints). */
  role?: string;
  /** Configured artificial delay applied to the request, in milliseconds. */
  delay?: number;
}

/** Page bookkeeping returned by list endpoints (e.g. `GET /api/records`). */
export interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccessBody<TData> {
  success: true;
  data: TData;
  /** Present on paged list endpoints. */
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

/** Discriminates the envelope union without inspecting HTTP status codes. */
export function isApiSuccess<TData>(body: ApiResponseBody<TData>): body is ApiSuccessBody<TData> {
  return body.success === true;
}
