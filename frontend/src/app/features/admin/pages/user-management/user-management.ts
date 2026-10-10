import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';

import { Department, UserRole, UserStatus, type User } from '../../../../core/models/user.model';
import { MATERIAL_MODULES } from '../../../../shared/ui';
import { PageHeader } from '../../../../shared/components/page-header/page-header';
import { UserService, type UserListParams, type UserListResponse } from '../../../../core/services/user.service';
import { UserFormDialog, type UserFormDialogData } from './components/user-form-dialog/user-form-dialog';
import { ConfirmDialog, type ConfirmDialogData } from './components/confirm-dialog/confirm-dialog';
import { describeApiError } from '../../../../core/utils/api-error-message';

@Component({
  selector: 'app-user-management',
  // `MATERIAL_MODULES` already carries the shared Material building blocks;
  // only the two modules it does not include (dialog, paginator) are listed.
  imports: [ReactiveFormsModule, MatDialogModule, MatPaginatorModule, PageHeader, ...MATERIAL_MODULES],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagement implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  protected readonly displayedColumns: string[] = [
    'name',
    'userId',
    'role',
    'department',
    'status',
    'createdAt',
    'actions',
  ];

  protected readonly users = signal<User[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly totalRecords = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly currentPage = signal(0);
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly roleFilter = signal<UserRole | ''>('');
  protected readonly statusFilter = signal<UserStatus | ''>('');
  protected readonly departmentFilter = signal<Department | ''>('');

  protected readonly departments = Object.values(Department);
  protected readonly roles = Object.values(UserRole);
  protected readonly statuses = Object.values(UserStatus);

  protected readonly hasFilters = computed(
    () => this.roleFilter() !== '' || this.statusFilter() !== '' || this.departmentFilter() !== ''
  );

  ngOnInit(): void {
    // A debounced, de-duplicated search stream: one request per settled query.
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage.set(0);
        this.loadUsers();
      });

    this.searchControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => this.searchSubject.next(value));

    // The initial load. Every subsequent load is triggered by the handler that
    // changed the state, so a request is never issued twice for one change.
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected loadUsers(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const params: UserListParams = {
      page: this.currentPage() + 1,
      limit: this.pageSize(),
      search: this.searchControl.value.trim() || undefined,
      role: this.roleFilter() || undefined,
      status: this.statusFilter() || undefined,
      department: this.departmentFilter() || undefined,
    };

    this.userService.getUsers(params).subscribe({
      next: (response: UserListResponse) => {
        this.users.set(response.users);
        this.totalRecords.set(response.pagination.totalRecords);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(describeApiError(err, 'Failed to load users.'));
        this.isLoading.set(false);
        this.snackBar.open(this.error()!, 'Dismiss', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  protected onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadUsers();
  }

  protected clearSearch(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.currentPage.set(0);
  }

  protected clearFilters(): void {
    this.roleFilter.set('');
    this.statusFilter.set('');
    this.departmentFilter.set('');
    this.currentPage.set(0);
    this.loadUsers();
  }

  protected openAddUserDialog(): void {
    const existingUserIds = this.users().map((u) => u.userId.toLowerCase());

    const dialogRef = this.dialog.open<UserFormDialog, UserFormDialogData, User | Record<string, unknown> | null>(UserFormDialog, {
      width: '40rem',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        mode: 'create',
        existingUserIds,
      },
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.createUser(result as { userId: string; name: string; email: string; password: string; role: UserRole; department: Department; status?: UserStatus });
      }
    });
  }

  protected openEditUserDialog(user: User): void {
    const existingUserIds = this.users().map((u) => u.userId.toLowerCase());

    const dialogRef = this.dialog.open<UserFormDialog, UserFormDialogData, Record<string, unknown> | null>(UserFormDialog, {
      width: '40rem',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        user,
        mode: 'edit',
        existingUserIds,
      },
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && Object.keys(result).length > 0) {
        this.updateUser(user.id, result);
      }
    });
  }

  protected createUser(request: { userId: string; name: string; email: string; password: string; role: UserRole; department: Department; status?: UserStatus }): void {
    this.isLoading.set(true);

    this.userService.createUser(request).subscribe({
      next: (createdUser) => {
        this.showSuccess(`User "${createdUser.name}" created successfully.`);
        this.loadUsers();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.handleError(err, 'Failed to create user.');
      },
    });
  }

  protected updateUser(id: string, patch: Record<string, unknown>): void {
    this.isLoading.set(true);

    this.userService.updateUser(id, patch).subscribe({
      next: (updatedUser) => {
        this.showSuccess(`User "${updatedUser.name}" updated successfully.`);
        this.loadUsers();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.handleError(err, 'Failed to update user.');
      },
    });
  }

  protected confirmStatusChange(user: User): void {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    const action = newStatus === UserStatus.ACTIVE ? 'activate' : 'deactivate';

    const dialogData: ConfirmDialogData = {
      title: `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      message: `Are you sure you want to ${action} "${user.name}" (${user.userId})? ${action === 'deactivate' ? 'The user will not be able to sign in.' : 'The user will be able to sign in again.'}`,
      confirmText: action.charAt(0).toUpperCase() + action.slice(1),
      cancelText: 'Cancel',
      icon: action === 'deactivate' ? 'block' : 'check_circle',
      color: action === 'deactivate' ? 'warn' : 'primary',
    };

    const dialogRef = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      width: '28rem',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.updateUserStatus(user, newStatus);
      }
    });
  }

  protected updateUserStatus(user: User, status: UserStatus): void {
    this.isLoading.set(true);

    this.userService.updateUserStatus(user.id, { status }).subscribe({
      next: (updatedUser) => {
        const action = status === UserStatus.ACTIVE ? 'activated' : 'deactivated';
        this.showSuccess(`User "${updatedUser.name}" ${action} successfully.`);
        this.loadUsers();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.handleError(err, `Failed to ${status === UserStatus.ACTIVE ? 'activate' : 'deactivate'} user.`);
      },
    });
  }

  protected confirmDeleteUser(user: User): void {
    const dialogData: ConfirmDialogData = {
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${user.name}" (${user.userId})? This action cannot be undone. The user's verification records will be preserved.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      icon: 'delete_forever',
      color: 'warn',
    };

    const dialogRef = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      width: '28rem',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.deleteUser(user);
      }
    });
  }

  protected deleteUser(user: User): void {
    this.isLoading.set(true);

    this.userService.deleteUser(user.id).subscribe({
      next: (deletedUser) => {
        this.showSuccess(`User "${deletedUser.name}" deleted successfully.`);
        this.loadUsers();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.handleError(err, 'Failed to delete user.');
      },
    });
  }

  protected roleBadgeClass(role: UserRole): string {
    return role === UserRole.ADMIN ? 'badge badge--brand' : 'badge badge--neutral';
  }

  protected statusBadgeClass(status: UserStatus): string {
    return status === UserStatus.ACTIVE ? 'badge badge--success' : 'badge badge--danger';
  }

  protected statusIcon(status: UserStatus): string {
    return status === UserStatus.ACTIVE ? 'check_circle' : 'block';
  }

  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected trackByUserId(index: number, user: User): string {
    return user.id;
  }

  private showSuccess(message: string): void {
    this.isLoading.set(false);
    this.snackBar.open(message, 'Dismiss', { duration: 4000, panelClass: 'success-snackbar' });
  }

  private handleError(err: unknown, fallback: string): void {
    const message = describeApiError(err, fallback);
    this.error.set(message);
    this.snackBar.open(message, 'Dismiss', { duration: 6000, panelClass: 'error-snackbar' });
  }
}