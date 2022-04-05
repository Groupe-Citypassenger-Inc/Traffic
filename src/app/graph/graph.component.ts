import { Component, OnInit, ChangeDetectorRef, OnChanges, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { FormGroup, FormBuilder, Validators, FormControl, AbstractControl } from '@angular/forms';

import Chart from 'chart.js/auto';
import moment from 'moment';
import 'chartjs-adapter-moment';

import { throwError, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { LanguageService } from '../lingual_service/language.service';
import { AuthService } from '../auth_services/auth.service';
import { NotificationServiceService } from '../notification/notification-service.service';
import { ThemeHandlerService } from '../theme_handler/theme-handler.service';
import * as metricsConfig from '../../assets/json/config.metrics.json';
import { UNIT_INFORMATION, BACKGROUND_COLOR } from '../../data.constants';
import { GraphMethodsService } from './graph-methods.service';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

export interface UnitConversion {
  minute: number,
  hour: number,
  day: number,
}

export interface UserInformations {
  id: number,
  role: string,
  username: string,
}

export interface Params {
  [key: string]: any
}

interface Tooltip {
  switchCase?,
  port?,
  protocol?,
  src?,
  start?,
  dest?,
  duration?,
  format?,
  color?,
  value?,
  label?,
  unit?,
  date?,
}

export interface GraphRecords {
  [key: string]: GraphRecord,
}

export interface GraphRecord {
  m_chart: Chart,
  m_legend: {
    title: string,
    legends: string[],
    position: string,
  },
  m_hidden: boolean,
  m_request_IPs: [],
  m_selected_IPs: FormControl,
  m_request_services: [],
  m_selected_services: FormControl,
  m_chart_date_picker: string,
  m_stacked: boolean,
  m_tooltip: [],
  t_value: number,
  t_unit: string,
  t_date: AbstractControl,
  t_now: boolean,
}

@Component({
  selector: 'app-graph',
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.css'],
})

export class GraphComponent implements OnInit, OnChanges, OnDestroy {
  userInformation: UserInformations;
  userInfoSubscription: Subscription;
  formGroupControlsSubscription: Subscription;
  isMobile: boolean;

  queryList: Array<string> = [];
  paramsList: Params = {};
  lang: string = this.languageService.getLanguage();
  metricAlternativeName: any = this.languageService.metricAlternativeName;
  metricsConfig: any = (metricsConfig as any).default;

  prometheusApiUrl: string = environment.prometheusBaseApiUrl;

  baseUrl: string = '';
  baseUrlBuffer: string = '';
  boxSelected: string = null;
  password: string = '';
  group_name: string = '';
  groupRouter: string = '';

  defaultUpStartTime: number = -1 * 60 * 60 * 1000;
  defaultEndTime: any = 0;
  upStartTime: number = this.defaultUpStartTime;
  endTime: number = this.defaultEndTime;
  options: any;

  formGroup: FormGroup;
  graphs_records: GraphRecords = {};
  defaultValue: number = 1;
  defaultDate: Date = new Date();

  step: number = 1;
  min: number = 1;
  max: number = Infinity;
  wrap: boolean = true;
  now: boolean = true;
  color: string = 'primary';
  defaultUnit: 'minute' | 'hour' | 'day' = 'hour';
  unit: UnitConversion = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 27 * 60 * 60 * 1000,
  };
  unitSelect = new FormControl(false);

  isDarkMode: boolean = false;
  themeSubscription: Subscription;

  CRCTable: Array<number> = [];
  graphLegends = new Map();
  selectedDay: Date = new Date();
  maxDate: Date = new Date();

  constructor(
    private appRef: ChangeDetectorRef,
    private formBuilder: FormBuilder,
    private httpClient: HttpClient,
    public languageService: LanguageService,
    private auth: AuthService,
    private notification: NotificationServiceService,
    public themeHandler: ThemeHandlerService,
    private router: Router,
    private route: ActivatedRoute,
    private graphMethodsService: GraphMethodsService,
    private location: Location) {

    this.formGroup = this.formBuilder.group({
      defaultDate: [{ value: '', disabled: true }, Validators.required],
    });
    this.userInfoSubscription = this.auth.logUserInfoChange.subscribe((userInfo: UserInformations) => {
      this.userInformation = userInfo;
    });
    this.themeSubscription = this.themeHandler.themeChanges.subscribe((theme) => {
      this.isDarkMode = theme === 'Dark' ? true : false;
      this.change_theme(this.isDarkMode);
      this.regenerate_all_graph();
    });
    this.isDarkMode = this.themeHandler.getTheme() === 'Dark' ? true : false;
    moment.locale(this.lang);
  }

  ngOnInit(): void {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      this.isMobile = true;
    } else {
      this.isMobile = false;
    }
    this.userInformation = this.auth.userInfo;
    this.getUserMetrics();

    this.defaultDate.setHours(this.defaultDate.getHours());

    const paramMap = this.route.snapshot.paramMap;
    this.groupRouter = paramMap.get('router');
    this.password = paramMap.get('password');
    this.boxSelected = paramMap.get('box_name');
    this.group_name = paramMap.get('group_name');

    this.route.queryParams.subscribe(params => this.paramsList = params);
    this.queryList = this.paramsList.metric;

    if (typeof this.queryList === 'string') {
      this.queryList = [this.queryList];
      this.paramsList = this.mapObjectValueToArray(this.paramsList);
    }

    if (this.password === null || this.group_name === null || this.queryList === undefined) {
      if (this.lang === 'fr') {
        this.notification.show_notification('Veuillez sélectionner des données à visualiser.', 'Ok', 'error');
      } else {
        this.notification.show_notification('Please select data to visualize.', 'Ok', 'error');
      }
      this.router.navigate(['/select']);
    }

    this.baseUrl = '/' + this.password + '/prometheus/' + this.group_name + '/api/v1';
    this.baseUrlBuffer = '/' + this.password + '/prometheus/' + this.group_name + '/api/v1';
    this.prometheusApiUrl = this.prometheusApiUrl.replace('XXXX', this.groupRouter);

    this.get_records(this.queryList);
    this.set_charts();
  }

  ngOnChanges(): void {
    this.destroy_all();
    this.ngOnInit();
    this.get_records(this.queryList);
    this.appRef.detectChanges();
    this.generate_all_graph();
  }

  ngOnDestroy(): void {
    this.userInfoSubscription.unsubscribe();
    this.themeSubscription.unsubscribe();
    if (this.formGroupControlsSubscription !== undefined) {
      this.formGroupControlsSubscription.unsubscribe();
    }
  }

  get_records(queryList: Array<string>): void {
    queryList.forEach((query, index) => {
      let date = new Date(this.paramsList.date[index]);
      this.graphs_records[query] = {
        m_chart: 'chart',
        m_legend: {
          title: '',
          legends: [],
          position: 'bottom',
        },
        m_hidden: false,
        m_request_IPs: [],
        m_selected_IPs: new FormControl(),
        m_request_services: [],
        m_selected_services: new FormControl(),
        m_chart_date_picker: 'range_type',
        m_stacked: false,
        m_tooltip: [],
        t_value: +this.paramsList.value[index],
        t_unit: this.paramsList.unit[index],
        t_date: this.formBuilder.control({
          value: date,
          disabled: false,
        }),
        t_now: this.paramsList.now[index] === 'true',
      };
      this.formGroup.addControl(query, this.graphs_records[query].t_date);
      this.formGroupControlsSubscription = this.formGroup.controls[query].valueChanges.subscribe(newDate => {
        this.date_changes(newDate, query);
      });
    });
  }

  mapObjectValueToArray(object) {
    const newObject = {};
    Object.keys(object).forEach((key) => {
      if (key === 'metric') return;
      newObject[key] = [object[key]];
    });
    return newObject;
  }

  getUserMetrics(): void {
    const headers = new HttpHeaders().set('Content-Type', 'application/json').set('Accept', 'application/json');
    let userConfigBaseUrl = '/traffic/' + this.lang + '/assets/json/';
    let userConfigUrl = userConfigBaseUrl + this.userInformation.username + '.json.nousNeVoulousPlusDeConfigPerso';

    this.httpClient.get<any>(userConfigUrl, { headers })
      .pipe(
        catchError((err => {
          console.error('Handling error locally and rethrowing it...', err);
          return throwError(err);
        })),
      )
      .subscribe(customConfig => { // replace the file if the user has a custom configuration
        this.metricsConfig = customConfig;
      }, () => { // No custom conf
        this.metricsConfig = (metricsConfig as any).default;
      });
  }

  set_charts(): void {
    this.queryList.forEach(query => {
      this.get_metric_from_prometheus(query);
    });
  }

  generate_all_graph(): void {
    this.get_records(this.queryList);
    this.set_charts();
  }

  destroy_all(): void {
    Chart.helpers.each(Chart.instances, function (instance) {
      instance.chart.destroy();
    });
  }

  update_all(): void {
    Chart.helpers.each(Chart.instances, function (instance) {
      instance.chart.update();
    });
  }

  regenerate_all_graph(): void {
    this.destroy_all();
    this.generate_all_graph();
  }

  regenerate(id: string): void {
    const grm = this.graphs_records[id];
    grm.m_chart.destroy();
    this.get_metric_from_prometheus(id);
  }

  transform_metric_query(metricName: string, box: string): string {
    let query: string = metricName;
    if (box !== null) {
      query = metricName + '%7Bjob=~%22' + box + '.*%22%7D';
    }
    const scrapeInterval = 2; //scrape interval => 2min
    const range = scrapeInterval * 4; //safe 

    if (this.metricsConfig.includes(metricName) === false) return query;

    const type = this.metricsConfig[metricName]?.type; // TODO ? should help delete L-2
    switch (type) {
      case 'range_vectors':
        return this.metricsConfig[metricName].promql + '(' + query + '[' + range + 'm])';
      case 'instant_vectors':
      case 'multi_query':
        return this.metricsConfig[metricName].promql + '(' + query + ')';
    }
    return query;
  }

  getMetricTimes(grm: GraphRecord, timestamp: number, chartType: string): [number, number] {
    const tValue: number = grm.t_value;
    const tUnit: string = grm.t_unit;

    let startTime: number;
    let endTime: number;

    if (chartType === 'horizontal_bar') {
      startTime = new Date(this.selectedDay).setHours(0, 0, 0, 0) / 1000;
      endTime = new Date(this.selectedDay).setHours(24, 0, 0, 0) / 1000;
    } else if (grm.t_now === false) {
      const date: Date = grm.t_date.value;
      const selectedDateTimestamp = date.getTime();
      const currentTimestamp = this.defaultDate.getTime();
      endTime = (timestamp + (currentTimestamp - selectedDateTimestamp) * -1) / 1000;
      startTime = -1 * tValue * this.unit[tUnit] / 1000 + endTime;
    } else {
      endTime = timestamp / 1000;
      startTime = -1 * tValue * this.unit[tUnit] / 1000 + endTime;
    }

    return [startTime, endTime];
  }

  private getMetricInfos(customMetric, metric) {
    let chartType = '';
    let query = '';
    Object.keys(customMetric).forEach(vector_type => {
      if (metric in customMetric[vector_type]) {
        chartType = customMetric[vector_type][metric].chart_type;
        this.graphs_records[metric].m_chart_date_picker = customMetric[vector_type][metric].chart_date_picker;
        query = '/query_range?query=' + customMetric[vector_type][metric].query;
        if (this.boxSelected !== null) {
          let boxFilter: string = 'job=~"' + this.boxSelected + '.*"';
          query = query.split('<box_filter>').join(boxFilter);
        } else {
          query = query.split('<box_filter>').join('');
        }
      }
    });
    return [chartType, query];
  }

  private queryAddTimeAndStep(query: string, metric: string, startTime: number, endTime: number, step: number): [string, string] {
    if (query === '') {
      metric = this.transform_metric_query(metric, this.boxSelected);
      if (metric.includes('_raw')) {
        metric = metric.replace('_raw', '');
      }
      query = '/query_range?query=' + metric + '&start=' + startTime + '&end=' + endTime + '&step=' + step;
    } else {
      query = query + '&start=' + startTime + '&end=' + endTime + '&step=' + step;
    }
    return [query, metric];
  }

  private createURL(query, metric, customMetric, startTime, timestamp): string {
    let url = this.prometheusApiUrl;
    let $t = timestamp / 1000 - 3600 * 6;

    if ($t >= startTime) return url + this.baseUrl + query;
    if (metric in customMetric.multi_query) return url + this.baseUrl + query;
    return url + this.baseUrlBuffer + query;
  }

  private async fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to get data');
    return response.json();
  }

  private parseData(response, rawMetricName, chartType, startTime, endTime, step) {
    const grm: GraphRecord = this.graphs_records[rawMetricName];
    if (response.status !== 'success') {
      if (this.lang === 'fr') {
        this.notification.show_notification('Une erreur est survenue lors de la communication avec prometheus', 'Fermer', 'error');
      } else {
        this.notification.show_notification('An error occurred while communicating with prometheus.', 'Close', 'error');
      }
      throw new Error('Request to prom : not successful');
    }

    if (chartType === 'horizontal_bar') {
      const parsedData = this.parse_response_bar(response, rawMetricName);
      grm.m_chart = this.chart_builder(rawMetricName, parsedData);
    }

    if (chartType === 'line') {
      const dataCompletedToParse = this.completeResponse(response.data.result, startTime, endTime, step);
      const parsedData = this.parse_response_line(dataCompletedToParse, rawMetricName);
      grm.m_chart = this.chart_builder(rawMetricName, parsedData);

      this.keep_legend_visibility(rawMetricName, grm.m_chart);

      const labels = grm.m_chart.options.plugins.legend.labels.generateLabels(grm.m_chart);
      this.graphLegends.set(rawMetricName, labels);

      this.showLegendSelected(rawMetricName);
      this.stack_lines(grm);
    }
  }

  async get_metric_from_prometheus(metric: string): Promise<void> {
    let rawMetricName = metric;
    let customMetric = this.metricsConfig.custom_metric;
    let [chartType, query] = this.getMetricInfos(customMetric, metric);

    const timestamp = this.selectedDay.getTime();
    let [startTime, endTime] = this.getMetricTimes(this.graphs_records[metric], timestamp, chartType);
    let step = chartType === 'horizontal_bar' ? 200 : this.set_prometheus_step(startTime, endTime);

    [query, metric] = this.queryAddTimeAndStep(query, metric, startTime, endTime, step);

    const url = this.createURL(query, metric, customMetric, startTime, timestamp);
    const response = await this.fetchData(url);
    this.parseData(response, rawMetricName, chartType, startTime, endTime, step);
  }

  get_extra_labels(response: any): Array<string> {
    delete response.__name__;
    delete response.instance;
    let extraLabel = Object.keys(response);
    return extraLabel;
  }

  private completeMissingStart(currentDataset, completedDataset, startTime, step) {
    const firstTime = currentDataset[0][0];
    if (firstTime > startTime) {
      let missingStepsBefore = (firstTime - startTime) / step;
      for (let i = missingStepsBefore; i > 0; i--) {
        const missingTime = firstTime - (i * step);
        completedDataset.push([missingTime, 'NaN']);
      }
    }
    return completedDataset;
  }

  private completeMissingMiddle(currentDataset, completedDataset, step) {
    for (let i = 0; i < currentDataset.length - 1; i++) {
      const firstTime = currentDataset[i][0];
      let secondTime = currentDataset[i + 1][0];
      let missingSteps = (secondTime - firstTime - step) / step;
      completedDataset.push(currentDataset[i]);
      for (let j = 1; j <= missingSteps; j++) {
        const missingTime = firstTime + (j * step);
        completedDataset.push([missingTime, 'NaN']);
      }
    }
    return completedDataset;
  }

  private completeMissingEnd(currentDataset, completedDataset, endTime, step) {
    let tabLength = currentDataset.length - 1;
    const lastTime = currentDataset[tabLength][0];
    if (lastTime < endTime) {
      let missingStepsAfter = (endTime - lastTime) / step;
      for (let i = 1; i <= missingStepsAfter; i++) {
        const missingTime = lastTime + (i * step);
        completedDataset.push([missingTime, 'NaN']);
      }
    }
    return completedDataset;
  }

  // Add NaN value where no value exist inside data_to_complete
  completeResponse(data_to_complete, startTime, endTime, step) {
    data_to_complete.forEach(dataset => {
      let currentDataset = dataset.values;
      let completedDataset = [];

      completedDataset = this.completeMissingStart(currentDataset, completedDataset, startTime, step);
      completedDataset = this.completeMissingMiddle(currentDataset, completedDataset, step);
      dataset.values = this.completeMissingEnd(currentDataset, completedDataset, endTime, step);
    });
    return data_to_complete;
  }

  addSrcIpToRequestedIps(request_IPs, src_ip, metric): void {
    if (src_ip === undefined) return;
    if (request_IPs.includes(src_ip)) return;

    request_IPs.push(src_ip);

    if (src_ip === '0.0.0.0') {
      this.graphs_records[metric].m_selected_IPs = new FormControl([src_ip]);
    }
  }

  addServiceToRequestedServices(request_services, service) {
    if (service === undefined) return;
    if (false === request_services.includes(service)) {
      request_services.push(service);
    }
  }

  parse_response_line(data_to_parse: any, metric: string): Object {
    let datasets = [];
    let metricTimestampList = [];
    let customMetric = this.metricsConfig.custom_metric;
    let requestIPs = this.graphs_records[metric].m_request_IPs;
    let requestServices = this.graphs_records[metric].m_request_services;

    for (const dataKey in data_to_parse) {
      let metricData;
      if (metric in customMetric.instant_vectors) {
        metricData = customMetric.instant_vectors[metric];
      } else if (metric in customMetric.range_vectors) {
        metricData = customMetric.range_vectors[metric];
      } else if (metric in customMetric.multi_query) {
        metricData = customMetric.multi_query[metric];
      }

      let metricValueList = [];
      data_to_parse[dataKey].values.forEach(value => {
        metricTimestampList.push(value[0] * 1000); //Chartjs need ms timestamp to work correctly
        metricValueList.push(value[1]);
      });

      let srcIp = data_to_parse[dataKey].metric.src_ip;
      this.addSrcIpToRequestedIps(requestIPs, srcIp, metric);

      let service = data_to_parse[dataKey].metric.service;
      this.addServiceToRequestedServices(requestServices, service);

      // Match data values with separator and select proper label template
      // Then replace template with metric values
      let separatorIndex = 0;
      metricData.metric_separator.forEach((element, index_x) => {
        if (Object.values(data_to_parse[dataKey].metric).includes(element)) {
          separatorIndex = index_x;
        }
      });
      let labelPartToReplace = metricData.legend_text_to_replace[separatorIndex];
      let label = metricData.metric_legend[separatorIndex];
      for (let labelKey of Object.keys(labelPartToReplace)) {
        let value = labelPartToReplace[labelKey];
        let replaceBy = data_to_parse[dataKey].metric[value];
        label = label.replace(labelKey, replaceBy);
      }
      let yAxisId = Object.keys(metricData.y_axis_scales);
      let yAxisID = yAxisId[separatorIndex];

      let dataset = {
        label: label,
        data: metricValueList,
        yAxisID: yAxisID,
        pointRadius: 1, // Graph dot size : 0 -> no dot
        borderColor: '#' + this.crc32(label), // Line color
        backgroundColor: '#' + this.crc32(label), // Legend color
        src_ip: srcIp,
        service: service,
      };
      datasets.push(dataset);
    }
    this.graphs_records[metric].m_selected_services = new FormControl(requestServices);
    let parsedData = {
      labels: metricTimestampList,
      datasets: datasets,
    };
    return parsedData;
  }

  parse_response_bar(data_to_parse, metric) {
    let customMetric = this.metricsConfig.custom_metric;
    let metricData;
    if (metric in customMetric.instant_vectors) {
      metricData = customMetric.instant_vectors[metric];
    } else if (metric in customMetric.range_vectors) {
      metricData = customMetric.range_vectors[metric];
    } else if (metric in customMetric.multi_query) {
      metricData = customMetric.multi_query[metric];
    }

    let legendTitle = this.GetDefaultOrCurrent(metricData.legend_title, '');
    let numberOfElementToShow = this.GetDefaultOrCurrent(metricData.number_of_element_to_show, 5);

    this.sort_bandwidth_connection_volume(data_to_parse.data.result);

    let datasets = [];
    let labels = [];
    let dataset = this.initDatasetBar();
    let srcIpList = [];
    let dataIndex = 0;

    // Fill dataset, stop when full or no more data
    while (labels.length < numberOfElementToShow && data_to_parse.data.result.length > dataIndex) {
      let dataElement = data_to_parse.data.result[dataIndex];
      let value = dataElement.values[0][1]; // metric bytes volume
      let elementMetric = dataElement.metric;
      dataIndex++;

      // reduce of 5 000 000 / (30 * 60) as number of stuff in 30 mn < 5Mo
      if (value < elementMetric.age * 2_777) {
        continue;
      }
      this.addElementToDataset(value, elementMetric, srcIpList, labels, dataset);
    }
    datasets.push(dataset);

    this.graphs_records[metric].m_legend.title = legendTitle;
    this.graphs_records[metric].m_legend.legends = dataset.legend;

    let parsedData = { labels, datasets };
    return parsedData;
  }

  makeCRCTable(): Array<any> {
    let c;
    let crcTable = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      crcTable[n] = c;
    }
    this.CRCTable = crcTable;
    return crcTable;
  }

  showLegendSelected(metric) {
    const grm = this.graphs_records[metric];
    const glm = this.graphLegends.get(metric);
    const selectedServices = grm.m_selected_services.value;
    const selectedIPs = grm.m_selected_IPs.value;
    const metricLegendsToDisplay = [];
    const datasets = grm.m_chart.data.datasets;

    glm.forEach((legend, index) => {
      const srcIp = datasets[index].src_ip;
      const service = datasets[index].service;
      legend.cursor = 'pointer';
      if (srcIp === undefined) { // always show legend if there is no IP
        metricLegendsToDisplay.push(legend);
        grm.m_chart.setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      } else if (service === undefined) { // always show legend if there is no service
        metricLegendsToDisplay.push(legend);
        grm.m_chart.setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      } else if (false === selectedIPs?.includes(srcIp)) {
        grm.m_chart.setDatasetVisibility(legend.datasetIndex, false);
        legend.hidden = true;
      } else if (false === selectedServices.includes(service)) {
        grm.m_chart.setDatasetVisibility(legend.datasetIndex, false);
        legend.hidden = true;
      } else {
        metricLegendsToDisplay.push(legend);
        grm.m_chart.setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      }
    });

    // this.graph_legends_to_display.set(metric, metric_legends_to_display);
    this.graphs_records[metric].m_legend.legends = metricLegendsToDisplay;
    grm.m_chart.update();
  }

  crc32(str: string): string {
    let crcTable;
    if (this.CRCTable = []) {
      crcTable = this.makeCRCTable();
    } else {
      crcTable = this.CRCTable;
    }

    let crc = 0 ^ (-1);

    for (let i = 0; i < str.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    let tmpColor = Math.abs(((crc ^ (-1)) >>> 0)).toString(16);
    tmpColor += '000000'; // tmpColor.length has to be 6 or above
    return tmpColor.substring(0, 6);
  }

  // Compute a step for range_query (interval between 2 points in second)
  // Min step: 1s
  // Default: 1 step every 15px
  set_prometheus_step(start: number, end: number): number {
    const secondDuration = (end - start);
    let chartWidth = window.innerWidth;
    let step: number;
    step = Math.floor(secondDuration / chartWidth) * 5;

    if (step === 0) {
      step = 50;
    }

    return step;
  }

  GetDefaultOrCurrent(value, defaultValue) {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    return value;
  }

  getArrayMaxValue(array, array_max_value) {
    let reducer = (current_max, current_value) => {
      if (isNaN(current_value)) {
        return current_max;
      }
      return Math.max(current_max, current_value);
    };
    array_max_value = array.reduce(reducer, array_max_value);
    return array_max_value;
  }

  rewriteYAxisMaxValue(max_value_raw) {
    if (max_value_raw === 0) {
      return 1;
    }
    let length = Math.ceil(max_value_raw).toString().length;
    let addOrRemoveDigits = 10 ** (length - 1);
    let maxValueRewrite = max_value_raw / addOrRemoveDigits;
    maxValueRewrite = Math.ceil(maxValueRewrite / .5) * .5;
    maxValueRewrite = maxValueRewrite * addOrRemoveDigits;
    return maxValueRewrite;
  }

  // for each keyword in keyword_to_replace
  // replace the keyword of new_label by the value of old_label
  replaceLabel(element, new_label, keyword_to_replace) {
    for (const [key, value] of Object.entries(keyword_to_replace)) {
      if (element[value + ''] !== undefined) {        // [value] : type unknown | [value+''] : type string
        new_label = new_label.replaceAll(key, element[value + '']);
        continue;
      }
      let getOldLabelValue = element.label.split(value)[1];
      getOldLabelValue = getOldLabelValue.split(' }')[0];
      new_label = new_label.replaceAll(key, getOldLabelValue);
    }
    return new_label;
  }

  private getMetricData(metric) {
    let customMetric = this.metricsConfig.custom_metric;

    if (metric in this.metricsConfig) return this.metricsConfig[metric];
    if (metric in customMetric.instant_vectors) return customMetric.instant_vectors[metric];
    if (metric in customMetric.multi_query) return customMetric.multi_query[metric];
  }

  private createChartConfig(metricData, metric, data) {
    // Set chart interface & interaction according to type
    let type = 'line';
    let indexAxis = 'x';
    let interactionMode = 'index';
    let interactionIntersect = false;
    let chartType = this.GetDefaultOrCurrent(metricData.chart_type, '');
    if (chartType === 'horizontal_bar') {
      type = 'bar';
      indexAxis = 'y';
      interactionMode = 'nearest';
      interactionIntersect = true;
    }

    this.createFollowCursorTooltipPositioner();

    let customTooltip = this.GetDefaultOrCurrent(metricData.custom_tooltip, '');
    let tooltipCallbacks = this.createTooltipCallbacks(customTooltip);

    const config = {
      type: type,
      data: data,
      options: {
        indexAxis: indexAxis,
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          filler: {
            propagate: false,
          },
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
            position: 'followCursor',
            callbacks: tooltipCallbacks,
            external: (context) => {
              this.graphs_records[metric].m_tooltip = context.tooltip;
            },
          },
        },
        elements: {
          line: {
            borderWidth: 2,
            tension: 0, // Use this to curve the lines, 0 means straight line
          },
          bar: {
            borderWidth: 0,
          },
        },
        interaction: {
          mode: interactionMode,
          intersect: interactionIntersect,
        },
      },
    };

    return [type, config];
  }

  chart_builder(metric: string, data: Object): Chart {
    const metricData = this.getMetricData(metric);
    let [type, config] = this.createChartConfig(metricData, metric, data);

    if (type === 'bar') {
      config = this.createBarChartScales(config, metricData);
    } else if (type === 'line') {
      config = this.createLineChartScales(config, metricData, data);
    }

    let canvas = <HTMLCanvasElement>document.getElementById(metric);
    if (canvas === null) {
      console.warn("No canvas with id : '" + metric + "' found on the page!");
      console.warn('Have you changed the value of metric?');
      return;
    }
    let ctx = canvas.getContext('2d');
    let chart = new Chart(ctx, config);
    return chart;
  }

  // Show/Hide legend and curve on click
  switch_visibility_legend(legend, metric_chart) {
    metric_chart.setDatasetVisibility(legend.datasetIndex, !metric_chart.isDatasetVisible(legend.datasetIndex));
    legend.hidden = !legend.hidden;
    metric_chart.update();
  }

  keep_legend_visibility(metric, chart) {
    let legends = this.graphLegends.get(metric);
    if (legends !== undefined) {
      legends.forEach(legend => {
        chart.setDatasetVisibility(legend.datasetIndex, !legend.hidden);
      });
    }
    chart.update();
  }

  incrementValue(query: string, step: number = 1): void {
    let inputValue = this.graphs_records[query].t_value + step;
    if (this.wrap) {
      inputValue = this.wrappedValue(inputValue);
    }
    this.graphs_records[query].t_value = inputValue;
    this.time_value_changes(query);
  }

  private wrappedValue(inputValue): number {
    if (inputValue > this.max) {
      return this.min + inputValue - this.max;
    }
    if (inputValue < this.min) {
      if (this.max === Infinity) {
        return this.min;
      }
      return this.max + inputValue;
    }
    return inputValue;
  }

  unit_selection_changes(query: string): void {
    const tValue = this.graphs_records[query].t_value;
    const tUnit = this.graphs_records[query].t_unit;
    this.upStartTime = -1 * tValue * this.unit[tUnit] + this.endTime;
    this.regenerate(query);
    this.update_url();
  }

  time_value_changes(query: string): void {
    const tValue = this.graphs_records[query].t_value;
    const tUnit = this.graphs_records[query].t_unit;
    this.upStartTime = -1 * tValue * this.unit[tUnit] + this.endTime;
    this.regenerate(query);
    this.update_url();
  }

  date_changes(date: Date, query: string): void {
    this.defaultDate = new Date();
    let currentTimestamp = this.defaultDate.getTime();
    let selectedDateTimestamp = date.getTime();

    this.endTime = (currentTimestamp - selectedDateTimestamp) * -1;

    const tValue = this.graphs_records[query].t_value;
    const tUnit = this.graphs_records[query].t_unit;

    this.upStartTime = -1 * tValue * this.unit[tUnit] + this.endTime;

    if (currentTimestamp < selectedDateTimestamp) {
      this.endTime = 0;
      this.upStartTime = -1 * tValue * this.unit[tUnit];
      this.formGroup.controls[query].setValue(this.defaultDate);
      if (this.lang === 'fr') {
        this.notification.show_notification(
          'La date choisie ne doit pas se situer dans le futur. Date sélectionnée : '
          + date.toLocaleDateString('fr-FR') + ' '
          + date.toLocaleTimeString('fr-FR'),
          'Ok',
          'error',
        );
      } else {
        this.notification.show_notification(
          'The selected date must not be in the future. Selected date : '
          + date.toLocaleDateString('en-US') + ' '
          + date.toLocaleTimeString('en-US'),
          'Ok',
          'error',
        );
      }
    }
    this.regenerate(query);
    this.update_url();
  }

  shouldDisableDecrement(inputValue: number): boolean {
    return !this.wrap && inputValue <= this.min;
  }

  shouldDisableIncrement(inputValue: number): boolean {
    return !this.wrap && inputValue >= this.max;
  }

  on_slide_toggle_change($event: MatSlideToggleChange, query: string): void {
    if ($event.checked) {
      const tValue = this.graphs_records[query].t_value;
      const tUnit = this.graphs_records[query].t_unit;
      this.upStartTime = -1 * tValue * this.unit[tUnit];
      this.endTime = 0;
      this.regenerate(query);
    }
    this.update_url();
  }

  set_default_settings(query: string): void {
    this.upStartTime = this.defaultUpStartTime;
    this.endTime = this.defaultEndTime;
    this.graphs_records[query].t_value = this.defaultValue;
    this.graphs_records[query].t_unit = 'hour';
    this.graphs_records[query].t_now = true;
    this.regenerate(query);
    this.update_url();
  }

  hide_lines(metric: string): void {
    let isDisabled: boolean = this.graphs_records[metric].m_hidden;
    this.graphs_records[metric].m_chart.data.datasets.forEach((dataSet, i) => {
      let meta = this.graphs_records[metric].m_chart.getDatasetMeta(i);
      if (meta.hidden === null) {
        meta.hidden = isDisabled;
      }
      meta.hidden = !isDisabled;
    });
    this.graphs_records[metric].m_hidden = !isDisabled;
    this.graphLegends.get(metric).forEach(element => {
      element.hidden = !isDisabled;
    });
    this.graphs_records[metric].m_chart.update();
  }

  isLinesStackable(grm) {
    return grm.m_chart?.data?.datasets.some(element => element.yAxisID === 'yStacked');
  }

  switch_stack_lines(grm) {
    grm.m_chart.options.scales.yStacked.stacked = !grm.m_chart.options.scales.yStacked.stacked;
    this.stack_lines(grm);
  }

  stack_lines(grm: GraphRecord): void {
    let isStacked: boolean = grm.m_chart.options.scales.yStacked.stacked;
    grm.m_stacked = isStacked;

    grm.m_chart.data.datasets.forEach(element => {
      if (element.yAxisID === 'yStacked') {
        element.fill = isStacked ? 'origin' : false;
      }
    });

    grm.m_chart.update();
  }

  change_theme(dark_theme: boolean): void {
    if (dark_theme) {
      Chart.defaults.global.defaultFontColor = 'white';
    } else {
      Chart.defaults.global.defaultFontColor = 'black';
    }
    Chart.helpers.each(Chart.instances, function (instance) {
      instance.chart.update();
    });
  }

  delete(query: string): void {
    delete this.graphs_records[query];
    this.update_url();
  }

  update_url(): void {
    if (Object.keys(this.graphs_records).length === 0) {
      this.router.navigateByUrl('/select');
    } else {
      let url: string;
      if (this.boxSelected === null) {
        url = '/graph/' + this.group_name + '/' + this.groupRouter + '/' + this.password + '/metric?';
      } else {
        url = '/graph/' + this.group_name + '/' + this.groupRouter + '/' + this.password + '/' + this.boxSelected + '/metric?';
      }

      Object.keys(this.graphs_records).forEach((metric, index) => {
        if (Object.keys(this.graphs_records).length - 1 === index) {
          url = url + 'metric=' + metric
            + '&value=' + this.graphs_records[metric].t_value
            + '&unit=' + this.graphs_records[metric].t_unit
            + '&now=' + this.graphs_records[metric].t_now
            + '&date=' + this.graphs_records[metric].t_date.value.toISOString();
        } else {
          url = url + 'metric=' + metric
            + '&value=' + this.graphs_records[metric].t_value
            + '&unit=' + this.graphs_records[metric].t_unit
            + '&now=' + this.graphs_records[metric].t_now
            + '&date=' + this.graphs_records[metric].t_date.value.toISOString() + '&';
        }
      });

      this.router.navigateByUrl(url);
    }
  }

  back_to_selection(): void {
    this.router.navigate(['/select']);
  }


  isString(value) {
    return typeof value === 'string';
  }

  // Create object for view rendering
  addLineToTooltipField(line_type, current_metric, element) {
    let tooltipLine: Tooltip = {
      switchCase: line_type,
    };
    switch (line_type) {
      case 'Port':
        tooltipLine.port = current_metric.dst_port;
        break;
      case 'Protocol':
        tooltipLine.protocol = current_metric.proto;
        break;
      case 'Src_To_Dest':
        tooltipLine.src = current_metric.src_ip;
        tooltipLine.dest = current_metric.dst_ip;
        break;
      case 'Start_Duration':
        tooltipLine.start = (current_metric.endTime - current_metric.age) * 1000;
        tooltipLine.duration = current_metric.age;
        tooltipLine.format = 'LLL';
        tooltipLine.color = element.dataset.backgroundColor[element.dataIndex];
        break;
      case 'Volume':
        tooltipLine.value = element.raw;
        tooltipLine.label = element.dataset.label;
        tooltipLine.unit = 'bytes';
        break;
      case 'Time':
        tooltipLine.value = element.raw;
        tooltipLine.label = element.dataset.label;
        tooltipLine.unit = 'time';
        break;
      case 'Number':
        tooltipLine.value = element.raw;
        tooltipLine.label = element.dataset.label;
        tooltipLine.unit = 'number';
        break;
      case 'FullDate':
        tooltipLine.date = element.label;
        break;
      default:
        console.error(line_type + " doesn't match any case, you can visit ");
        break;
    }
    return tooltipLine;
  }

  createCustomTooltipField(tooltipItems, labels_config) {
    if (labels_config === undefined || labels_config.to_show === undefined) return;

    let tooltipSection = [];
    for (let i = 0; i < tooltipItems.length; i++) {
      let element = tooltipItems[i];
      let currentMetric;

      if (element.dataset.metric !== undefined) {
        currentMetric = element.dataset.metric[element.dataIndex];
      }
      labels_config.to_show.forEach(label => {
        tooltipSection.push(this.addLineToTooltipField(label, currentMetric, element));
      });
      if (labels_config.do_once) {
        break;
      }
    }
    return tooltipSection;
  }

  createTooltipCallbacks(custom_tooltip) {
    const beforeTitle = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.beforeTitle);
    };
    const title = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.title);
    };
    const afterTitle = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.afterTitle);
    };
    const beforeLabel = (context) => {
      return this.createCustomTooltipField([context], custom_tooltip.beforeLabel);
    };
    const label = (context) => {
      return this.createCustomTooltipField([context], custom_tooltip.label);
    };
    const afterLabel = (context) => {
      return this.createCustomTooltipField([context], custom_tooltip.afterLabel);
    };
    const beforeFooter = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.beforeFooter);
    };
    const footer = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.footer);
    };
    const afterFooter = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.afterFooter);
    };
    return {
      beforeTitle: beforeTitle,
      title: title,
      afterTitle: afterTitle,
      beforeLabel: beforeLabel,
      label: label,
      afterLabel: afterLabel,
      beforeFooter: beforeFooter,
      footer: footer,
      afterFooter: afterFooter,
    };
  }

  // track tooltip to keep it fully visible on screen regardless size and position
  createFollowCursorTooltipPositioner() {
    const tooltipPlugin = Chart.registry.getPlugin('tooltip');
    tooltipPlugin.positioners.followCursor = function (elements, eventPosition) {
      let xPos = 0;
      if (eventPosition.x > window.screen.width / 2) {
        xPos = eventPosition.x - (this.width / 2);
      } else {
        xPos = eventPosition.x + (this.width / 2);
      }
      return {
        x: xPos,
        y: eventPosition.y,
      };
    };
  }

  createBarChartScales(config, metric_data) {
    let yAxisTitle = this.GetDefaultOrCurrent(metric_data.y.title[this.lang], '');
    let xAxisTitle = this.GetDefaultOrCurrent(metric_data.x.title[this.lang], '');
    const xTicksCallback = (value) => {
      return this.graphMethodsService.addUnitToValue(value, 'bytes', this.lang);
    };

    config.options.scales = {
      x: {
        ticks: {
          callback: xTicksCallback,
        },
        title: {
          display: true,
          text: xAxisTitle,
        },
      },
      y: {
        stacked: true,
        title: {
          display: true,
          text: yAxisTitle,
        },
      },
    };
    return config;
  }

  createLineChartScales(config, metric_data, data) {
    let yAxisUnit = this.GetDefaultOrCurrent(metric_data.y.unit, '');
    let yAxisTitle = this.GetDefaultOrCurrent(metric_data.y.title[this.lang], '');
    let yAxisMin = this.GetDefaultOrCurrent(metric_data.y.min, 0);
    let yAxisScales = this.GetDefaultOrCurrent(metric_data.y_axis_scales, []);
    if (UNIT_INFORMATION.get(yAxisUnit) === undefined) {
      console.log(yAxisUnit + ' has no match in ' + UNIT_INFORMATION);
      console.log("Either the unit is misspelled or you need to add the unit in 'data.constants.ts'.");
      yAxisUnit = 'unknownName';
    }

    let dataLabels: Array<number> = data.labels;
    let dataSize = dataLabels.length;
    let start: number = dataLabels[0];
    let end: number = dataLabels[dataSize - 1];
    let delta: number = (end - start) / 1000;
    let xAxisFormat: string;
    let timeFormat: string;
    if (delta <= 10_800) { // <= 3h
      timeFormat = 'LT';
      xAxisFormat = 'minute';
    } else if (delta <= 86_400) { // <= 24h
      timeFormat = 'LT';
      xAxisFormat = 'hour';
    } else if (delta <= 259_200) { // <= 3j
      timeFormat = 'MM/DD (LT)';
      xAxisFormat = 'day';
    } else if (delta < 1_296_000) { // < 15j
      timeFormat = 'MM/DD';
      xAxisFormat = 'day';
    } else { // > 15j
      timeFormat = 'MM/DD';
      xAxisFormat = 'month';
    }

    config.options.scales = {
      x: {
        type: 'time',
        time: {
          unit: xAxisFormat,
        },
        ticks: {
          autoSkip: true,
          maxTicksLimit: 15,
          // Whe're using times[index].value because it's a timestamp
          // time only has hour:minutes
          callback: function (time, index, times) {
            let momentLabel = moment(times[index].value);
            let formatedLabel = momentLabel.format(timeFormat);
            return formatedLabel;
          },
        },
      },
    };

    let requestMaxValueRaw = 0;
    data.datasets.forEach(element => {
      requestMaxValueRaw = this.getArrayMaxValue(element.data, requestMaxValueRaw);
    });
    let ceiledRequestMaxValueY = this.rewriteYAxisMaxValue(requestMaxValueRaw);

    const yTicksCallback = (value) => {
      return this.graphMethodsService.addUnitToValue(value, yAxisUnit, this.lang);
    };

    // create y Axis scales : y & y_stackable
    for (const [scaleKey, scaleValue] of Object.entries(yAxisScales)) {
      config.options.scales[scaleKey] = {
        title: {
          display: true,
          text: yAxisTitle,
        },
        min: yAxisMin,
        max: ceiledRequestMaxValueY,
        ticks: {
          callback: yTicksCallback,
        },
      };
      for (const [optionsKey, optionsValue] of Object.entries(scaleValue)) {
        config.options.scales[scaleKey][optionsKey] = optionsValue;
      }
    }
    return config;
  }

  sort_bandwidth_connection_volume(datas) {
    datas.sort(function (a, b) {
      let resultA = a.values[0];
      let valueA = resultA[1];

      let resultB = b.values[0];
      let valueB = resultB[1];
      return valueB - valueA;
    });
  }

  addElementToDataset(value, metric, src_ip_list, labels, dataset) {
    let backgroundColor;
    let currentSrc = metric.src_ip;

    // add volume to dataset if src_ip already exist
    if (src_ip_list.includes(metric.src_ip)) {
      let index = src_ip_list.indexOf(currentSrc);
      backgroundColor = dataset.legend[index].fillStyle;
    } else { // create new dataset
      src_ip_list.push(currentSrc);
      let index = dataset.legend.length;
      backgroundColor = BACKGROUND_COLOR[index];
      let newLegend = {
        text: currentSrc,
        fillStyle: backgroundColor,
        cursor: 'unset',
      };
      dataset.legend.push(newLegend);
    }
    dataset.data.push(value);
    dataset.backgroundColor.push(backgroundColor);
    dataset.metric.push(metric);

    labels.push(metric.dst_ip);
  }

  initDatasetBar() {
    let newDataset = {
      label: 'Dataset',
      legend: [],
      unique_src_ips: [],
      data: [],
      backgroundColor: [],
      metric: [],
    };
    return newDataset;
  }
}
