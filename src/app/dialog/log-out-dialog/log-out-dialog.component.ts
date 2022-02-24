import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../auth_services/auth.service';

@Component({
  selector: 'app-log-out-dialog',
  templateUrl: './log-out-dialog.component.html',
  styleUrls: ['./log-out-dialog.component.css'],
})
export class LogOutDialogComponent {

  constructor(
    private auth: AuthService,
    public dialogRef: MatDialogRef<LogOutDialogComponent>) {
  }

  logout(): void {
    this.dialogRef.close();
    this.auth.logout();
  }

  close(): void {
    this.dialogRef.close();
  }
}
