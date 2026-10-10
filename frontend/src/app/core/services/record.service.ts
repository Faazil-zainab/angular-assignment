import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import type { ApiSuccessBody, PaginationMeta, ResponseMeta } from '../models/api-response.model';
import type { RecordQuery, VerificationRecord } from '../models/record.model';
import { API_BASE_URL } from '../tokens/api.tokens';

/** One page of records plus the API's pagination bookkeeping and metadata. */
export interface RecordPage {
  records: VerificationRecord[];
  pagination: PaginationMeta;
  meta: ResponseMeta;
}

/**
 * Data access for background verification records.
 *
 * `getRecords()` is the single entry point for `GET /api/records`; the caller
 * supplies a {@link RecordQuery} and the service translates it into query
 * parameters. It does **not** decide what the caller may see - the API returns a
 * general user's assigned records and an administrator's full set, and this
 * service simply surfaces what came back.
 *
 * `delayMs` becomes `?delay=<ms>`, which the backend honours (validated to
 * 0-10000) by waiting asynchronously before responding. Nothing here uses a
 * client-side timer.
 */
@Injectable({ providedIn: 'root' })
export class RecordService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** `GET /api/records` with optional filtering, paging and artificial delay. */
  getRecords(query: RecordQuery = {}): Observable<RecordPage> {
    return this.http
      .get<ApiSuccessBody<VerificationRecord[]>>(`${this.baseUrl}/records`, {
        params: buildParams(query),
      })
      .pipe(
        map((body) => ({
          records: body.data,
          pagination: body.pagination ?? derivePagination(body.data.length),
          meta: body.meta,
        })),
      );
  }
}

/** Builds the query string for `GET /api/records`, omitting anything unset. */
function buildParams(query: RecordQuery): HttpParams {
  let params = new HttpParams();

  if (query.page !== undefined) {
    params = params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params = params.set('limit', String(query.limit));
  }
  if (query.status !== undefined) {
    params = params.set('status', query.status);
  }
  if (query.riskLevel !== undefined) {
    params = params.set('riskLevel', query.riskLevel);
  }
  if (query.verificationType !== undefined) {
    params = params.set('verificationType', query.verificationType);
  }
  if (query.search !== undefined && query.search.trim().length > 0) {
    params = params.set('search', query.search.trim());
  }
  // `0` is meaningful (explicitly no delay), so it is sent rather than omitted -
  // this also stops the delay interceptor from adding the environment default.
  if (query.delayMs !== undefined) {
    params = params.set('delay', String(query.delayMs));
  }

  return params;
}

/** Fallback bookkeeping if a response ever omits `pagination` (defensive). */
function derivePagination(count: number): PaginationMeta {
  return {
    page: 1,
    limit: count,
    totalRecords: count,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}
