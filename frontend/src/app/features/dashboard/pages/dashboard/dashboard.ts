import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, type Observable, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import {
  RECORD_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  RecordStatus,
  RiskLevel,
  UserRole,
  type User,
  type VerificationRecord,
} from '../../../../core/models';
import { RecordService } from '../../../../core/services/record.service';
import { UserService } from '../../../../core/services/user.service';
import { describeApiError } from '../../../../core/utils/api-error-message';
import { PageHeader } from '../../../../shared/components/page-header/page-header';
import { MATERIAL_MODULES } from '../../../../shared/ui';

/** The view's lifecycle: exactly one of these is true at a time. */
type DashboardStatus = 'loading' | 'ready' | 'error';

interface DashboardState {
  readonly status: DashboardStatus;
  readonly profile: User | null;
  readonly records: readonly VerificationRecord[];
  readonly totalRecords: number;
  readonly error: string | null;
}

interface StatCard {
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly tone: string;
}

interface RiskSummary {
  readonly level: RiskLevel;
  readonly label: string;
  readonly count: number;
  readonly percent: number;
}

/** Options for the development delay control. */
interface DelayOption {
  readonly label: string;
  readonly value: number;
}

/** Matches the backend maximum page size, so the dashboard sees the whole set. */
const MAX_ROWS = 100;

const DELAY_OPTIONS: readonly DelayOption[] = [
  { label: 'No delay', value: 0 },
  { label: '1 second', value: 1000 },
  { label: '3 seconds', value: 3000 },
  { label: '5 seconds', value: 5000 },
];

const COLUMNS = ['candidate', 'type', 'company', 'status', 'risk', 'submitted', 'completed'] as const;

const INITIAL_STATE: DashboardState = {
  status: 'loading',
  profile: null,
  records: [],
  totalRecords: 0,
  error: null,
};

/**
 * The authenticated landing page: profile, statistics and the records table.
 *
 * Data flow is a single RxJS pipeline wrapped in a signal. A `BehaviorSubject`
 * (the reload trigger) is `switchMap`-ped into a `forkJoin` of the two API calls,
 * so **changing the delay or pressing Retry starts a fresh request and cancels any
 * one still in flight** - the canonical reason to prefer `switchMap` over
 * `mergeMap` here. `startWith` puts the view into its loading state and
 * `catchError` turns a failure into an error state, giving the template a single,
 * exhaustive `loading | ready | error` state to render.
 *
 * Nothing fakes latency: the "waiting" UI is driven by a real, slow API response
 * requested with `GET /api/records?delay=<ms>`, never a `setTimeout`.
 */
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, PageHeader, MATERIAL_MODULES],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly userService = inject(UserService);
  private readonly recordService = inject(RecordService);

  protected readonly delayOptions = DELAY_OPTIONS;
  protected readonly columns = COLUMNS;

  /** Selected artificial latency, forwarded to the API as `?delay=<ms>`. */
  protected readonly selectedDelay = signal<number>(0);

  private readonly reloadTrigger = new BehaviorSubject<void>(undefined);

  /** The one state the template renders. */
  protected readonly state = toSignal(
    this.reloadTrigger.pipe(switchMap(() => this.load())),
    { initialValue: INITIAL_STATE },
  );

  protected readonly profile = computed(() => this.state().profile);
  protected readonly profileName = computed(
    () =>
      this.profile()?.name ??
      (this.state().status === 'loading' ? 'Loading profile…' : 'Profile unavailable'),
  );
  protected readonly profileEmail = computed(() => this.profile()?.email ?? '');
  protected readonly profileInitials = computed(() => {
    const name = this.profile()?.name?.trim();
    if (!name) {
      return '··';
    }
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });
  protected readonly records = computed(() => this.state().records);
  protected readonly totalRecords = computed(() => this.state().totalRecords);
  protected readonly isLoading = computed(() => this.state().status === 'loading');
  protected readonly hasError = computed(() => this.state().status === 'error');
  protected readonly errorMessage = computed(() => this.state().error);
  protected readonly isEmpty = computed(
    () => this.state().status === 'ready' && this.state().records.length === 0,
  );

  protected readonly isAdmin = computed(() => this.profile()?.role === UserRole.ADMIN);

  protected readonly scopeLabel = computed(() =>
    this.profile()?.role === UserRole.ADMIN
      ? 'All records across the platform'
      : 'Records assigned to you',
  );

  protected readonly stats = computed<readonly StatCard[]>(() => buildStats(this.state()));

  protected readonly riskSummary = computed<readonly RiskSummary[]>(() =>
    buildRiskSummary(this.state()),
  );

  /** Re-runs both requests (used by the header button and the error state). */
  protected reload(): void {
    this.reloadTrigger.next();
  }

  /** Applies a new delay and immediately re-requests with it. */
  protected onDelayChange(value: number): void {
    if (value === this.selectedDelay()) {
      return;
    }
    this.selectedDelay.set(value);
    this.reload();
  }

  protected statusLabel(status: RecordStatus): string {
    return RECORD_STATUS_LABELS[status];
  }

  protected riskLabel(risk: RiskLevel): string {
    return RISK_LEVEL_LABELS[risk];
  }

  protected statusClass(status: RecordStatus): string {
    return `chip chip--status-${status.toLowerCase()}`;
  }

  protected riskClass(risk: RiskLevel): string {
    return `chip chip--risk-${risk.toLowerCase()}`;
  }

  /** The two API calls, together, as one observable view state. */
  private load(): Observable<DashboardState> {
    const delayMs = this.selectedDelay();

    return forkJoin({
      profile: this.userService.getCurrentUser(),
      page: this.recordService.getRecords({ limit: MAX_ROWS, delayMs }),
    }).pipe(
      map(
        ({ profile, page }): DashboardState => ({
          status: 'ready',
          profile,
          records: page.records,
          totalRecords: page.pagination.totalRecords,
          error: null,
        }),
      ),
      // Every attempt starts by showing the loading state.
      startWith(INITIAL_STATE),
      catchError((error: unknown) =>
        of<DashboardState>({
          status: 'error',
          profile: null,
          records: [],
          totalRecords: 0,
          error: describeApiError(error),
        }),
      ),
    );
  }
}

function buildStats(state: DashboardState): readonly StatCard[] {
  const records = state.records;
  const count = (predicate: (record: VerificationRecord) => boolean): number =>
    records.filter(predicate).length;

  return [
    { label: 'Total records', value: state.totalRecords, icon: 'fact_check', tone: 'primary' },
    {
      label: 'Pending',
      value: count((record) => record.status === RecordStatus.PENDING),
      icon: 'schedule',
      tone: 'muted',
    },
    {
      label: 'In progress',
      value: count((record) => record.status === RecordStatus.IN_PROGRESS),
      icon: 'hourglass_top',
      tone: 'info',
    },
    {
      label: 'Completed',
      value: count((record) => record.status === RecordStatus.COMPLETED),
      icon: 'verified',
      tone: 'success',
    },
    {
      label: 'Failed',
      value: count((record) => record.status === RecordStatus.FAILED),
      icon: 'report',
      tone: 'error',
    },
  ];
}

function buildRiskSummary(state: DashboardState): readonly RiskSummary[] {
  const records = state.records;
  const total = records.length;
  const percent = (value: number): number =>
    total === 0 ? 0 : Math.round((value / total) * 100);

  return [RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW].map((level) => {
    const count = records.filter((record) => record.riskLevel === level).length;
    return { level, label: RISK_LEVEL_LABELS[level], count, percent: percent(count) };
  });
}
