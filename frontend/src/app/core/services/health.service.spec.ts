import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { HealthReport } from '../models/health.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { HealthService } from './health.service';

const BASE_URL = 'http://localhost:3000/api';

const REPORT: HealthReport = {
  status: 'ok',
  service: 'MPloyChek API',
  version: '1.0.0',
  environment: 'test',
  uptimeSeconds: 1.5,
  startedAt: new Date().toISOString(),
  timestamp: new Date().toISOString(),
  nodeVersion: 'v24.0.0',
  apiDelayMs: 0,
  storageDriver: 'json-file',
  storageFiles: ['/backend/data/users.json', '/backend/data/records.json'],
};

/**
 * Verifies the contract between the SPA and the API: the correct URL is called
 * and the `{ success, data }` envelope is unwrapped before it reaches a feature.
 */
describe('HealthService', () => {
  let service: HealthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });

    service = TestBed.inject(HealthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests /health on the configured base URL and unwraps the envelope', () => {
    let received: HealthReport | undefined;

    service.getReport().subscribe((report) => {
      received = report;
    });

    const request = httpMock.expectOne(`${BASE_URL}/health`);
    expect(request.request.method).toBe('GET');

    request.flush({ success: true, data: REPORT, meta: { requestId: 'test', timestamp: REPORT.timestamp } });

    expect(received).toEqual(REPORT);
  });

  it('propagates HTTP failures to the caller', () => {
    let errorStatus: number | undefined;

    service.getReport().subscribe({
      error: (error: { status: number }) => {
        errorStatus = error.status;
      },
    });

    httpMock
      .expectOne(`${BASE_URL}/health`)
      .flush({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }, { status: 500, statusText: 'Server Error' });

    expect(errorStatus).toBe(500);
  });
});
