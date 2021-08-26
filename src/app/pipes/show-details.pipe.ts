import { Pipe, PipeTransform } from '@angular/core';

@Pipe({name: 'showDetails'})
export class ShowDetailsPipe implements PipeTransform {
  transform(value): string {
    console.log("value", value)
    return "";
  }
}