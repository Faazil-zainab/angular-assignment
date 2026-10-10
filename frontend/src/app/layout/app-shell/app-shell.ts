import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith, take } from 'rxjs';

import { AppLink } from '../../core/constants/app-routes';
import { ROLE_OPTIONS, UserRole, type ApiStatus, type HealthReport } from '../../core/models';
import { AppInfoService } from '../../core/services/app-info.service';
import { AuthService } from '../../core/services/auth.service';
import { HealthService } from '../../core/services/health.service';
import { MATERIAL_MODULES } from '../../shared/ui';

/** A single entry in the sidebar navigation. */
interface NavItem {
  readonly label: string;
  readonly icon: string;
  readonly link: string;
  readonly adminOnly?: boolean;
}

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * Application chrome: a persistent sidebar for navigation, a top bar for
 * contextual controls (API health, notifications, account menu), the routed view
 * and a status footer.
 *
 * The layout is responsive by construction: a CDK `BreakpointObserver` drives a
 * signal that switches the sidebar between permanently docked (desktop) and an
 * overlay drawer (tablet/phone), so the same markup serves every viewport.
 *
 * The shell reads the session from {@link AuthService} (never a token or storage
 * directly) to decide what to show: the Admin entries are only rendered for
 * administrators. Hiding a link is a convenience, not the security boundary -
 * the route guard and the API enforce access independently.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MATERIAL_MODULES],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly healthService = inject(HealthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly info = inject(AppInfoService);
  protected readonly auth = inject(AuthService);
  protected readonly links = AppLink;

  /** Session state, exposed for the template. */
  protected readonly currentUser = this.auth.currentUser;
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly isAdmin = computed(() => this.auth.hasRole(UserRole.ADMIN));

  /** True below 64rem: the sidebar becomes an overlay drawer. */
  protected readonly isCompact = toSignal(
    this.breakpoints.observe('(max-width: 64rem)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Drawer visibility (only meaningful in compact mode). */
  protected readonly drawerOpen = signal(false);

  /** Human-readable label for the area currently on screen, for the top bar. */
  protected readonly currentArea = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => describeArea(event.urlAfterRedirects)),
      startWith(describeArea(this.router.url)),
    ),
    { initialValue: 'Dashboard' },
  );

  protected readonly navigation = computed<readonly NavSection[]>(() => {
    const sections: NavSection[] = [
      {
        title: 'Workspace',
        items: [{ label: 'Dashboard', icon: 'space_dashboard', link: AppLink.dashboard }],
      },
    ];

    if (this.isAdmin()) {
      sections.push({
        title: 'Administration',
        items: [
          { label: 'Users', icon: 'group', link: AppLink.admin, adminOnly: true },
        ],
      });
    }

    return sections;
  });

  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role === null ? '' : (ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role);
  });

  /** One or two initials for the account avatar. */
  protected readonly initials = computed(() => {
    const name = this.currentUser()?.name?.trim();
    if (!name) {
      return 'MC';
    }
    const parts = name.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  });

  protected readonly apiStatus = signal<ApiStatus>('checking');
  protected readonly report = signal<HealthReport | null>(null);

  protected readonly statusLabel = computed(() => {
    switch (this.apiStatus()) {
      case 'checking':
        return 'Checking';
      case 'online':
        return 'API online';
      default:
        return 'API offline';
    }
  });

  protected readonly statusIcon = computed(() =>
    this.apiStatus() === 'online' ? 'cloud_done' : 'cloud_off',
  );

  protected readonly statusDetail = computed(() => {
    if (this.apiStatus() === 'checking') {
      return 'Contacting the MPloyChek API…';
    }

    const report = this.report();
    if (!report) {
      return `API unreachable. Start it with "npm run dev" in /backend (expected at ${this.info.apiBaseUrl}).`;
    }

    return [
      `${report.service} v${report.version}`,
      `env: ${report.environment}`,
      `Node ${report.nodeVersion}`,
      `storage: ${report.storageDriver}`,
      `uptime: ${report.uptimeSeconds}s`,
      `API delay: ${report.apiDelayMs}ms`,
    ].join(' · ');
  });

  constructor() {
    this.checkApi();
    this.notifyIfDenied();
  }

  /** Opens/closes the overlay drawer on compact viewports. */
  protected toggleNavigation(): void {
    this.drawerOpen.update((open) => !open);
  }

  /** Closes the drawer after a navigation (compact viewports only). */
  protected closeNavigation(): void {
    if (this.isCompact()) {
      this.drawerOpen.set(false);
    }
  }

  /** Signs the current user out and returns to the login screen. */
  protected logout(): void {
    this.auth.logout({ redirectTo: AppLink.login });
  }

  /** Re-runs the health probe (one-shot HTTP request). */
  protected checkApi(): void {
    this.apiStatus.set('checking');

    this.healthService
      .getReport()
      .pipe(take(1))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.apiStatus.set('online');
        },
        error: () => {
          this.report.set(null);
          this.apiStatus.set('offline');
        },
      });
  }

  /** Explains a `?denied=` redirect produced by the role guard. */
  private notifyIfDenied(): void {
    if (this.route.snapshot.queryParamMap.has('denied')) {
      this.snackBar.open('You do not have access to that area.', 'Dismiss', {
        duration: 5000,
        horizontalPosition: 'center',
      });
    }
  }
}

/** Maps the active URL to the label shown in the top bar. */
function describeArea(url: string): string {
  if (url.startsWith(AppLink.admin)) {
    return 'User management';
  }
  if (url.startsWith(AppLink.dashboard)) {
    return 'Dashboard';
  }
  return 'Workspace';
}
