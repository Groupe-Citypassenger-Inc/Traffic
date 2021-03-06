import { Component, Output, EventEmitter, HostListener, OnInit, Inject, isDevMode, HostBinding  } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OverlayContainer } from '@angular/cdk/overlay';
import { NavigationEnd, NavigationStart, Router, RoutesRecognized } from '@angular/router'; 
import { GraphComponent } from './graph/graph.component';
import { LoaderService } from './loader/loader.service';
import { environment } from '../environments/environment';
import { AuthService } from './auth_services/auth.service';
import { LanguageService } from './lingual_service/language.service'
import { ThemeHandlerService } from './theme_handler/theme-handler.service'
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from "@angular/platform-browser";
import { local } from 'd3';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { LogOutDialogComponent } from './dialog/log-out-dialog/log-out-dialog.component';
import { NotificationServiceService } from './notification/notification-service.service'
import { HistoryServiceService } from './history/history-service.service'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  _show_graph: boolean = false;
  is_logged: boolean = false;
  currentApplicationVersion = environment.appVersion;
  auth_status_subscription: Subscription;
  dialog_ref_subscription: Subscription;
  is_dev_mode: boolean = false;
  is_dark_mode_enabled: boolean = false;
  site_locale: string;
  language_list: Array<any>;
  _theme: string;

  previousUrl$ = new BehaviorSubject<string>(null);
  currentUrl$ = new BehaviorSubject<string>(null);
  
  constructor(
    private auth: AuthService, 
    public dialog: MatDialog, 
    private language: LanguageService, 
    private matIconRegistry: MatIconRegistry, 
    private domSanitizer: DomSanitizer,
    public overlayContainer: OverlayContainer,
    public theme_handler: ThemeHandlerService,
    private routerHistoryService: HistoryServiceService,
    private router: Router
  ) {    
    this.matIconRegistry.addSvgIcon(
      'fr_flag',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/images/fr.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'gb_flag',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/images/gb.svg')
    );
  }

  ngOnInit(): void {
    if( window.matchMedia('(prefers-color-scheme: dark)').matches && this.theme_handler.get_theme() === null) {
      this.is_dark_mode_enabled = true;
    } else if ( this.theme_handler.get_theme() === 'Dark' ) {
      this.is_dark_mode_enabled = true;
    } else {
      this.is_dark_mode_enabled = false;
    }
    this.store_theme_selection();


    this.language_list = this.language.language_list;
    this.is_dev_mode = isDevMode();
    this.is_logged = this.auth.is_auth;
    this.auth_status_subscription = this.auth.log_status_change.subscribe((status) => {
      this.is_logged = status;
    });
    this.site_locale = this.language.get_language();

  }

  ngOnDestroy(): void {
    this.auth_status_subscription.unsubscribe();
    this.dialog_ref_subscription.unsubscribe();
  }

  logout(): void  {
    const dialogRef = this.dialog.open(LogOutDialogComponent)
    this.dialog_ref_subscription = dialogRef.afterClosed().subscribe(result => {
    });
  }

  store_theme_selection(): void  {
    let theme = this.is_dark_mode_enabled ? 'Dark' : 'Light';
    this._theme = theme
    if ( !this.is_dark_mode_enabled ) {
      this.overlayContainer.getContainerElement().classList.remove('dark-theme-mode');
    } else {
      this.overlayContainer.getContainerElement().classList.add('dark-theme-mode');
    }
    this.theme_handler.update_theme(this._theme);
  }
}