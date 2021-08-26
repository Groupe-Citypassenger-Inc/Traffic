import { Injectable } from '@angular/core';
import { UNIT_INFORMATION } from '../../data.constants';

@Injectable({
  providedIn: 'root'
})
export class GraphMethodsService {

  constructor() { }

  add_unit_to_value(value:any, unit, lang) {
    let unit_list = UNIT_INFORMATION.get(unit)[lang];
    value = Math.trunc(value).toString()
    let thousand_counter = Math.trunc((value.length - 1) / 3);
    value = value / (1000 ** thousand_counter);
    value = value.toFixed(1);
    // remove decimal if value over 100 or decimal is 0
    if (value >= 100) {
      value = Math.trunc(value);
    }
    else if (value == Math.trunc(value)) {
      value = Math.trunc(value);
    }
    return value + ' ' + unit_list[thousand_counter];
  }
}
