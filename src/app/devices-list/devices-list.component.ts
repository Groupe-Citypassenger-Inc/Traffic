import { Component, OnInit, ViewChild, isDevMode, OnDestroy, AfterViewInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { throwError, Subscription } from 'rxjs';
import { catchError, timeout, map, take } from 'rxjs/operators';

/* Services import */
import { AuthService } from '../auth_services/auth.service';
import { NotificationServiceService } from '../notification/notification-service.service';
import { ThemeHandlerService } from '../theme_handler/theme-handler.service';
import { LanguageService } from '../lingual_service/language.service';

/* Data import */
import * as metricsConfig from '../../assets/json/config.metrics.json';
import { environment } from '../../environments/environment';
import { FormControl } from '@angular/forms';

/* Interfaces */
export interface UserInformations {
  id: number;
  role: string;
  username: string;
}
export interface TableDevicesInfo {
  group_name: string;
  display_name: string;
  box_name: string;
  box_display_name: string;
  address: string;
}
export interface DevicesInformations {
  [key: string]: any;
}

interface Columns {
  key: string,
  fr: string,
  en: string,
}

const COLUMNS_TO_DISPLAY = [
  {
    key: 'address',
    fr: 'Adresse',
    en: 'Address',
  },
  {
    key: 'display_name',
    fr: 'Nom de groupe',
    en: 'Group name',
  },
  {
    key: 'box_display_name',
    fr: 'Nom de boitier',
    en: 'Box name',
  },
];

@Component({
  selector: 'app-devices-list',
  templateUrl: './devices-list.component.html',
  styleUrls: ['./devices-list.component.css'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class DevicesListComponent implements OnInit, OnDestroy, AfterViewInit {
  metricsConfig: any = (metricsConfig as any).default;

  userInformation: UserInformations;
  lang: 'fr' | 'en' | string;
  isDarkMode: boolean;
  themeSubscription: Subscription;
  metricAlternativeName: any = this.languageService.metricAlternativeName;

  prometheusBaseApiUrl = environment.prometheusBaseApiUrl;

  devicesInformations: DevicesInformations = {};
  tableDevicesInformations: TableDevicesInfo[] = [];

  dataSource: MatTableDataSource<any>;
  expandedElement: TableDevicesInfo | null;

  columnsToDisplay: Columns[] = COLUMNS_TO_DISPLAY;
  columnsToDisplayKeys: string[] = this.columnsToDisplay.map((col) => col.key);

  // deadcode
  // _disabled_visualize_group_form = true;
  // graphs_box_form = new FormControl();
  // _disabled_visualize_box_form = true;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  constructor(
    private httpClient: HttpClient,
    private languageService: LanguageService,
    private auth: AuthService,
    public themeHandler: ThemeHandlerService,
    private router: Router,
    private notification: NotificationServiceService) {

    this.userInformation = this.auth.userInfo;
    this.lang = this.languageService.language;
    this.isDarkMode = localStorage.getItem('theme') === 'Dark' ? true : false;
    this.themeSubscription = this.themeHandler.themeChanges.subscribe((theme) => {
      this.isDarkMode = theme === 'Dark' ? true : false;
    });
  }

  ngOnInit(): void {
    this.getUserMetrics();
    this.getMapDevices();
    this.dataSource = new MatTableDataSource<any>(this.tableDevicesInformations);
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
  }

  ngAfterViewInit(): void {
    if (this.lang === 'fr') {
      this.paginator = this.languageService.translatePaginator(this.paginator);
    }
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  getMapDevices(): void {
    const mapDevicesApiUrl = '/ws/Map/Devices';
    this.httpClient.request('GET', mapDevicesApiUrl, {})
      .pipe(timeout(10000))
      .toPromise()
      .then(response => {
        if ('groups' in response) {
          this.devicesInformations = this.parseMapDevices(response);
          this.refresh_table();
        } else {
          throw new Error('Can get map device. Requested URI : ' + mapDevicesApiUrl);
        }
      });
  }

  parseMapDevices(mapDevices: any): DevicesInformations {
    const devicesInformations: DevicesInformations = {};

    for (const group of mapDevices.groups) {
      devicesInformations[group.groupName] = {
        group_id: group.groupId,
        display_name: group.displayName,
        router: group.router,
        group_metric: [],
        group_metric_backup: [],
        citynet_url: this.prometheusBaseApiUrl.replace('XXXX', group.router),
        form_control: new FormControl(''),
        form_disabled: true,
        visualize_disabled: true,
      };

      for (const sites of group.sites) {
        this.tableDevicesInformations.push({
          group_name: group.groupName,
          display_name: group.displayName,
          box_name: sites.siteName,
          box_display_name: sites.datas.displayedName,
          address: sites.datas.address,
        });

        devicesInformations[group.groupName][sites.siteName] = {
          box_name: sites.siteName,
          box_address: sites.datas.address,
          site_refer: sites.siteReferer,
          box_password: null,
          visualize_disabled: true,
          form_control: new FormControl(''),
        };
      }
    }

    return devicesInformations;
  }

  apply_filter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  on_row_click(row: TableDevicesInfo): void {
    const deviceInfo = this.devicesInformations[row.group_name];
    deviceInfo.form_disabled = (deviceInfo.group_metric === 0);

    if (this.expandedElement === null) return;

    if (deviceInfo[row.box_name].box_password === null) {
      this.getBoxPassword(row);
    } else if (deviceInfo.group_metric === 0) {
      this.getMetricList(row);
    } else {
      deviceInfo.form_disabled = false;
    }
  }

  getUserMetrics(): void {
    const headers = new HttpHeaders().set('Content-Type', 'application/json').set('Accept', 'application/json');
    const userConfigBaseUrl = '/traffic/' + this.lang + '/assets/json/';
    const userConfigUrl = userConfigBaseUrl + this.userInformation.username + '.json.nousNeVoulousPlusDeConfigPerso';

    this.httpClient
      .get<any>(userConfigUrl, { headers })
      .pipe(
        catchError((err) => {
          console.error('Handling error locally and rethrowing it...', err);
          return throwError(err);
        }),
      ).subscribe((customConfig) => { // replace the file if the user has a custom configuration
        this.metricsConfig = customConfig;
      }, () => { // No custom conf
        this.metricsConfig = (metricsConfig as any).default;
      });
  }

  getMetricList(row: TableDevicesInfo): void {
    const groupName: string = row.group_name;
    const boxName: string = row.box_name;

    let prometheusApiUrl: string;

    const boxPassword: string = this.devicesInformations[groupName][boxName].box_password;
    const citynetUrl: string = this.devicesInformations[groupName].citynet_url;
    prometheusApiUrl = citynetUrl + '/' + boxPassword + '/prometheus/' + groupName + '/api/v1/label/__name__/values';

    let headers = new HttpHeaders();
    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', prometheusApiUrl, { headers })
      .pipe(
        timeout(10000),
        map((res) => {
          return res;
        },
        ), catchError(
          err => {
            throw err;
          },
        ))
      .pipe(take(1))
      .subscribe((response: { data /*TODO */ }) => {
        const prometheusMetrics: Array<any> = response.data;
        this.parse_get_metric(prometheusMetrics, groupName);
        this.devicesInformations[row.group_name].form_disabled = false;
      }, err => {
        this.devicesInformations[row.group_name].form_disabled = true;
        if (this.lang === 'fr') {
          this.notification.show_notification('Une erreur est survenue lors de la communication avec prometheus, veuillez réessayer plus tard.', 'Fermer', 'error');
        } else {
          this.notification.show_notification('An error occurred while communicating with prometheus, please try again later.', 'Close', 'error');
        }
        console.error(err);
      });
  }

  private checkAccessAndAddMetric(metricList, metrics) {
    Object.keys(metrics).forEach(metric => {
      if (metrics[metric].role.includes(this.userInformation.role)) {
        metricList.push(metric);
      }
    });
  }

  parse_get_metric(prometheusMetrics: Array<any>, groupName: string): void {
    const metricList: Array<string> = [];
    const customMetric = this.metricsConfig.custom_metric;

    this.checkAccessAndAddMetric(metricList, customMetric.instant_vectors);
    this.checkAccessAndAddMetric(metricList, customMetric.range_vectors);
    this.checkAccessAndAddMetric(metricList, customMetric.multi_query);

    prometheusMetrics.forEach(metricName => {
      if (metricName in this.metricsConfig) {
        metricList.push(metricName);
      }
    });

    this.devicesInformations[groupName].group_metric = metricList;
    this.devicesInformations[groupName].group_metric_backup = metricList;
  }

  getBoxPassword(row: TableDevicesInfo): void {
    const groupId: number = this.devicesInformations[row.group_name].group_id;
    const groupName: string = row.group_name;
    const groupInfoApiUrl: string = '/ws/Group/Info/' + groupId;

    let headers: HttpHeaders = new HttpHeaders();
    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', groupInfoApiUrl, { headers })
      .pipe(timeout(10000))
      .toPromise()
      .then((response: { group /*TODO */ }) => {
        if (!('group' in response)) {
          throw new Error('Can get group info Requested URI : ' + groupInfoApiUrl);
        }
        Object.keys(response.group.ienaDevices).forEach(boxName => {
          this.devicesInformations[groupName][boxName].box_password =
            response.group.ienaDevices[boxName].localinterface_passwords.user;
        });
        this.getMetricList(row);
      });
  }

  refresh_table(): void {
    this.dataSource.data = this.dataSource.data;
  }

  onChangeGroupForm(event: Event, row: TableDevicesInfo): void {
    if (isDevMode()) { console.log(event); }
    const groupName = row.group_name;
    if (this.devicesInformations[groupName].form_control.value.length > 0) {
      this.devicesInformations[groupName].visualize_disabled = false;
    } else {
      this.devicesInformations[groupName].visualize_disabled = true;
    }
  }

  onChangeBoxForm(event: Event, row: TableDevicesInfo): void {
    if (isDevMode()) { console.log(event); }
    const groupName = row.group_name;
    const boxName = row.box_name;
    if (this.devicesInformations[groupName][boxName].form_control.value.length > 0) {
      this.devicesInformations[groupName][boxName].visualize_disabled = false;
    } else {
      this.devicesInformations[groupName][boxName].visualize_disabled = true;
    }
  }

  filterListCareUnit(val: any, groupName: string): void {
    this.devicesInformations[groupName].group_metric =
      this.devicesInformations[groupName].group_metric_backup.filter(unit => unit.indexOf(val) > -1);
  }

  visualize(groupName: string, boxName?: string): void {
    const devicesInformations: DevicesInformations = this.devicesInformations;
    const graphInformations: Array<any> = [];
    let password: string;
    let metricChecked: Array<string>;
    const router: string = devicesInformations[groupName].router;
    const citynetUrl: string = devicesInformations[groupName].citynet_url;
    let redirectUrl: string = '/graph/' + groupName + '/' + router + '/';

    if (boxName === undefined) {
      const key: string = Object.keys(devicesInformations[groupName]).pop();
      password = devicesInformations[groupName][key].box_password;
      metricChecked = devicesInformations[groupName].form_control.value;
      graphInformations.push([groupName, citynetUrl]);
      redirectUrl = redirectUrl + password + '/' + 'metric?';
    } else {
      password = devicesInformations[groupName][boxName].box_password;
      metricChecked = devicesInformations[groupName][boxName].form_control.value;
      graphInformations.push([groupName, citynetUrl, boxName]);
      redirectUrl = redirectUrl + password + '/' + boxName + '/metric?';
    }

    if (this.userInformation.role === 'Support' || this.userInformation.role === 'Admin') {
      metricChecked.forEach((metricName, index) => {
        if (metricName in this.metricsConfig) {
          if (this.metricsConfig[metricName].promql !== '') {
            metricChecked.splice(index + 1, 0, metricName + '_raw');
          }
        }
      });
    }

    const date = new Date();
    const dateString = date.toISOString();
    metricChecked.forEach((metric, index) => {
      graphInformations.push(metric);
      if (metricChecked.length - 1 === index) {
        redirectUrl = redirectUrl + 'metric=' + metric + '&value=1&unit=hour&now=true&date=' + dateString; //
      } else {
        redirectUrl = redirectUrl + 'metric=' + metric + '&value=1&unit=hour&now=true&date=' + dateString + '&'; //
      }
    });
    this.router.navigateByUrl(redirectUrl);
  }
}
