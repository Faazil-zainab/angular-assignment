import type { Type } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

/**
 * Form building blocks shared by the application.
 *
 * Reactive forms are the single form strategy used by MPloyChek: the login form,
 * the admin user editor and the verification record filters all build typed
 * `FormGroup`s with `NonNullableFormBuilder` and validate them here, so no
 * template-driven logic leaks into the components.
 */
export const FORMS_MODULES: Type<unknown>[] = [ReactiveFormsModule];
