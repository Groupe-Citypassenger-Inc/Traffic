import { Pipe, PipeTransform } from '@angular/core';
import { UNIT_INFORMATION } from '../../data.constants';

@Pipe({name: 'addUnitToValue'})
export class AddUnitToValuePipe implements PipeTransform {
  transform(value, unit, lang): string {
    let unit_value_list = UNIT_INFORMATION.get(unit)[lang];
    value = Math.trunc(value).toString()
    let thousand_counter = Math.trunc((value.length - 1) / 3);
    value = value / (1000 ** thousand_counter);
    let decimal = 0;
    if (value < 100) {
      decimal = 1;
    }
    return value.toFixed(decimal) + ' ' + unit_value_list[thousand_counter];
  }
}