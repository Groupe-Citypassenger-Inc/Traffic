import { Pipe, PipeTransform } from '@angular/core';
import moment from 'moment';

@Pipe({ name: 'transformSeconds' })
export class TransformSecondsPipe implements PipeTransform {
  transform(value: number): string {
    let format = 'mm:ss';
    if (value > 3600) {
      format = 'HH:mm:ss';
    }
    return moment.utc(value * 1000).format(format);
  }
}
