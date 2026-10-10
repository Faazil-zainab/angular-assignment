import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type FormGroup } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { Department, UserRole, UserStatus, type User } from '../../../../../../core/models/user.model';
import { MATERIAL_MODULES } from '../../../../../../shared/ui';

export interface UserFormDialogData {
  user?: User;
  mode: 'create' | 'edit';
  existingUserIds: string[];
}

@Component({
  selector: 'app-user-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, ...MATERIAL_MODULES],
  templateUrl: './user-form-dialog.html',
  styleUrl: './user-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormDialog implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialog>);
  private readonly data = inject<UserFormDialogData>(MAT_DIALOG_DATA);

  protected readonly mode = signal(this.data.mode);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly form: FormGroup;
  protected readonly departments = Object.values(Department);
  protected readonly roles = Object.values(UserRole);
  protected readonly statuses = Object.values(UserStatus);

  constructor() {
    this.form = this.fb.group({
      userId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
      password: ['', [Validators.minLength(8), Validators.maxLength(128)]],
      role: [UserRole.GENERAL_USER, Validators.required],
      department: [Department.VERIFICATION, Validators.required],
      status: [UserStatus.ACTIVE],
    });
  }

  ngOnInit(): void {
    if (this.data.user) {
      this.form.patchValue({
        userId: this.data.user.userId,
        name: this.data.user.name,
        email: this.data.user.email,
        role: this.data.user.role,
        department: this.data.user.department,
        status: this.data.user.status,
      });

      this.form.get('userId')?.disable();
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity();
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue();
    const existingIds = this.data.existingUserIds || [];

    if (this.mode() === 'create' && existingIds.includes(rawValue.userId.toLowerCase())) {
      this.submitError.set('User ID already exists. Please choose a different one.');
      this.form.get('userId')?.setErrors({ notUnique: true });
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    if (this.mode() === 'create') {
      this.dialogRef.close({
        userId: rawValue.userId,
        name: rawValue.name,
        email: rawValue.email.trim().toLowerCase(),
        password: rawValue.password,
        role: rawValue.role,
        department: rawValue.department,
        status: rawValue.status,
      });
    } else {
      const updateData: Record<string, unknown> = {};
      if (rawValue['name']) updateData['name'] = rawValue['name'];
      if (rawValue['email']) updateData['email'] = rawValue['email'].trim().toLowerCase();
      if (rawValue['role']) updateData['role'] = rawValue['role'];
      if (rawValue['department']) updateData['department'] = rawValue['department'];
      if (rawValue['status']) updateData['status'] = rawValue['status'];
      if (rawValue['password']) updateData['password'] = rawValue['password'];

      this.dialogRef.close(updateData);
    }
  }

  protected onCancel(): void {
    this.dialogRef.close(null);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  protected getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control || !control.errors || !control.touched) {
      return '';
    }

    const errors = control.errors;
    if (errors['required']) return `${this.getFieldLabel(controlName)} is required.`;
    if (errors['minlength']) return `${this.getFieldLabel(controlName)} must be at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['maxlength']) return `${this.getFieldLabel(controlName)} must be at most ${errors['maxlength'].requiredLength} characters.`;
    if (errors['pattern']) return 'User ID may only contain letters, digits, dot, underscore or hyphen.';
    if (errors['email']) return 'Please enter a valid email address.';
    if (errors['notUnique']) return 'User ID already exists. Please choose a different one.';

    return 'Invalid value.';
  }

  private getFieldLabel(controlName: string): string {
    const labels: Record<string, string> = {
      userId: 'User ID',
      name: 'Name',
      email: 'Email',
      password: 'Password',
      role: 'Role',
      department: 'Department',
      status: 'Status',
    };
    return labels[controlName] || controlName;
  }

  protected isCreateMode(): boolean {
    return this.mode() === 'create';
  }
}