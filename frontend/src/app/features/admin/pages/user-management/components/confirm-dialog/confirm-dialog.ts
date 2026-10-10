import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MATERIAL_MODULES } from '../../../../../../shared/ui';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  icon?: string;
  color?: 'primary' | 'warn' | 'accent';
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, ...MATERIAL_MODULES],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialog>);
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  protected onConfirm(): void {
    this.dialogRef.close(true);
  }

  protected onCancel(): void {
    this.dialogRef.close(false);
  }

  protected getIcon(): string {
    return this.data.icon || 'warning';
  }

  protected getColor(): 'primary' | 'warn' | 'accent' {
    return this.data.color || 'warn';
  }
}