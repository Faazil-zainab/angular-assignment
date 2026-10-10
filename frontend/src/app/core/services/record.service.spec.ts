import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  RecordStatus,
  RiskLevel,
  VerificationType,
  type VerificationRecord,
} from '../models/record.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { type RecordPage, RecordService } from './record.service';

const BASE_URL = 'http://localhost:3000/api';

const RECORD: VerificationRecord = {
  id: 'REC-001',
  candidateName: 'Arun Kumar',
  verificationType: VerificationType.EMPLOYMENT,
  status: RecordStatus.COMPLETED,
  submittedDate: '2026-09-15T10:30:00.000Z',
  completedDate: '2026-09-17T15:30:00.000Z',
  riskLevel: RiskLevel.LOW,
  assignedUserId: 'USR-002',
  company: 'Tech Solutions Pvt Ltd',
  location: 'Chennai',
  description: 'Employment verification completed successfully.',
};

describe('RecordService', () => {
  let service: RecordService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });
    service = TestBed.inject(RecordService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests /records with no parameters for an empty query', () => {
    service.getRecords().subscribe();

    const request = httpMock.expectOne(`${BASE_URL}/records`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().length).toBe(0);

    request.flush({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        totalRecords: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      meta: { requestId: 't', timestamp: '' },
    });
  });

  it('forwards paging, filters, trimmed search and the delay', () => {
    service
      .getRecords({
        page: 2,
        limit: 25,
        status: RecordStatus.COMPLETED,
        riskLevel: RiskLevel.HIGH,
        verificationType: VerificationType.EMPLOYMENT,
        search: '  acme  ',
        delayMs: 3000,
      })
      .subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === `${BASE_URL}/records`);
    const params = request.request.params;

    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('25');
    expect(params.get('status')).toBe('COMPLETED');
    expect(params.get('riskLevel')).toBe('HIGH');
    expect(params.get('verificationType')).toBe('Employment');
    expect(params.get('search')).toBe('acme');
    expect(params.get('delay')).toBe('3000');

    request.flush({ success: true, data: [], meta: { requestId: 't', timestamp: '' } });
  });

  it('sends delay=0 explicitly so "no delay" is honoured', () => {
    service.getRecords({ delayMs: 0 }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === `${BASE_URL}/records`);
    expect(request.request.params.get('delay')).toBe('0');

    request.flush({ success: true, data: [], meta: { requestId: 't', timestamp: '' } });
  });

  it('unwraps the records and the pagination bookkeeping', () => {
    let received: RecordPage | undefined;

    service.getRecords().subscribe((page) => (received = page));

    httpMock.expectOne((candidate) => candidate.url === `${BASE_URL}/records`).flush({
      success: true,
      data: [RECORD],
      pagination: {
        page: 1,
        limit: 10,
        totalRecords: 16,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      },
      meta: { requestId: 't', timestamp: '' },
    });

    expect(received?.records).toEqual([RECORD]);
    expect(received?.pagination.totalRecords).toBe(16);
    expect(received?.pagination.hasNextPage).toBeTrue();
  });
});
