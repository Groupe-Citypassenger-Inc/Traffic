import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ThemeHandlerService {
  isDarkMode: boolean;
  theme: string;
  themeChanges: Subject<string> = new Subject<string>();
  
  constructor() {
    this.isDarkMode = localStorage.getItem('theme') === 'Dark' ? true : false;
    this.theme = localStorage.getItem('theme');
  }

  updateTheme(theme: string): void {
    this.theme = theme;
    localStorage.setItem('theme', theme);
    this.isDarkMode = localStorage.getItem('theme') === 'Dark' ? true : false;
    this.themeChanges.next(theme);
  }

  getTheme(): string {
    return localStorage.getItem('theme');
  }
}
