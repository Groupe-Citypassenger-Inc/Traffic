import { Pipe, PipeTransform } from '@angular/core';
import moment from "moment";

@Pipe({name: 'timestampToDate'})
export class TimestampToDatePipe implements PipeTransform {
  transform(value: number, moment_format): string {
    return moment(new Date(value)).format(moment_format)
  }
}