import { Pipe, PipeTransform } from '@angular/core';
import { GraphMethodsService } from '../graph/graph-methods.service';
@Pipe({ name: 'addUnitToValue' })
export class AddUnitToValuePipe implements PipeTransform {
  constructor(
    private graphMethodsService: GraphMethodsService,
  ) { }

  transform(value, unit, lang): string {
    return this.graphMethodsService.addUnitToValue(value, unit, lang);
  }
}
