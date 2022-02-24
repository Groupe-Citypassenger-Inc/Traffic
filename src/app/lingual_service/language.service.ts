import { Injectable } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import * as metricAlternativeName from '../../assets/json/metric_name_for_human.json';

const frenchRangeLabel = (page: number, pageSize: number, length: number) => {
  if (length === 0 || pageSize === 0) { return `0 sur ${length}`; }

  length = Math.max(length, 0);

  const startIndex = page * pageSize;

  const endIndex = startIndex < length ?
    Math.min(startIndex + pageSize, length) :
    startIndex + pageSize;

  return `${startIndex + 1} - ${endIndex} sur ${length}`;
};

const languageList = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  language: string;
  languageList = languageList;
  site_language: string = 'English';

  metricAlternativeName: any = (metricAlternativeName as any).default;

  getLanguage(): string {
    this.language = window.localStorage.getItem('language') || 'en';
    this.site_language = languageList.find(
      f => f.code === this.language,
    ).label;
    return this.language;
  }

  setLanguage(lang): void {
    window.localStorage.setItem('language', lang);
    this.site_language = languageList.find(
      f => f.code === this.language,
    ).label;
  }

  translatePaginator(paginator: MatPaginator): MatPaginator {
    paginator._intl.firstPageLabel = 'Première page';
    paginator._intl.itemsPerPageLabel = 'Nombre d\'éléments par page';
    paginator._intl.lastPageLabel = 'Dernière page';
    paginator._intl.nextPageLabel = 'Page suivante';
    paginator._intl.previousPageLabel = 'Page précédente ';
    paginator._intl.getRangeLabel = frenchRangeLabel;
    return paginator;
  }
}
