import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import type { ApiSuccessBody } from '../models/api-response.model';
import type { HealthReport } from '../models/health.model';
import { API_BASE_URL } from '../tokens/api.tokens';

/**
 * Service responsible for talking to the API about its own status.
 *
 * It is the smallest possible end-to-end slice of the architecture
 * (component -> service -> HttpClient -> Express route -> service -> response
 * envelope) and therefore the template every Phase 2 service follows:
 * inject `HttpClient` + `API_BASE_URL`, unwrap the envelope with `map`, and hand
 * an `Observable<T>` back to the feature - never an `HttpResponse`.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** `GET /api/health` -> the unwrapped health report. */
  getReport(): Observable<HealthReport> {
    return this.http
      .get<ApiSuccessBody<HealthReport>>(`${this.baseUrl}/health`)
      .pipe(map((body) => body.data));
  }
}
