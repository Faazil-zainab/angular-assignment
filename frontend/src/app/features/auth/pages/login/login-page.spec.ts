import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ApiHttpError } from '../../../../core/models/api-error.model';
import type { AuthSession } from '../../../../core/models/auth.model';
import { Department, UserRole, UserStatus, type User } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { API_BASE_URL } from '../../../../core/tokens/api.tokens';
import { LoginPage } from './login-page';

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

const SESSION: AuthSession = {
  token: 'header.payload.signature',
  tokenType: 'Bearer',
  expiresInSeconds: 3600,
  issuedAt: new Date().toISOString(),
  user: USER,
};

interface LoginSpy {
  login: jasmine.Spy<AuthService['login']>;
}

function configure(login: LoginSpy['login']): void {
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: 'http://localhost:3000/api' },
      { provide: AuthService, useValue: { login } },
    ],
  });
}

/** Reads a `protected` member for assertions without widening the component's API. */
function internals(component: LoginPage): {
  submit: () => void;
  form: { setValue: (value: unknown) => void; markAllAsTouched: () => void };
  errorMessage: () => string | null;
  submitting: () => boolean;
} {
  return component as unknown as {
    submit: () => void;
    form: { setValue: (value: unknown) => void; markAllAsTouched: () => void };
    errorMessage: () => string | null;
    submitting: () => boolean;
  };
}

describe('LoginPage', () => {
  it('does not call the API when the form is invalid', () => {
    const login = jasmine.createSpy('login').and.returnValue(of(SESSION));
    configure(login as unknown as LoginSpy['login']);
    const fixture = TestBed.createComponent(LoginPage);
    const component = internals(fixture.componentInstance);

    component.submit();

    expect(login).not.toHaveBeenCalled();
  });

  it('submits the credentials and navigates to the dashboard on success', () => {
    const login = jasmine.createSpy('login').and.returnValue(of(SESSION));
    configure(login as unknown as LoginSpy['login']);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    const fixture = TestBed.createComponent(LoginPage);
    const component = internals(fixture.componentInstance);

    component.form.setValue({
      userId: 'user001',
      password: 'User@123',
      role: UserRole.GENERAL_USER,
    });
    component.submit();

    expect(login).toHaveBeenCalledWith({
      userId: 'user001',
      password: 'User@123',
      role: UserRole.GENERAL_USER,
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a friendly message when the credentials are rejected', () => {
    const login = jasmine
      .createSpy('login')
      .and.returnValue(
        throwError(() => new ApiHttpError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'no' })),
      );
    configure(login as unknown as LoginSpy['login']);

    const fixture = TestBed.createComponent(LoginPage);
    const component = internals(fixture.componentInstance);

    component.form.setValue({
      userId: 'user001',
      password: 'wrongpass',
      role: UserRole.GENERAL_USER,
    });
    component.submit();

    expect(component.errorMessage()).toBe('Invalid user ID or password.');
    expect(component.submitting()).toBeFalse();
  });

  it('reports an unreachable API distinctly', () => {
    const login = jasmine
      .createSpy('login')
      .and.returnValue(
        throwError(() => new ApiHttpError({ status: 0, code: 'NETWORK_ERROR', message: 'down' })),
      );
    configure(login as unknown as LoginSpy['login']);

    const fixture = TestBed.createComponent(LoginPage);
    const component = internals(fixture.componentInstance);

    component.form.setValue({ userId: 'admin001', password: 'Admin@123', role: UserRole.ADMIN });
    component.submit();

    expect(component.errorMessage()).toContain('Cannot reach the MPloyChek API');
  });
});
