import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';
import { adminGuard, generalUserGuard, roleGuard } from './role.guard';

const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = { url: '/dashboard' } as RouterStateSnapshot;

/** Minimal AuthService double - the guards only call these two methods. */
function authStub(options: { authenticated: boolean; role?: UserRole }): AuthService {
  return {
    isAuthenticated: () => options.authenticated,
    hasRole: (...roles: readonly UserRole[]) =>
      options.role !== undefined && roles.includes(options.role),
  } as unknown as AuthService;
}

function configure(stub: AuthService): void {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: stub }],
  });
}

describe('authGuard', () => {
  it('allows an authenticated user through', () => {
    configure(authStub({ authenticated: true }));

    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));

    expect(result).toBeTrue();
  });

  it('redirects an unauthenticated user to login with the intended URL', () => {
    configure(authStub({ authenticated: false }));

    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));

    expect(result instanceof UrlTree).toBeTrue();
    const url = String(result);
    expect(url).toContain('/auth/login');
    expect(url).toContain('redirectTo=%2Fdashboard');
  });
});

describe('roleGuard', () => {
  it('allows a user holding an allowed role (adminGuard -> ADMIN)', () => {
    configure(authStub({ authenticated: true, role: UserRole.ADMIN }));

    const result = TestBed.runInInjectionContext(() => adminGuard(ROUTE, STATE));

    expect(result).toBeTrue();
  });

  it('sends an unauthenticated user to login', () => {
    configure(authStub({ authenticated: false }));

    const result = TestBed.runInInjectionContext(() => roleGuard(UserRole.ADMIN)(ROUTE, STATE));

    expect(result instanceof UrlTree).toBeTrue();
    expect(String(result)).toContain('/auth/login');
  });

  it('sends an authenticated user with the wrong role to the dashboard', () => {
    configure(authStub({ authenticated: true, role: UserRole.GENERAL_USER }));

    const result = TestBed.runInInjectionContext(() => adminGuard(ROUTE, STATE));

    expect(result instanceof UrlTree).toBeTrue();
    const url = String(result);
    expect(url).toContain('/dashboard');
    expect(url).toContain('denied=ADMIN');
  });

  it('lets a general user into a general-user route', () => {
    configure(authStub({ authenticated: true, role: UserRole.GENERAL_USER }));

    const result = TestBed.runInInjectionContext(() => generalUserGuard(ROUTE, STATE));

    expect(result).toBeTrue();
  });
});

