import { TestBed } from '@angular/core/testing';

import { GraphMethodsService } from './graph-methods.service';

describe('GraphMethodsService', () => {
  let service: GraphMethodsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GraphMethodsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
