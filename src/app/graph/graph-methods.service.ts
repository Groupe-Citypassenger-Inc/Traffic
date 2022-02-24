import { Injectable } from '@angular/core';
import { UNIT_INFORMATION } from '../../data.constants';

@Injectable({
  providedIn: 'root',
})
export class GraphMethodsService {

  addUnitToValue(value: any, unit, lang): string {
    const unitList = UNIT_INFORMATION.get(unit)[lang];
    value = Math.trunc(value).toString();
    const thousandCounter = Math.trunc((value.length - 1) / 3);
    value = value / (1000 ** thousandCounter);
    value = value.toFixed(1);

    // remove decimal if value over 100 or decimal is 0
    const shouldTrunc = (value >= 100 || value === Math.trunc(value));
    value = shouldTrunc ? Math.trunc(value) : value;
    
    return `${value} ${unitList[thousandCounter]}`;
  }
}
