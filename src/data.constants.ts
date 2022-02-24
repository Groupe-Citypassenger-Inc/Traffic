export const UNIT_INFORMATION = new Map([
  ['bytes', {
    'en': ['B', 'KB', 'MB', 'GB', 'TB', 'TB'],
    'fr': ['o', 'Ko', 'Mo', 'Go', 'To', 'To']
  }],
  ['bytesSec', {
    'en': ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'],
    'fr': ['o/s', 'Ko/s', 'Mo/s', 'Go/s', 'To/s', 'Po/s']
  }],
  ['number', {
    'en': ['', 'K', 'M', 'B', 'T'],
    'fr': ['', 'K', 'M', 'B', 'T']
  }],
  ['time', {
    'en': ['ms', 's'],
    'fr': ['ms', 's']
  }],
  ['unknownName', {
    'en': ['unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit'],
    'fr': ['unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit', 'unknown unit']
  }]
]);

export const BACKGROUND_COLOR = ['#CB4335', '#1F618D', '#F1C40F', '#884EA0', '#27AE60', '#d04a80', '#4ac3d0', '#8f6425', '#D35400', '#1f7a29']

export const TEXT_TRANSLATION = {
  protocol: {
    en: "Protocol",
    fr: "Protocole"
  },
  volume: {
    en: "Volume",
    fr: "Volume"
  }
}