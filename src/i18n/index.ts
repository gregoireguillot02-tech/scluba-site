import fr from './fr.json';
import en from './en.json';

export type Locale = 'fr' | 'en';

const dictionaries = { fr, en } as const;

export function useT(locale: Locale) {
  return dictionaries[locale];
}

export function altLocaleHref(currentLocale: Locale): string {
  return currentLocale === 'fr' ? '/en/' : '/';
}
