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
import { UNIT_INFORMATION, BACKGROUND_COLOR, TEXT_TRANSLATION } from '../../data.constants';
import { GraphMethodsService } from './graph-methods.service';

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
  selected_day: Date = new Date();
  maxDate: Date = new Date();

  constructor(private appRef: ChangeDetectorRef,  
              private _formBuilder: FormBuilder, 
              private httpClient: HttpClient, 
              public lingual: LanguageService, 
              private auth: AuthService,
              private notification: NotificationServiceService,
              public theme_handler: ThemeHandlerService,
              private router: Router,
              private graphMethodsService: GraphMethodsService,
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
      m_legend : {
        title: '',
        legends: [],
        position : 'bottom'
      },
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
          m_legend : {
            title: '',
            legends: [],
            position : 'bottom'
          },
          m_hidden: false,
          m_request_IPs: [],
          m_selected_IPs: new FormControl(),
          m_request_services: [],
          m_selected_services: new FormControl(),
          m_chart_date_picker : "range_type",
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
    const date = new Date(this.selected_day);
    const timestamp = date.getTime();
    let t_value: number = this.graphs_records[metric]['t_value'];
    let t_unit: number = this.graphs_records[metric]['t_unit'];
    let start_time: number;
    let end_time : number;

    if ( this.graphs_records[metric]['t_now'] == false ) {
      let current_timestamp = this.default_date.getTime();

      let date: Date =  this.graphs_records[metric]['t_date'].value;
      let selected_date_timestamp = date.getTime();
    
      end_time = (timestamp + (current_timestamp - selected_date_timestamp) * -1) / 1000;
      start_time = -1 * t_value * this._unit[t_unit]/1000 + end_time;
    } else {
      end_time = ( timestamp ) / 1000;
      start_time = -1 * t_value * this._unit[t_unit]/1000 + end_time;
    }

    if (isDevMode()) console.log(end_time + ' ' + start_time);
    let step = this.set_prometheus_step(start_time, end_time);
    
    let selected_box = this.box_selected
    let raw_metric_name = metric;
    
    let query = '';
    let chart_type = '';
    let custom_metric = this.metrics_config['custom_metric'];
    Object.keys(custom_metric).forEach(vector_type =>{
      if ( metric in custom_metric[vector_type] ) {
        chart_type = custom_metric[vector_type][metric]['chart_type']; 
        this.graphs_records[metric]["m_chart_date_picker"] = custom_metric[vector_type][metric]['chart_date_picker']; 
        query =  '/query_range?query=' + custom_metric[vector_type][metric]['query'];
        if ( selected_box != null ) {
          let box_filter: string = 'job=~"'+ selected_box +'.*"';
          query = query.split('<box_filter>').join(box_filter);
        } else {
          query = query.split('<box_filter>').join('');
        }
      }
    });

    if ( chart_type === "horizontal_bar" ) {
      start_time = date.setHours(0,0,0,0)/1000;
      end_time = date.setHours(24,0,0,0)/1000;
      step = 200;
    }
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
        if (isDevMode()) console.log(response);
        if (response['status'] != 'success') {
          if (this._lang == 'fr') {
            this.notification.show_notification('Une erreur est survenue lors de la communication avec prometheus','Fermer','error');
          } else {
            this.notification.show_notification('An error occurred while communicating with prometheus.','Close','error');
          }
          throw new Error ('Request to prom : not successful');
        }
        if (chart_type === "horizontal_bar") {
          let parsed_data = this.parse_response_bar(response, raw_metric_name);
          this.graphs_records[raw_metric_name]['m_chart'] = this.chart_builder(raw_metric_name, parsed_data);
        } else if (chart_type === 'line') {
          let data_completed_to_parse = this.completeResponse(response['data']['result'], start_time, end_time, step)
          let parsed_data = this.parse_response_line(data_completed_to_parse, raw_metric_name);
          
          let chart = this.graphs_records[raw_metric_name]['m_chart'] = this.chart_builder(raw_metric_name, parsed_data);

          this.keep_legend_visibility(raw_metric_name, chart);
          this.graph_legends.set(raw_metric_name, chart.options.plugins.legend.labels.generateLabels(chart));
          this.showLegendSelected(this.graphs_records[raw_metric_name], this.graph_legends.get(raw_metric_name) , raw_metric_name)

          this.stack_lines(this.graphs_records[raw_metric_name]);
        }
      });
  }

  get_extra_labels(response:any): Array<string> {
    delete response['__name__'];
    delete response['instance'];
    let extra_label = Object.keys(response);
    return extra_label;
  }

  // Add NaN value where no value exist inside data_to_complete
  completeResponse(data_to_complete, start_time, end_time, step) {
    data_to_complete.forEach(dataset => {
      let currentDataset = dataset['values'];
      let tabLength = currentDataset.length - 1
      let completedDataset = []

      let firstTime = currentDataset[0][0];
      if ( firstTime > start_time ) {
        let missingStepsBefore = (firstTime - start_time)/step ;
        for ( let i = missingStepsBefore; i > 0; i-- ) {
          let time = firstTime - (i * step);
          completedDataset.push([time, 'NaN']);
        }
      }

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

  addSrcIpToRequestedIps(request_IPs, src_ip, metric) {
    if (src_ip === undefined) {
      return
    }
    if (request_IPs.includes(src_ip)) {
      return
    }
    request_IPs.push(src_ip);
    if (src_ip === '0.0.0.0') {
      this.graphs_records[metric]["m_selected_IPs"] = new FormControl([src_ip]);
    }
  }

  addServiceToRequestedServices(request_services, service) {
    if (service === undefined) {
      return
    }
    if (false === request_services.includes(service)) {
      request_services.push(service);
    }
  }

  parse_response_line(data_to_parse : any, metric:string): Object {
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
      data_to_parse[key]['values'].forEach(value => {
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

      let src_ip = data_to_parse[key]['metric']["src_ip"];
      this.addSrcIpToRequestedIps(request_IPs, src_ip, metric)
      
      let service = data_to_parse[key]['metric']["service"];
      this.addServiceToRequestedServices(request_services, service)
      
      extra_label.forEach(element => {
        label = label + ' { ' + element + ': ' + data_to_parse[key]['metric'][element] + ' }';
      });
      let dataset= {
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

  parse_response_bar(data_to_parse, metric) {
    let custom_metric = this.metrics_config['custom_metric'];
    let metric_data;
    if ( metric in custom_metric['instant_vectors'] ) {
      metric_data = custom_metric['instant_vectors'][metric]
    } else if ( metric in custom_metric['range_vectors'] ) {
      metric_data = custom_metric['range_vectors'][metric]
    } else if ( metric in custom_metric['multi_query'] ) {
      metric_data = custom_metric['multi_query'][metric]
    }

    let legend_title = this.GetDefaultOrCurrent(metric_data['legend_title'], '');
    let number_of_element_to_show = this.GetDefaultOrCurrent(metric_data['number_of_element_to_show'], 5);

    data_to_parse["data"]["result"].sort(function (a, b) {
      let result_a = a.values[0];
      let value_a = result_a[1];

      let result_b = b.values[0];
      let value_b = result_b[1];
      return value_b - value_a;
    });

    let datasets = [];
    let labels = [];
    let dataset = {
      label: 'Dataset',
      legend: [],
      unique_src_ips: [],
      data: [],
      backgroundColor: [],
      metric: []
    };
    let src_ip_list = [];
    let data_index = 0;

    while (labels.length < number_of_element_to_show && data_to_parse["data"]["result"].length > data_index) {
      let data_element = data_to_parse["data"]["result"][data_index];
      let value = data_element.values[0][1]; // metric bytes volume
      let metric = data_element.metric;

      // reduce of 5 000 000 / (30 * 60) as number of stuff in 30 mn < 5Mo
      if (value < metric.age * 2_777) {
        data_index++;
        continue;
      }
      let backgroundColor;
      let current_src = metric.src_ip
      // add volume to dataset if src_ip already exist
      if (src_ip_list.includes(metric.src_ip)) {
        let index = src_ip_list.indexOf(current_src)
        backgroundColor = dataset.legend[index].fillStyle;
      }
      // create new dataset
      else {
        src_ip_list.push(current_src)
        let index = dataset.legend.length;
        backgroundColor = BACKGROUND_COLOR[index]
        let new_legend = {
          text: current_src,
          fillStyle: backgroundColor,
          cursor: "unset"
        }
        dataset.legend.push(new_legend);
      }
      dataset.data.push(value);
      dataset.backgroundColor.push(backgroundColor);
      dataset.metric.push(metric);

      labels.push(metric.dst_ip)
      data_index++;
    }
    datasets.push(dataset)

    this.graphs_records[metric]["m_legend"].title = legend_title;
    this.graphs_records[metric]["m_legend"].legends = dataset.legend;

    let parsed_data = {labels, datasets};
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
      legend.cursor = "pointer";
      if ( src_ip ==  undefined ) { // always show legend if there is no IP
        metric_legends_to_display.push(legend);
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      } else if ( service ==  undefined ) { // always show legend if there is no service
        metric_legends_to_display.push(legend);
        grm["m_chart"].setDatasetVisibility(legend.datasetIndex, true);
        legend.hidden = false;
      } else if ( false === selected_IPs.includes(src_ip) ) {
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
    // this.graph_legends_to_display.set(metric, metric_legends_to_display);
    this.graphs_records[metric]["m_legend"].legends = metric_legends_to_display;
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
  replaceLabel(element, new_label, keyword_to_replace) {
    for ( const [key, value] of Object.entries(keyword_to_replace) )  {
      if ( element[value + ''] !== undefined ) {        // [value] : type unknown | [value+''] : type string
        new_label = new_label.replaceAll(key, element[value + '']);
        continue
      }
      let get_old_label_value = element.label.split(value)[1];
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
    grm['m_chart'].options.scales.yStacked.stacked = !grm['m_chart'].options.scales.yStacked.stacked
    this.stack_lines(grm)
  }

  stack_lines(grm: string): void {
    let _is_stacked: boolean = grm['m_chart'].options.scales.yStacked.stacked
    
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

  
  isString(value){
    console.log(value);
    return typeof value === "string"
  }

  // Create object for view rendering
  addLineToTooltipField(line_type, current_metric, element) {
    let tooltipLine = {
      switchCase: line_type
    }
    switch(line_type) {
      case 'Port':
        tooltipLine["port"] = current_metric.dst_port;
        break;
      case 'Protocol':
        tooltipLine["protocol"] = current_metric.proto;
        break;
      case 'Src_To_Dest':
        tooltipLine["src"] = current_metric.src_ip;
        tooltipLine["dest"] = current_metric.dst_ip;
        break;
      case 'Start_Duration':
        tooltipLine["start"] = (current_metric.end_time - current_metric.age) * 1000;
        tooltipLine["duration"] = current_metric.age;
        tooltipLine["format"] = 'LLL',
        tooltipLine["color"] = element.dataset.backgroundColor[element.dataIndex];
        break;
      case 'Volume':
        tooltipLine["value"] = element.raw;
        tooltipLine["label"] = element.dataset.label;
        tooltipLine["unit"] = 'bytes';
        break;
      case 'Time':
        tooltipLine["value"] = element.raw;
        tooltipLine["label"] = element.dataset.label;
        tooltipLine["unit"] = 'time';
        break;
      case "Number":
        tooltipLine["value"] = element.raw;
        tooltipLine["label"] = element.dataset.label;
        tooltipLine["unit"] = 'number';
        break;
      default:
        break;
    }
    return tooltipLine;
  }

  createCustomTooltipField(tooltipItems, labels_to_show){
    let tooltip_section = [];
    tooltipItems.forEach(element => {
      if (element.raw === undefined) {
        return
      }
      let current_metric;
      if (element.dataset.metric !== undefined) {
        current_metric = element.dataset.metric[element.dataIndex];
      }
      labels_to_show.forEach(label => {
        tooltip_section.push(this.addLineToTooltipField(label, current_metric, element))
      });
    });
    return tooltip_section;
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
    }
    const label = (context) => {
      return this.createCustomTooltipField([context], custom_tooltip.label);
    }
    const afterLabel = (context) => {
      return this.createCustomTooltipField([context], custom_tooltip.afterLabel);
    }
    const beforeFooter = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.beforeFooter);
    }
    const footer = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.footer);
    }
    const afterFooter = (tooltipItems) => {
      return this.createCustomTooltipField(tooltipItems, custom_tooltip.afterFooter);
    }
    return {
      beforeTitle: beforeTitle,
      title: title,
      afterTitle: afterTitle,
      beforeLabel: beforeLabel,
      label: label,
      afterLabel: afterLabel,
      beforeFooter: beforeFooter,
      footer: footer,
      afterFooter: afterFooter
    }
  }

  createBarChartScales(config, metric_data) {
    let y_axis_title = this.GetDefaultOrCurrent(metric_data['y']['title'][this._lang], '');
    let x_axis_title = this.GetDefaultOrCurrent(metric_data['x']['title'][this._lang], '');
    const x_ticks_callback = (value, index) => {  
      return this.graphMethodsService.add_unit_to_value(value, "bytes", this._lang)
    }

    config.options["scales"] = {
      x : {
        ticks: {
          callback: x_ticks_callback
        },
        title: {
          display: true,
          text: x_axis_title
        }
      },
      y : {
        stacked: true,
        title: {
          display : true,
          text: y_axis_title
        }
      }
    }
    return config;
  }

  createLineChartScales(config, metric_data, data) {
    let y_axis_unit = this.GetDefaultOrCurrent(metric_data['y']['unit'], '');
    let y_axis_title = this.GetDefaultOrCurrent(metric_data['y']['title'][this._lang], '');
    let y_axis_min = this.GetDefaultOrCurrent(metric_data['y']['min'], 0);
    let y_axis_scales = this.GetDefaultOrCurrent(metric_data['y_axis_scales'], []);
    let y_axis_id;
    if ( y_axis_scales !== undefined ) {
      y_axis_id = Object.keys(y_axis_scales);
    }
    let metric_separator = this.GetDefaultOrCurrent(metric_data['metric_separator'], []);
    let unit_value_list = UNIT_INFORMATION.get(y_axis_unit)[this._lang]
    let metric_legend = this.GetDefaultOrCurrent(metric_data['metric_legend'], []);
    let legend_text_to_replace = this.GetDefaultOrCurrent(metric_data['legend_text_to_replace'], []);

    if ( UNIT_INFORMATION.get(y_axis_unit) === undefined )
    {
      y_axis_unit = "unknownName";
    }

    let year_regex = /\/\d{4}/;
    let data_labels: Array<number> = data['labels'];
    let data_size = data_labels.length;
    let start: number = data_labels[0];
    let end: number = data_labels[data_size - 1];
    let delta: number = ( end - start ) / 1000;
    let x_axis_format: string;
    let time_format: string;
    if ( delta <= 10_800 ) { // <= 3h
      time_format = 'LT';
      x_axis_format = 'minute';
    } else if ( delta <= 86_400 ) { // <= 24h
      time_format = 'LT';
      x_axis_format = 'hour';
    } else if ( delta <= 259_200 ) { // <= 3j
      time_format = 'L (LT)';
      x_axis_format = 'day';
    } else if ( delta < 1_296_000 ) { // < 15j
      time_format = 'L';
      x_axis_format = 'day';
    } else { // > 15j
      time_format = 'L'
      x_axis_format = 'month';
    }

    config.options["scales"] = {
      x: {
        type: 'time',
        time: {
          unit: x_axis_format
        },
        ticks: {
          autoSkip: true,
          maxTicksLimit: 15,
          callback: function(value, index, values) {
            let moment_label = moment(values[index].value);
            let formated_label = moment_label.format(time_format);
            formated_label = formated_label.replace(year_regex, '');
            return formated_label;
          }
        }
      }
    }

    let request_max_value_raw = 0;
    data["datasets"].forEach(element => {
      request_max_value_raw = this.getArrayMaxValue(element.data, request_max_value_raw);
      let array_index;
      for ( let i = 0; i < metric_separator.length; i++ ) {
        if ( element.label.includes(metric_separator[i]) ) {
          array_index = i
        }
      }
      element.yAxisID = y_axis_id[array_index];
      // keep old label if there is no label inside configuration
      if ( metric_legend.length !== 0 ) {
        let new_label = metric_legend[array_index];
        element.label = this.replaceLabel(element, new_label, legend_text_to_replace[array_index]);
      }
    });
    let ceiled_request_max_value_y = this.rewriteYAxisMaxValue(request_max_value_raw);

    // create y Axis scales : y & y_stackable
    for ( const [scaleKey, scaleValue] of Object.entries(y_axis_scales) ) {
      config.options["scales"][scaleKey] = {
        title : {
          display: true,
          text: y_axis_title
        },
        min: y_axis_min,
        max: ceiled_request_max_value_y,
        ticks: {
          callback: function(value, index) {
            let thousand_counter = 0;
            while ( value >= 1000 ) {
              value = value / 1000;
              thousand_counter ++;
            }
            return value + ' ' + unit_value_list[thousand_counter];
          }
        }
      }
      for ( const [optionsKey, optionsValue] of Object.entries(scaleValue) ) {
        config.options["scales"][scaleKey][optionsKey] = optionsValue;
      }
    }
    return config;
  }

  createFollowCursorTooltipPositioner() {
    const tooltipPlugin = Chart.registry.getPlugin('tooltip');
    tooltipPlugin.positioners.followCursor = function(elements, eventPosition) {
      let x_pos = 0;
      if (eventPosition.x > window.screen.width / 2) {
        x_pos = eventPosition.x - (this.width / 2);
      } else {
        x_pos = eventPosition.x + (this.width / 2);
      }
      return {
        x: x_pos,
        y: eventPosition.y
      };
    };
  }
}
