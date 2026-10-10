import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, take } from 'rxjs';

import { AppLink } from '../../../../core/constants/app-routes';
import { ROLE_OPTIONS, UserRole, type LoginCredentials } from '../../../../core/models';
import { AppInfoService } from '../../../../core/services/app-info.service';
import { AuthService, describeAuthError } from '../../../../core/services/auth.service';
import { FORMS_MODULES, MATERIAL_MODULES } from '../../../../shared/ui';

/** A seeded development account, shown only outside production. */
interface DemoAccount {
  readonly userId: string;
  readonly password: string;
  readonly role: UserRole;
}

/** Matches the backend login schema for user ids. */
const USER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Sign-in screen (User ID + Password + Role).
 *
 * The component is a thin presentation layer: it owns the reactive form, its
 * validation messages and the loading/error UI, and delegates every
 * authentication concern to {@link AuthService}. It holds no token, calls no HTTP
 * endpoint directly and knows nothing about storage - which is what makes the
 * same service reusable by the guards and the interceptor.
 */
@Component({
  selector: 'app-login-page',
  imports: [FORMS_MODULES, MATERIAL_MODULES, MatRadioModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly info = inject(AppInfoService);
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly links = AppLink;

  protected readonly passwordHidden = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Seeded accounts, surfaced as a convenience outside production only. */
  protected readonly demoAccounts: readonly DemoAccount[] = [
    { userId: 'admin001', password: 'Admin@123', role: UserRole.ADMIN },
    { userId: 'user001', password: 'User@123', role: UserRole.GENERAL_USER },
  ];

  /** Typed, non-nullable form - every control value is a `string`/enum. */
  protected readonly form = this.formBuilder.group({
    userId: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(32),
        Validators.pattern(USER_ID_PATTERN),
      ],
    ],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(128)]],
    role: [UserRole.GENERAL_USER, [Validators.required]],
  });

  protected togglePassword(): void {
    this.passwordHidden.update((hidden) => !hidden);
  }

  /** Loads a demo account into the form (development convenience). */
  protected useDemoAccount(account: DemoAccount): void {
    this.form.setValue({
      userId: account.userId,
      password: account.password,
      role: account.role,
    });
    this.errorMessage.set(null);
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    const credentials: LoginCredentials = this.form.getRawValue();

    this.auth
      .login(credentials)
      .pipe(
        take(1),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => this.redirectAfterLogin(),
        // Failures are already normalised to `ApiHttpError` by the interceptor;
        // `describeAuthError` turns the code into a human message.
        error: (error: unknown) => this.errorMessage.set(describeAuthError(error)),
      });
  }

  /** Returns the user to the page they were blocked from, or the dashboard. */
  private redirectAfterLogin(): void {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    const isSafeInternalPath =
      redirectTo !== null && redirectTo.startsWith('/') && !redirectTo.startsWith('//');

    void this.router.navigateByUrl(isSafeInternalPath ? redirectTo : AppLink.dashboard);
  }
}
