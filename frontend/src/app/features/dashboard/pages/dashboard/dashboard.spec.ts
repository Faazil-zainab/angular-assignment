import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { type Observable, Subject, of, throwError } from 'rxjs';

import { ApiHttpError } from '../../../../core/models/api-error.model';
import {
  Department,
  RecordStatus,
  RiskLevel,
  UserRole,
  UserStatus,
  VerificationType,
  type User,
  type VerificationRecord,
} from '../../../../core/models';
import { type RecordPage, RecordService } from '../../../../core/services/record.service';
import { UserService } from '../../../../core/services/user.service';
import { Dashboard } from './dashboard';

const USER: User = {
  id: 'USR-002',
  userId: 'user001',
  name: 'General User',
  email: 'user@mploychek.local',
  role: UserRole.GENERAL_USER,
  department: Department.VERIFICATION,
  status: UserStatus.ACTIVE,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const RECORDS: readonly VerificationRecord[] = [
  {
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
  },
  {
    id: 'REC-002',
    candidateName: 'Rohan Mehta',
    verificationType: VerificationType.IDENTITY,
    status: RecordStatus.PENDING,
    submittedDate: '2026-09-20T08:45:00.000Z',
    riskLevel: RiskLevel.HIGH,
    assignedUserId: 'USR-002',
    company: 'Infosys Ltd',
    location: 'Bengaluru',
    description: 'Identity check not started.',
  },
];

const PAGE: RecordPage = {
  records: [...RECORDS],
  pagination: {
    page: 1,
    limit: 100,
    totalRecords: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  meta: { requestId: 't', timestamp: '' },
};

const EMPTY_PAGE: RecordPage = {
  records: [],
  pagination: { ...PAGE.pagination, totalRecords: 0 },
  meta: PAGE.meta,
};

interface DashboardInternals {
  isLoading: () => boolean;
  hasError: () => boolean;
  isEmpty: () => boolean;
  errorMessage: () => string | null;
  records: () => readonly VerificationRecord[];
  stats: () => ReadonlyArray<{ label: string; value: number }>;
  selectedDelay: () => number;
  onDelayChange: (value: number) => void;
  reload: () => void;
}

function setup(options: { user?: Observable<User>; records?: Observable<RecordPage> } = {}) {
  const userService = {
    getCurrentUser: jasmine.createSpy('getCurrentUser').and.returnValue(options.user ?? of(USER)),
  };
  const recordService = {
    getRecords: jasmine.createSpy('getRecords').and.returnValue(options.records ?? of(PAGE)),
  };

  TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [
      provideNoopAnimations(),
      { provide: UserService, useValue: userService },
      { provide: RecordService, useValue: recordService },
    ],
  });

  const fixture = TestBed.createComponent(Dashboard);

  return {
    fixture,
    component: fixture.componentInstance as unknown as DashboardInternals,
    userService,
    recordService,
  };
}

describe('Dashboard', () => {
  it('shows the loading state until both requests complete', () => {
    const profile$ = new Subject<User>();
    const records$ = new Subject<RecordPage>();
    const { component } = setup({ user: profile$, records: records$ });

    expect(component.isLoading()).toBeTrue();

    profile$.next(USER);
    profile$.complete();
    records$.next(PAGE);
    records$.complete();

    expect(component.isLoading()).toBeFalse();
    expect(component.records().length).toBe(2);
  });

  it('renders the profile, statistics and records table when ready', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();

    expect(component.isLoading()).toBeFalse();
    expect(component.hasError()).toBeFalse();

    const stats = component.stats();
    expect(stats.find((stat) => stat.label === 'Total records')?.value).toBe(2);
    expect(stats.find((stat) => stat.label === 'Completed')?.value).toBe(1);
    expect(stats.find((stat) => stat.label === 'Pending')?.value).toBe(1);
    expect(stats.find((stat) => stat.label === 'In progress')?.value).toBe(0);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('General User');
    expect(text).toContain('user@mploychek.local');
    expect(text).toContain('Arun Kumar');
    expect(text).toContain('Tech Solutions Pvt Ltd');
  });

  it('shows the empty state when the caller has no records', () => {
    const { component } = setup({ records: of(EMPTY_PAGE) });

    expect(component.isEmpty()).toBeTrue();
    expect(component.records().length).toBe(0);
  });

  it('shows the error state and recovers on retry', () => {
    const recordService = {
      getRecords: jasmine
        .createSpy('getRecords')
        .and.returnValues(
          throwError(
            () => new ApiHttpError({ status: 0, code: 'NETWORK_ERROR', message: 'API down' }),
          ),
          of(PAGE),
        ),
    };
    const userService = { getCurrentUser: jasmine.createSpy('getCurrentUser').and.returnValue(of(USER)) };

    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideNoopAnimations(),
        { provide: UserService, useValue: userService },
        { provide: RecordService, useValue: recordService },
      ],
    });

    const fixture = TestBed.createComponent(Dashboard);
    const component = fixture.componentInstance as unknown as DashboardInternals;

    expect(component.hasError()).toBeTrue();
    expect(component.errorMessage()).toContain('Cannot reach the MPloyChek API');

    component.reload();

    expect(component.hasError()).toBeFalse();
    expect(component.records().length).toBe(2);
    expect(recordService.getRecords).toHaveBeenCalledTimes(2);
  });

  it('re-requests with the selected delay instead of faking latency', () => {
    const { component, recordService } = setup();

    expect(recordService.getRecords.calls.mostRecent().args[0]).toEqual({
      limit: 100,
      delayMs: 0,
    });

    component.onDelayChange(3000);

    expect(component.selectedDelay()).toBe(3000);
    expect(recordService.getRecords).toHaveBeenCalledTimes(2);
    expect(recordService.getRecords.calls.mostRecent().args[0]).toEqual({
      limit: 100,
      delayMs: 3000,
    });
  });
});
