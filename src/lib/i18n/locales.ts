/** Supported UI locales — register matching JSON under `src/locales/<code>/`. */
export const I18N_LOCALES = [
  'en',
  'es',
  'zh',
  'fr',
  'de',
  'ja',
  'pt',
  'ar',
  'hi',
  'ko',
  'it',
] as const;

export type I18nLocale = (typeof I18N_LOCALES)[number];

export const DEFAULT_LOCALE: I18nLocale = 'en';

export function isI18nLocale(value: string): value is I18nLocale {
  return (I18N_LOCALES as readonly string[]).includes(value);
}

/** Native labels for the language picker (shown in every locale). */
export const LOCALE_NATIVE_LABELS: Record<I18nLocale, string> = {
  en: 'English',
  es: 'Español',
  zh: '中文',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
  pt: 'Português',
  ar: 'العربية',
  hi: 'हिन्दी',
  ko: '한국어',
  it: 'Italiano',
};

/**
 * Locales that translate only `common.json` (other namespaces fall back to
 * English). Empty — every {@link I18N_LOCALES} language now ships full
 * namespace coverage.
 */
export const PARTIAL_UI_LOCALES: ReadonlySet<I18nLocale> = new Set([]);

export type TextDirection = 'ltr' | 'rtl';

/** Locales whose script reads right-to-left — the whole UI mirrors for these. */
export const RTL_LOCALES: ReadonlySet<I18nLocale> = new Set(['ar']);

/** Text direction for a UI locale — drives `<html dir>` so the layout mirrors. */
export function localeDirection(locale: I18nLocale): TextDirection {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
