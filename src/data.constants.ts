export const UNIT_INFORMATION = new Map([
  ['bytes', {'en' : ['B', 'KB', 'MB', 'GB', 'TB', 'TB'], 
            'fr': ['o', 'Ko', 'Mo', 'Go', 'To', 'To']}],
  ['bytesSec', {'en' : ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], 
                'fr': ['o/s', 'Ko/s', 'Mo/s', 'Go/s', 'To/s', 'Po/s']}],
  ['number', {'en' : ['', 'K', 'M', 'B', 'T'],
              'fr' : ['', 'K', 'M', 'B', 'T']}],
  ['time', {'en' : ['ms', 's'], 
            'fr' : ['ms', 's']}],
  ['unknownName',  {'en' :['unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit'], 
                    'fr' :['unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit']}]
]);
