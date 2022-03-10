import { Component, OnInit, isDevMode, OnDestroy } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ThemeHandlerService } from './theme_handler/theme-handler.service';
import { LanguageService } from './lingual_service/language.service';
import { AuthService } from './auth_services/auth.service';
import { environment } from '../environments/environment';
import { LogOutDialogComponent } from './dialog/log-out-dialog/log-out-dialog.component';

const DARK_THEME_MODE_CLASS = 'dark-theme-mode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  isLogged: boolean = false;
  currentApplicationVersion = environment.appVersion;
  auth_status_subscription: Subscription;
  dialogRefSubscription: Subscription;
  isDarkMode: boolean = false;
  siteLocale: string;
  previousUrl$ = new BehaviorSubject<string>(null);
  currentUrl$ = new BehaviorSubject<string>(null);

  constructor(
    private auth: AuthService,
    public dialog: MatDialog,
    private languageService: LanguageService,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    public overlayContainer: OverlayContainer,
    public themeHandler: ThemeHandlerService,
  ) { }

  ngOnInit(): void {
    this.addSvgs();
    this.setTheme();
    this.storeThemeSelection();

    this.isLogged = this.auth.isAuth;
    this.auth_status_subscription = this.auth.logStatusChange.subscribe(
      (status) => { this.isLogged = status; },
    );
    this.siteLocale = this.languageService.getLanguage();
  }

  ngOnDestroy(): void {
    this.auth_status_subscription.unsubscribe();
    this.dialogRefSubscription.unsubscribe();
  }

  addSvgs() {
    this.addSvgIcon('fr_flag', 'assets/images/fr.svg');
    this.addSvgIcon('gb_flag', 'assets/images/gb.svg');
  }

  addSvgIcon(name: string, path: string) {
    const safeRessourceUrl = this.domSanitizer.bypassSecurityTrustResourceUrl(path);
    this.matIconRegistry.addSvgIcon(name, safeRessourceUrl);
  }

  logout(): void {
    const dialogRef = this.dialog.open(LogOutDialogComponent);
    this.dialogRefSubscription = dialogRef.afterClosed().subscribe(() => { });
  }

  setTheme() {
    const isDarkModePreferred = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const noModeSelected = (this.themeHandler.getTheme() === null);
    if (noModeSelected && isDarkModePreferred) {
      this.isDarkMode = true;
    } else {
      this.isDarkMode = (this.themeHandler.getTheme() === 'Dark');
    }
  }

  storeThemeSelection(): void {
    const theme = this.isDarkMode ? 'Dark' : 'Light';
    const containerClassList = this.overlayContainer.getContainerElement().classList;

    if (!this.isDarkMode) {
      containerClassList.remove(DARK_THEME_MODE_CLASS);
    } else {
      containerClassList.add(DARK_THEME_MODE_CLASS);
    }

    this.themeHandler.updateTheme(theme);
  }

  setLanguage(lang): void {
    this.languageService.setLanguage(lang);
    this.siteLocale = lang;
  }
}
