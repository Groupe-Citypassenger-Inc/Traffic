import { Component, Inject, OnInit } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { LanguageService } from '../lingual_service/language.service';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.css'],
})
export class NotificationComponent implements OnInit {
  lang: string;

  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: any,
    public snackBarRef: MatSnackBarRef<NotificationComponent>,
    private languageService: LanguageService,
  ) { }

  ngOnInit(): void {
    this.lang = this.languageService.getLanguage();
    if (this.lang === 'fr') {
      this.data.type = this.data.type === 'error' ? 'Erreur' : 'Succès';
    }
  }
}
