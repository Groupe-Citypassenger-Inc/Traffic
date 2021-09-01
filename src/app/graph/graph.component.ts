import { Component, OnInit, ChangeDetectorRef, isDevMode } from '@angular/core';
import { HttpClient, HttpHeaders }    from '@angular/common/http';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, timeout } from 'rxjs/operators';

import { _countGroupLabelsBeforeOption } from '@angular/material/core';

import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import Chart from 'chart.js/auto';
import moment from "moment";
import 'chartjs-adapter-moment';

import { throwError, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { LanguageService } from '../lingual_service/language.service';
import { AuthService } from '../auth_services/auth.service';
//import { LoaderService } from '../loader/loader.service';
import { NotificationServiceService } from '../notification/notification-service.service'
import { ThemeHandlerService } from '../theme_handler/theme-handler.service'
import * as metrics_config from '../../assets/json/config.metrics.json';
import { UNIT_INFORMATION } from '../../data.constants';

export interface unit_conversion {
  minute : number,
  hour : number,
  day : number,
}
export interface user_informations {
  id : number,
  role : string,
  username : string,
}
export interface params {
  [key: string]: any
}

@Component({
  selector: 'app-graph',
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.css']
})

export class GraphComponent implements OnInit {

  user_information: user_informations;
  user_info_subscription : Subscription;
  form_group_controls_subscription: Subscription;
  is_mobile: boolean;

  query_list: Array<string> = [];
  params_list: params = {};
  _lang: string = this.lingual.get_language();
  metric_alternative_name: any = this.lingual.metric_alternative_name;
  metrics_config: any = (metrics_config as any).default;
  is_dev: boolean = isDevMode();

  prometheus_api_url : string = environment.prometheus_base_api_url;

  base_url : string = '';
  base_url_buffer: string = '';
  box_selected : string = null;
  password: string = '';
  group_name : string = '';
  group_router: string = '';

  default_up_start_time : number = -1 * 60 * 60 * 1000;
  default_end_time : any = 0;
  up_start_time : number = this.default_up_start_time;
  end_time : number = this.default_end_time;
  start_date : Date;
  options : any;

  form_group: FormGroup;
  graphs_records : Object = {};
  default_value: number = 1;
  default_date: Date = new Date();

  _step: number = 1;
  _min: number = 1;
  _max: number = Infinity;
  _wrap: boolean = true;
  _now: boolean = true;
  color: string = 'primary';
  default_unit: 'minute' | 'hour' | 'day' = 'hour';
  _unit : unit_conversion = {
    minute : 60 * 1000,
    hour : 60 * 60 * 1000,
    day : 27 * 60 * 60 * 1000,
  }
  unit_select = new FormControl(false);

  _is_dark_mode_enabled: boolean = false;
  theme_subscription: Subscription;

  CRC_table:Array<number> = [];
  graph_legends = new Map();
  graph_legends_to_display = new Map();

  constructor(private appRef: ChangeDetectorRef,  
              private _formBuilder: FormBuilder, 
              private httpClient: HttpClient, 
              public lingual: LanguageService, 
              private auth: AuthService,
              private notification: NotificationServiceService,
              public theme_handler: ThemeHandlerService,
              private router: Router,
              private route: ActivatedRoute,
              private location:Location) {
    this.form_group = this._formBuilder.group({
      default_date: [{value: '', disabled: true }, Validators.required]
    });
    this.user_info_subscription = this.auth.log_user_info_change.subscribe((user_info:user_informations) => {
      this.user_information = user_info;
    });
    this.theme_subscription = this.theme_handler.theme_changes.subscribe((theme) => {
      this._is_dark_mode_enabled = theme === 'Dark' ? true : false;
      this.change_theme(this._is_dark_mode_enabled);
      this.regenerate_all_graph();
    });
    this._is_dark_mode_enabled = this.theme_handler.get_theme() === 'Dark' ? true : false;
    moment.locale(this._lang);
  }
  
  ngOnInit(): void {

    if ( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
      this.is_mobile = true;
    } else {
      this.is_mobile = false;
    }

    this.user_information = this.auth.user_info;
    this.get_user_metrics();

    this.default_date.setHours(this.default_date.getHours());

    let router = this.route.snapshot.paramMap.get('router');
    this.group_router = router;
    this.password = this.route.snapshot.paramMap.get('password');
    let box_name: string = this.route.snapshot.paramMap.get('box_name');
    this.group_name = this.route.snapshot.paramMap.get('group_name');
    this.query_list = this.route.queryParams['_value']['metric'];
    this.params_list = this.route.queryParams['_value'];

    if ( typeof this.query_list == 'string' ) {
      this.query_list = [this.query_list];
      this.params_list = {};
      Object.keys(this.route.queryParams['_value']).forEach(key =>{
        if ( key == 'metric') return;
        this.params_list[key] = [this.route.queryParams['_value'][key]];
      });
    }

    if ( this.password == null || this.group_name == null || this.query_list == undefined ) {
      if ( this._lang == 'fr' ) {
        this.notification.show_notification('Veuillez sélectionner des données à visualiser.','Ok','error');
      } else {
        this.notification.show_notification('Please select data to visualize.','Ok','error');
      }
      this.router.navigate(['/select']);
    }

    this.base_url = '/' + this.password + '/prometheus/' + this.group_name + '/api/v1';
    this.base_url_buffer = '/' +  this.password + '/prombuffer/' + this.group_name + '/api/v1';
    this.box_selected = box_name;

    this.prometheus_api_url = this.prometheus_api_url.replace('XXXX', router);
    
    this.get_records(this.query_list);
  }

  ngAfterViewInit(): void {
    this.set_charts();
  }

  ngOnChanges(): void {
    this.destroy_all()
    this.ngOnInit();
    this.get_records(this.query_list);
    this.appRef.detectChanges();
    this.generate_all_graph();
  }

  ngOnDestroy(): void {
    this.user_info_subscription.unsubscribe();
    this.theme_subscription.unsubscribe();
    if ( this.form_group_controls_subscription != undefined ) {
      this.form_group_controls_subscription.unsubscribe();
    }
  }

  add_records(query: string): void{
    this.graphs_records[query] = {
      m_chart : "chart",
      m_hidden: false,
      m_request_IPs: [],
      m_selected_IPs: new FormControl(),
      m_request_services: [],
      m_selected_services: new FormControl(),
      m_stacked: false,
      t_value : this.default_value,
      t_unit : this.default_unit,
      t_date : this._formBuilder.control({
        value: this.default_date, disabled: false
      }),
      t_now : this._now
    }
    this.form_group.addControl(query, this.graphs_records[query]['t_date']);
    this.form_group_controls_subscription = this.form_group.controls[query].valueChanges.subscribe(date => {
      if ( isDevMode() ) {
        console.log('Date changes :')
        console.log(date)
        console.log(query)
        console.log(this.form_group.controls[query])
      }
      this.date_changes(date, query);
    });
    this.query_list.push('up')
  }

  get_records(query_list: Array<string>): void {
    query_list.forEach(
      (query, index) => {
        let date = new Date(this.params_list['date'][index])
        this.graphs_records[query] = {
          m_chart : "chart",
          m_hidden: false,
          m_request_IPs: [],
          m_selected_IPs: new FormControl(),
          m_request_services: [],
          m_selected_services: new FormControl(),
          m_stacked: false,
          t_value : +this.params_list['value'][index],
          t_unit : this.params_list['unit'][index],
          t_date : this._formBuilder.control({
            value: date, disabled: false
          }),
          t_now : this.params_list['now'][index] == 'true'
        }
        this.form_group.addControl(query, this.graphs_records[query]['t_date']);
        this.form_group_controls_subscription = this.form_group.controls[query].valueChanges.subscribe(date => {
          if ( isDevMode() ) {
            console.log('Date changes :')
            console.log(date)
            console.log(query)
            console.log(this.form_group.controls[query])
          }
          this.date_changes(date, query);
        });
      }
    );
  }

  get_user_metrics() {
    const headers = new HttpHeaders().set("Content-Type", "application/json").set("Accept", "application/json");
    let user_config_base_url = '/traffic/' + this._lang + '/assets/json/';
    let user_config_url = user_config_base_url + this.user_information.username + ".json.nousNeVoulousPlusDeConfigPerso";
    this.httpClient.get<any>(user_config_url, {headers}).pipe(
      catchError((err => {
        console.log('Handling error locally and rethrowing it...', err);
        return throwError(err);
    })))
    .subscribe(custom_config => // replace the file if the user has a custom configuration
      { 
        this.metrics_config = custom_config;
      }, err => // No custom conf
      { 
        this.metrics_config = (metrics_config as any).default;
      });
  }

  set_charts(): void {
    if ( isDevMode() ) {
      console.log('set charts')
      console.log(this.query_list)
    }
    this.query_list.forEach(
      query => {
        this.get_metric_from_prometheus(query);
      }
    );
  }

  generate_all_graph(): void {
    this.get_records(this.query_list); 
    this.set_charts();
  }

  destroy_all(): void {
    Chart.helpers.each(Chart.instances, function(instance) {
      instance.chart.destroy();
    });
  }

  update_all(): void {
    Chart.helpers.each(Chart.instances, function(instance) {
      instance.chart.update();
    });
  }

  regenerate_all_graph(): void {
    this.destroy_all();
    this.generate_all_graph();
  }

  regenerate(id:string): void {
    this.graphs_records[id]['m_chart'].destroy();
    if ( isDevMode() ) {
      console.log ('destroying ' + id + ' chart');
      console.log(this.graphs_records);
      console.log ('re-building ' + id + ' chart');
    }
    this.graphs_records[id]['m_chart'] = this.get_metric_from_prometheus(id);
  }

  transform_metric_query(metric_name:string, box:string): string{
    let query: string = metric_name;
    if ( box != null ) {
      query = metric_name + '%7Bjob=~%22' + box + '.*%22%7D';
    }
    let scrape_interval = 2; //scrape interval => 2min
    let range = scrape_interval * 4; //safe 

    if ( isDevMode() ) console.log(this.metrics_config);

    if ( metric_name in this.metrics_config ) {
      if ( this.metrics_config[metric_name]['type'] == "range_vectors" ) {
        query = this.metrics_config[metric_name]['promql'] + '(' + query + '[' + range + 'm])';
  
      } else if ( this.metrics_config[metric_name]['type'] == "instant_vectors" ) {
        query = this.metrics_config[metric_name]['promql'] + '(' + query + ')';
      
      } else if ( this.metrics_config[metric_name]['type'] == "multi_query" ) {
        query = this.metrics_config[metric_name]['promql'] + '(' + query + ')';
      }
    }
    return query;
  }

  get_metric_from_prometheus(metric:string): void {
    if ( isDevMode() ) console.log(this.graphs_records[metric]);

    const timestamp = new Date().getTime();
    let t_value: number = this.graphs_records[metric]['t_value'];
    let t_unit: number = this.graphs_records[metric]['t_unit'];
    let start_time: number;
    let end_time : number;

    if ( this.graphs_records[metric]['t_now'] == false ) {
      let current_timestamp = this.default_date.getTime();

      let date: Date =  this.graphs_records[metric]['t_date'].value;
      let selected_date_timestamp = date.getTime();
    
      end_time = (timestamp + (current_timestamp - selected_date_timestamp) * -1) / 1000;

      let t_value = this.graphs_records[metric]['t_value'];
      let t_unit = this.graphs_records[metric]['t_unit'];
      start_time = -1 * t_value * this._unit[t_unit]/1000 + end_time;
    } else {
      end_time = ( timestamp ) / 1000;
      start_time = -1 * t_value * this._unit[t_unit]/1000 + end_time;
    }

    if ( isDevMode() ) console.log(end_time + ' ' + start_time);
    let step = this.set_prometheus_step(start_time, end_time);
    
    let selected_box = this.box_selected
    let raw_metric_name = metric;
    
    let query = '';

    let custom_metric = this.metrics_config['custom_metric'];

    Object.keys(custom_metric).forEach(vector_type =>{
      if ( metric in custom_metric[vector_type] ) {
        query =  '/query_range?query=' + custom_metric[vector_type][metric]['query'];
        if ( selected_box != null ) {
          let box_filter: string = ',job=~"'+ selected_box +'.*"';
          query = query.replace('<box_filter>', box_filter);
        } else {
          query = query.replace('<box_filter>', '');
        }
      }
    });

    if ( query === '' ) {
      metric = this.transform_metric_query(metric, selected_box);
      if ( metric.includes('_raw') ) {
        metric = metric.replace('_raw','');
      }
      query = '/query_range?query=' + metric + '&start=' + start_time + '&end=' + end_time + '&step=' + step;
    } else {
      query = query + '&start=' + start_time + '&end=' + end_time + '&step=' + step;
    }

    let url: string;
    if ( timestamp / 1000 - 3600 * 6 >= start_time || timestamp / 1000 - 3600 * 6  >= end_time ) {
      if ( isDevMode() ) console.log('>= 6h');
      url = this.base_url + query;
    } else {
      if ( isDevMode() ) console.log('< 6h');
      url = this.base_url_buffer + query;
    }

    url = this.prometheus_api_url + this.base_url + query;

    let headers = new HttpHeaders();
    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', url, {headers})
      .pipe(timeout(10000))
      
      .toPromise()
      .then(response => {
        if ( isDevMode() ) console.log(response);
        if ( response['status'] != 'success' ) {
          if ( this._lang == 'fr' ) {
            this.notification.show_notification('Une erreur est survenue lors de la communication avec prometheus','Fermer','error');
          } else {
            this.notification.show_notification('An error occurred while communicating with prometheus.','Close','error');
          }
          throw new Error ('Request to prom : not successful');
        }
        // Complete data
        let data_completed_to_parse = this.completeResponse(response['data']['result'], start_time, end_time, step)
        // Parse data
        let parsed_data = this.parse_response(data_completed_to_parse, raw_metric_name);
        // Build chart
        let chart = this.graphs_records[raw_metric_name]['m_chart'] = this.chart_builder(raw_metric_name, parsed_data);
        this.keep_legend_visibility(raw_metric_name, chart);

        // Create legends
        this.graph_legends.set(raw_metric_name, chart.options.plugins.legend.labels.generateLabels(chart));
        this.showLegendSelected(this.graphs_records[raw_metric_name], this.graph_legends.get(raw_metric_name) , raw_metric_name)
        // Apply graph options
        this.stack_lines(this.graphs_records[raw_metric_name]);
      });
  }

  get_extra_labels(response:any): Array<string> {
    delete response['__name__'];
    delete response['instance'];
    delete response['job'];
    let extra_label = Object.keys(response);
    return extra_label;
  }

  completeResponse(data_to_complete, start_time, end_time, step) {
    data_to_complete.forEach(dataset => {
      let currentDataset = dataset['values'];
      let tabLength = currentDataset.length - 1
      let completedDataset = []

      // Complete missing value before tab
      let firstTime = currentDataset[0][0];
      if ( firstTime > start_time ) {
        let missingStepsBefore = (firstTime - start_time)/step ;
        for ( let i = missingStepsBefore; i > 0; i-- ) {
          let time = firstTime - (i * step);
          completedDataset.push([time, 'NaN']);
        }
      }

      // Complete missing value inside tab
      for ( let i = 0; i < currentDataset.length - 1; i++ ) {
        let firstTime = currentDataset[i][0];
        let secondTime = currentDataset[i+1][0];
        let missingSteps = (secondTime - firstTime - step) / step;
        completedDataset.push(currentDataset[i]);
        for ( let j = 1; j <= missingSteps; j++ ) {
          let time = firstTime + (j * step);
          completedDataset.push([time, 'NaN']);
        }
      }

      // Complete missing value after tab
      let lastTime = currentDataset[tabLength][0];
      if ( lastTime < end_time ) {
        let missingStepsAfter = (end_time - lastTime)/step;
        for ( let i = 1; i <= missingStepsAfter; i++ ) {
          let time = lastTime + (i * step);
          completedDataset.push([time, 'NaN']);
        }
      }
      dataset['values'] = completedDataset;
    });
    return data_to_complete;
  }

  parse_response(data_to_parse : any, metric:string): Object {
    if ( isDevMode() ) console.log(data_to_parse);
    let datasets = [];
    let metric_timestamp_list = [];
    let custom_metric = this.metrics_config['custom_metric'];
    let request_IPs = this.graphs_records[metric]["m_request_IPs"];
    let request_services = this.graphs_records[metric]["m_request_services"];
    for ( const key in data_to_parse ) {

      let instance;
      if ( metric in custom_metric['instant_vectors'] ) {
        instance = custom_metric['instant_vectors'][metric]["description"]
      } else if ( metric in custom_metric['range_vectors'] ) {
        instance = custom_metric['range_vectors'][metric]["description"]
      } else if ( metric in custom_metric['multi_query'] ) {
        instance = custom_metric['multi_query'][metric]["description"]
      } else {
        instance = data_to_parse[key]['metric']['job'];
      }

      let metric_value_list = [];
      data_to_parse[key]['values'].forEach(value=>{
        metric_timestamp_list.push(value[0] * 1000); //Chartjs need ms timestamp to work correctly
        metric_value_list.push(value[1]);
      });
      
      let extra_label: Array<string> = this.get_extra_labels(data_to_parse[key]['metric']);
      let label: string = '';
      if ( this.metric_alternative_name[this.user_information.role][metric] !== undefined ) {
        if ( this.box_selected != null ) {
          label = this.metric_alternative_name[this.user_information.role][metric][this._lang]
        } else {
          label = this.metric_alternative_name[this.user_information.role][metric][this._lang] + ' { instance: ' + instance + ' }';
        }
      } else {
        label = metric + " [NO TRANSLATION]";
      }

      let service = data_to_parse[key]['metric']["service"];
      let src_ip = data_to_parse[key]['metric']["src_ip"];
      if ( src_ip !== undefined ) {
        if ( false === request_IPs.includes(src_ip) ) {
          request_IPs.push(src_ip);
          if ( src_ip == '0.0.0.0' ) {
            this.graphs_records[metric]["m_selected_IPs"] = new FormControl([src_ip]);
          }
        }
      }
      if ( service !== undefined ) {
        if ( false === request_services.includes(service) ) {
          request_services.push(service);
        }
      }

      extra_label.forEach(element => {
        label = label + ' { ' + element + ': ' + data_to_parse[key]['metric'][element] + ' }';
      });
      let dataset;
      dataset = {
        label: label,
        data: metric_value_list,
        pointRadius: 1, // Graph dot size : 0 -> no dot
        borderColor : '#' + this.crc32(label), // Line color
        backgroundColor : '#' + this.crc32(label), // Legend color
        src_ip: src_ip,
        service: service,
      };
      datasets.push(dataset);
    }
    this.graphs_records[metric]["m_selected_services"] = new FormControl(request_services);
    let parsed_data = {
      labels: metric_timestamp_list,
      datasets: datasets
    };
    return parsed_data;
  }

  makeCRCTable(): Array<any> {
    var c;
    var crcTable = [];
    for ( var n = 0; n < 256; n++ ) {
      c = n;
        for ( var k = 0; k < 8; k++ ) {
          c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      crcTable[n] = c;
    }
    this.CRC_table = crcTable;
    return crcTable;
  }

  showLegendSelected(grm, glm, metric) {
    let selected_services = grm["m_selected_services"].value;
    let selected_IPs = grm["m_selected_IPs"].value;
    let metric_legends_to_display = [];
    let datasets = grm['m_chart'].data.datasets;
    glm.forEach((legend, index) => {
      let src_ip = datasets[index]["src_ip"];
      let service = datasets[index]["service"];
      if ( src_ip ==  undefined ) { // always show legend if there is no IP
        metric_legends_to_display.push(legend);
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      }
      else if ( false === selected_IPs.includes(src_ip) ) {
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, false);
        legend.hidden = true;
      } else if ( false === selected_services.includes(service) ) {
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, false);
        legend.hidden = true;
      } else {
        metric_legends_to_display.push(legend);
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      }
    });
    this.graph_legends_to_display.set(metric, metric_legends_to_display);
    grm["m_chart"].update();
  }

  crc32(str: string): string {
    var crcTable;
    if ( this.CRC_table = [] ) {
      crcTable = this.makeCRCTable();
    } else {
      crcTable = this.CRC_table
    }
    
    var crc = 0 ^ (-1);

    for ( var i = 0; i < str.length; i++ ) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    let tmpColor = Math.abs(((crc ^ (-1)) >>> 0)).toString(16); 
    tmpColor += '000000'; // tmpColor.length has to be 6 or above
    return tmpColor.substring(0, 6);
  }

  // Compute a step for range_query (interval between 2 points in second)
  // Min step: 1s
  // Default: 1 step every 15px
  set_prometheus_step( start: number, end: number ): number {
    const timestamp = new Date().getTime();
    const second_duration = ( end - start );
    let chart_width = window.innerWidth;
    let step: number;
    step = Math.floor( second_duration / chart_width ) * 5;

    if ( step == 0 ) {
      step = 50;
    }
    
    return step;
  }

  GetDefaultOrCurrent(value, defaultValue) {
    if ( value === undefined || value === null || value === '' ) { 
      return defaultValue;
    }
    return value;
  }

  getArrayMaxValue(array, array_max_value) {
    let reducer = (current_max, current_value) => { 
      if ( isNaN(current_value) ) {
        return current_max;
      }
      return Math.max(current_max, current_value);
    }
    array_max_value = array.reduce(reducer, array_max_value);
    return array_max_value
  }

  rewriteYAxisMaxValue(max_value_raw) {
    if ( max_value_raw == 0 ) {
      return 1;
    }
    let length = Math.ceil(max_value_raw).toString().length;
    let add_or_remove_digits = 10**(length - 1)
    let max_value_rewrite = max_value_raw / add_or_remove_digits;
    max_value_rewrite = Math.ceil(max_value_rewrite/.5)*.5;
    max_value_rewrite = max_value_rewrite * add_or_remove_digits;
    return max_value_rewrite;
  }

  // for each keyword in keyword_to_replace
  // replace the keyword of new_label by the value of old_label
  replaceLabel(element, old_label, new_label, keyword_to_replace) {
    for ( const [key, value] of Object.entries(keyword_to_replace) )  {
      if ( element[value + ''] !== undefined ) {        // [value] : type unknown | [value+''] : type string
        new_label = new_label.replaceAll(key, element[value + '']);
        continue
      }
      let get_old_label_value = old_label.split(value)[1];
      get_old_label_value = get_old_label_value.split(" }")[0];
      new_label = new_label.replaceAll(key, get_old_label_value);
    }
    return new_label;
  }

  chart_builder(metric:string, data:Object): Chart {
    // get metric config
    let metric_data = undefined;
    if (metric in this.metrics_config) {
      metric_data = this.metrics_config[metric];
    } else if (metric in this.metrics_config['custom_metric']['instant_vectors']) {
      metric_data = this.metrics_config['custom_metric']['instant_vectors'][metric];
    } else if (metric in this.metrics_config['custom_metric']['multi_query']) {
      metric_data = this.metrics_config['custom_metric']['multi_query'][metric];
    }

    let type = 'line'
    let indexAxis = 'x';
    let interaction_mode = 'index';
    let interaction_intersect = false;

    let chart_type = this.GetDefaultOrCurrent(metric_data['chart_type'], '');
    if (chart_type === "horizontal_bar") {
      type = 'bar';
      indexAxis = 'y';
      interaction_mode = "nearest";
      interaction_intersect = true;
    }

    this.createFollowCursorTooltipPositioner();

    let custom_tooltip = this.GetDefaultOrCurrent(metric_data['custom_tooltip'], '');
    let tooltip_callbacks = this.createTooltipCallbacks(custom_tooltip);
    // Remove callbacks that aren't part of the config custom_tooltip
    const callbacks_filtered_by_key = Object.fromEntries(
      Object.entries(tooltip_callbacks).filter(([key, value]) => Object.keys(custom_tooltip).includes(key))
    );

    // Create basic chart config
    let config = {
      type: type,
      data: data,
      options: {
        maintainAspectRatio: false,
        responsive: true,
        indexAxis: indexAxis,  
        plugins: {
          filler: {
            propagate: false
          },
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
            callbacks: callbacks_filtered_by_key,
            external: (context) => {
              this.graphs_records[metric]["m_tooltip"] = context.tooltip 
            },
            position: 'followCursor'
          }
        },
        interaction: {
          mode: interaction_mode,
          intersect: interaction_intersect
        },
        elements: {
          line: {
            borderWidth: 2,
            tension: 0 // Use this to curve the lines, 0 means straight line
          },
          bar: {
            borderWidth: 0,
          }
        },
        font: {
          family: 'Ubuntu, sans-serif'
        }
      }
    };
    
    if (type === "bar") {
      config = this.createBarChartScales(config, metric_data);
    } else if (type === 'line') {
      config = this.createLineChartScales(config, metric_data, data);
    }

    let ctx = document.getElementById(metric);
    if ( ctx === null ) {
      throw new Error('An error as occured. Can\'t get id ok : ' + metric);
    }
    let chart = new Chart(ctx, config);
    return chart
  }

  // Show/Hide legend and curve on click
  switch_visibility_legend(legend, metric_chart) {
    metric_chart.setDatasetVisibility(legend.datasetIndex, !metric_chart.isDatasetVisible(legend.datasetIndex));
    legend.hidden = !legend.hidden;
    metric_chart.update();
  }

  keep_legend_visibility(metric, chart) {
    let legends = this.graph_legends.get(metric);
    if ( legends !== undefined ) {
      legends.forEach(legend => {
        chart.setDatasetVisibility(legend.datasetIndex, !legend.hidden);
      });
    }
    chart.update();
  }

  incrementValue(step: number = 1, query : string): void {
    let inputValue = this.graphs_records[query]['t_value'] + step;
    if ( this._wrap ) {
      inputValue = this.wrappedValue(inputValue);
    }
    this.graphs_records[query]['t_value'] = inputValue;
    this.time_value_changes(query);
  }

  setColor(color: string): void {
    this.color = color;
  }

  private wrappedValue(inputValue): number {
    if ( inputValue > this._max ) {
      return this._min + inputValue - this._max;
    }
    if ( inputValue < this._min ) {
      if ( this._max === Infinity ) {
        return this._min;
      }
      return this._max + inputValue;
    }
    return inputValue;
  }

  unit_selection_changes(query: string): void {
    let t_value = this.graphs_records[query]['t_value'];
    let t_unit = this.graphs_records[query]['t_unit'];
    this.up_start_time = -1 * t_value * this._unit[t_unit] + this.end_time;
    this.regenerate(query);
    this.update_url();
  }

  time_value_changes(query: string): void {
    let t_value = this.graphs_records[query]['t_value'];
    let t_unit = this.graphs_records[query]['t_unit'];
    this.up_start_time = -1 * t_value * this._unit[t_unit] + this.end_time;
    this.regenerate(query);
    this.update_url();
  }

  date_changes(date: Date, query: string): void {
    this.default_date = new Date();
    let current_timestamp = this.default_date.getTime();
    let selected_date_timestamp = date.getTime();

    this.end_time = (current_timestamp - selected_date_timestamp) * -1;
    
    let t_value = this.graphs_records[query]['t_value'];
    let t_unit = this.graphs_records[query]['t_unit'];

    this.up_start_time = -1 * t_value * this._unit[t_unit] + this.end_time;

    if ( current_timestamp < selected_date_timestamp ) {
      this.end_time = 0;
      this.up_start_time = -1 * t_value * this._unit[t_unit]
      this.form_group.controls[query].setValue(this.default_date);
      if ( this._lang == 'fr' ) {
        this.notification.show_notification(
          'La date choisie ne doit pas se situer dans le futur. Date sélectionnée : ' 
          + date.toLocaleDateString('fr-FR') + ' ' 
          + date.toLocaleTimeString('fr-FR'), 
          'Ok', 
          'error'
        );
      } else {
        this.notification.show_notification(
          'The selected date must not be in the future. Selected date : ' 
          + date.toLocaleDateString('en-US') + ' ' 
          + date.toLocaleTimeString('en-US'), 
          'Ok', 
          'error'
        );
      }
    }
    this.regenerate(query);
    this.update_url();
  }

  shouldDisableDecrement(inputValue: number): boolean {
    return !this._wrap && inputValue <= this._min;
  }
  
  shouldDisableIncrement(inputValue: number): boolean {
    return !this._wrap && inputValue >= this._max;
  }

  on_slide_toggle_change($event:Event, query:string): void {
    if ( $event['checked'] ) {
      let t_value = this.graphs_records[query]['t_value'];
      let t_unit = this.graphs_records[query]['t_unit'];
      this.up_start_time = -1 * t_value * this._unit[t_unit];
      this.end_time = 0;
      this.regenerate(query);
    }
    this.update_url();
  }

  set_default_settings(query:string): void {
    this.up_start_time = this.default_up_start_time;
    this.end_time = this.default_end_time;
    this.graphs_records[query]["t_value"] = this.default_value;
    this.graphs_records[query]["t_unit"] = 'hour';
    this.graphs_records[query]["t_now"] = true;
    this.regenerate(query);
    this.update_url();
  }

  hide_lines(metric:string): void {
    let _is_disabled: boolean = this.graphs_records[metric]["m_hidden"];
    this.graphs_records[metric]['m_chart'].data.datasets.forEach((dataSet, i) => {
      var meta = this.graphs_records[metric]['m_chart'].getDatasetMeta(i);
      if ( meta.hidden == null ) {
        meta.hidden = _is_disabled;
      }
      meta.hidden = !_is_disabled;
    });
    this.graphs_records[metric]["m_hidden"] = !_is_disabled;
    this.graph_legends.get(metric).forEach(element => {
      element.hidden = !_is_disabled ;
    });;
    this.graphs_records[metric]['m_chart'].update();
  }

  switch_stack_lines(grm) {
    let name_y_axis;
    grm['m_chart'].options.scales.yStacked.stacked = !grm['m_chart'].options.scales.yStacked.stacked

    this.stack_lines(grm)
  }

  stack_lines(grm:string): void {
    let _is_stacked: boolean 
    _is_stacked = grm['m_chart'].options.scales.yStacked.stacked
    
    grm["m_stacked"] = _is_stacked;
    grm['m_chart'].data.datasets.forEach(element => {
      if ( element.yAxisID === "yStacked" ) {
        element.fill = _is_stacked ? 'origin' : false;
      }
    });
    grm['m_chart'].update();
  }

  change_theme(dark_theme:boolean): void {
    if ( dark_theme ) {
      Chart.defaults.global.defaultFontColor = 'white';
    } else {
      Chart.defaults.global.defaultFontColor = 'black';
    }
    Chart.helpers.each(Chart.instances, function(instance) {
      instance.chart.update();
    });
  }

  delete(query: string): void {
    if ( isDevMode() ) console.log('Deleting : ' + query + ' chart');
    delete this.graphs_records[query];
    this.update_url();
  }

  update_url(): void {
    if ( Object.keys(this.graphs_records).length == 0 ) {
      this.router.navigateByUrl('/select');
    } else {
      let url: string;
      if ( this.box_selected == null ) {
        url = '/graph/' + this.group_name + '/' + this.group_router + '/' + this.password + '/metric?';
      } else {
        url = '/graph/' + this.group_name + '/' + this.group_router + '/' + this.password + '/' + this.box_selected + '/metric?';
      }

      Object.keys(this.graphs_records).forEach((metric, index) =>{
        if ( Object.keys(this.graphs_records).length - 1 == index ) {
          url = url + 'metric=' + metric 
                    + '&value='+ this.graphs_records[metric]['t_value'] 
                    + '&unit='+ this.graphs_records[metric]['t_unit'] 
                    + '&now='+ this.graphs_records[metric]['t_now'] 
                    + '&date=' + this.graphs_records[metric]['t_date']['value'].toISOString();
        } else {
          url = url + 'metric=' + metric 
          + '&value='+ this.graphs_records[metric]['t_value'] 
          + '&unit='+ this.graphs_records[metric]['t_unit'] 
          + '&now='+ this.graphs_records[metric]['t_now'] 
          + '&date=' + this.graphs_records[metric]['t_date']['value'].toISOString() +'&';
        }
      });

      this.router.navigateByUrl(url)
    }
  }

  back_to_selection(): void {
    this.router.navigate(['/select'])
  }
}
