import {
  CURRENCY_CODES,
  CURRENCY_DISPLAY_PREFERENCES,
  type CurrencyDisplayPreference,
  DATE_FORMAT_PREFERENCES,
  type DateFormatPreference,
  type FirstDayOfWeek,
  FORMAT_LOCALE_TAGS,
  type FormatLocaleTag,
  HOUR_CYCLE_PREFERENCES,
  type HourCyclePreference,
  type MeasurementSystem,
  NUMBER_STYLE_PREFERENCES,
  type NumberStylePreference,
  TEXT_DIRECTION_PREFERENCES,
  type TextDirectionPreference,
  TIME_ZONE_TAGS,
  type TimeZonePreference,
} from './intl-config.ts';
import type { I18nLocale, TextDirection } from './locales.ts';
import { I18N_NAMESPACES } from './namespaces.ts';

export const LOCALE_NS = I18N_NAMESPACES.common;

export const LOCALE_KEYS = {
  openAria: 'language.openAria',
  closeAria: 'a11y.close',
  loading: 'a11y.loading',
  loadingPage: 'a11y.loadingPage',
  toggleTheme: 'a11y.toggleTheme',
  openAppearance: 'a11y.openAppearance',
  cookieConsent: 'a11y.cookieConsent',
  rowsPerPage: 'a11y.rowsPerPage',
  goFirstPage: 'a11y.goFirstPage',
  goPreviousPage: 'a11y.goPreviousPage',
  goNextPage: 'a11y.goNextPage',
  goLastPage: 'a11y.goLastPage',
  selectAll: 'a11y.selectAll',
  copyAccountId: 'a11y.copyAccountId',
  onboardingProgress: 'a11y.onboardingProgress',
  themeCode: 'a11y.themeCode',
  mode: 'a11y.mode',
  en: 'language.en',
  es: 'language.es',
  zh: 'language.zh',
  fr: 'language.fr',
  de: 'language.de',
  ja: 'language.ja',
  pt: 'language.pt',
  ar: 'language.ar',
  hi: 'language.hi',
  ko: 'language.ko',
  it: 'language.it',
  languageHeading: 'language.heading',
  languageDescription: 'language.description',
  languageDirectionDescription: 'language.directionDescription',
  formatLocaleHeading: 'formatLocale.heading',
  formatLocaleDescription: 'formatLocale.description',
  dateTimeHeading: 'dateTime.heading',
  dateTimeDescription: 'dateTime.description',
  timeZoneHeading: 'timeZone.heading',
  timeZoneDevice: 'timeZone.device',
  dateFormatHeading: 'dateFormat.heading',
  hourCycleHeading: 'hourCycle.heading',
  textDirectionHeading: 'direction.heading',
  numberStyleHeading: 'numberStyle.heading',
  numberStyleDescription: 'numberStyle.description',
  currencyDisplayHeading: 'currencyDisplay.heading',
  currencyCodeHeading: 'currencyCode.heading',
  previewHeading: 'localePreview.heading',
  previewDate: 'dateFormat.previewDate',
  previewNumber: 'dateFormat.previewNumber',
  previewRelative: 'dateFormat.previewRelative',
  previewTime: 'dateFormat.previewTime',
  previewTimeZone: 'timeZone.preview',
  previewCurrency: 'localePreview.currency',
  previewDirection: 'localePreview.direction',
  previewFirstDay: 'localePreview.firstDay',
  previewMeasurement: 'localePreview.measurement',
} as const;

/** Resolved direction labels (preview of concrete ltr/rtl). */
export const DIRECTION_LABEL_KEYS: Record<TextDirection, string> = {
  ltr: 'direction.ltr',
  rtl: 'direction.rtl',
};

/** Preference picker labels including Auto. */
export const TEXT_DIRECTION_LABEL_KEYS: Record<TextDirectionPreference, string> = {
  auto: 'direction.auto',
  ltr: 'direction.ltr',
  rtl: 'direction.rtl',
};

export const FIRST_DAY_LABEL_KEYS: Record<FirstDayOfWeek, string> = {
  saturday: 'firstDay.saturday',
  sunday: 'firstDay.sunday',
  monday: 'firstDay.monday',
};

export const MEASUREMENT_LABEL_KEYS: Record<MeasurementSystem, string> = {
  metric: 'measurement.metric',
  imperial: 'measurement.imperial',
};

export const LOCALE_LABEL_KEYS: Record<I18nLocale, string> = {
  en: LOCALE_KEYS.en,
  es: LOCALE_KEYS.es,
  zh: LOCALE_KEYS.zh,
  fr: LOCALE_KEYS.fr,
  de: LOCALE_KEYS.de,
  ja: LOCALE_KEYS.ja,
  pt: LOCALE_KEYS.pt,
  ar: LOCALE_KEYS.ar,
  hi: LOCALE_KEYS.hi,
  ko: LOCALE_KEYS.ko,
  it: LOCALE_KEYS.it,
};

export const DATE_FORMAT_LABEL_KEYS: Record<DateFormatPreference, string> = {
  auto: 'dateFormat.auto',
  short: 'dateFormat.short',
  medium: 'dateFormat.medium',
  long: 'dateFormat.long',
  full: 'dateFormat.full',
  iso: 'dateFormat.iso',
  date: 'dateFormat.date',
  time: 'dateFormat.time',
  datetime: 'dateFormat.datetime',
};

export const HOUR_CYCLE_LABEL_KEYS: Record<HourCyclePreference, string> = {
  auto: 'hourCycle.auto',
  h12: 'hourCycle.h12',
  h23: 'hourCycle.h23',
};

export const NUMBER_STYLE_LABEL_KEYS: Record<NumberStylePreference, string> = {
  auto: 'numberStyle.auto',
  standard: 'numberStyle.standard',
  compact: 'numberStyle.compact',
  engineering: 'numberStyle.engineering',
  scientific: 'numberStyle.scientific',
};

export const CURRENCY_DISPLAY_LABEL_KEYS: Record<CurrencyDisplayPreference, string> = {
  auto: 'currencyDisplay.auto',
  symbol: 'currencyDisplay.symbol',
  narrowSymbol: 'currencyDisplay.narrowSymbol',
  code: 'currencyDisplay.code',
  name: 'currencyDisplay.name',
};

export const DATE_FORMAT_PREFERENCE_LIST = DATE_FORMAT_PREFERENCES;
export const HOUR_CYCLE_PREFERENCE_LIST = HOUR_CYCLE_PREFERENCES;
export const NUMBER_STYLE_PREFERENCE_LIST = NUMBER_STYLE_PREFERENCES;
export const CURRENCY_DISPLAY_PREFERENCE_LIST = CURRENCY_DISPLAY_PREFERENCES;
/** Ordered list of text-direction preference ids for the prefs UI. */
export const TEXT_DIRECTION_PREFERENCE_LIST = TEXT_DIRECTION_PREFERENCES;
export const FORMAT_LOCALE_LIST = FORMAT_LOCALE_TAGS;
export const CURRENCY_CODE_LIST = CURRENCY_CODES;
/** Catalog of selectable IANA timezone tags (plus `auto`). */
export const TIME_ZONE_LIST = TIME_ZONE_TAGS;

export const LOCALE_TEST_IDS = {
  languageCard: 'language-prefs',
  dateTimeCard: 'date-time-prefs',
  moneyCard: 'money-prefs',
  menuItem: (code: string) => `language-${code}`,
  formatLocaleItem: (tag: string) => `format-locale-${tag.replace(/-/g, '_')}`,
  timeZoneItem: (zone: string) => `time-zone-${zone.replace(/\//g, '_')}`,
  dateFormatItem: (style: string) => `date-format-${style}`,
  hourCycleItem: (style: string) => `hour-cycle-${style}`,
  textDirectionItem: (style: string) => `text-direction-${style}`,
  numberStyleItem: (style: string) => `number-style-${style}`,
  currencyDisplayItem: (style: string) => `currency-display-${style}`,
  currencyCodeItem: (code: string) => `currency-code-${code.toLowerCase()}`,
} as const;

/** Stable test id for a timezone option in the prefs select. */
export function timeZoneTestId(zone: TimeZonePreference): string {
  return LOCALE_TEST_IDS.timeZoneItem(zone);
}

export function formatLocaleTestId(tag: FormatLocaleTag): string {
  return LOCALE_TEST_IDS.formatLocaleItem(tag);
}
