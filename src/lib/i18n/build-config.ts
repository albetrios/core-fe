import {
  type CurrencyCode,
  type CurrencyDisplayPreference,
  type DateFormatPreference,
  DEFAULT_CURRENCY_DISPLAY,
  DEFAULT_DATE_FORMAT,
  DEFAULT_HOUR_CYCLE,
  DEFAULT_NUMBER_STYLE,
  defaultCurrencyForFormatLocale,
  defaultFormatLocaleForUi,
  type FormatLocaleTag,
  type HourCyclePreference,
  isFormatLocaleTag,
  type NumberStylePreference,
} from './intl-config.ts';
import { DEFAULT_LOCALE, type I18nLocale, isI18nLocale } from './locales.ts';

/** Build-time i18n bundling strategy (BUILD_I18N_MODE). */
export type I18nBuildMode = 'single' | 'multi';

export const DEFAULT_BUILD_I18N_MODE: I18nBuildMode = 'single';
export const DEFAULT_BUILD_I18N_BCP47 = 'en-US';

/** Frozen regional defaults shipped with a single-locale build. */
export type LocaleBuildProfile = {
  locale: I18nLocale;
  formatLocale: FormatLocaleTag;
  dateFormat: DateFormatPreference;
  hourCycle: HourCyclePreference;
  numberStyle: NumberStylePreference;
  currencyDisplay: CurrencyDisplayPreference;
  currencyCode: CurrencyCode;
};

/**
 * Resolve BUILD_I18N_MODE — unknown values fall back to `single`.
 * @internal Exported for unit tests and the Vite plugin.
 */
export function resolveBuildI18nMode(flag: string | undefined): I18nBuildMode {
  if (flag === 'multi') return 'multi';
  return DEFAULT_BUILD_I18N_MODE;
}

/**
 * Normalize BUILD_I18N_LOCALE (BCP 47). Defaults to en-US; accepts en-us casing.
 * @internal Exported for unit tests and the Vite plugin.
 */
export function resolveBuildI18nBcp47(flag: string | undefined): string {
  const raw = (flag ?? DEFAULT_BUILD_I18N_BCP47).trim();
  if (!raw) return DEFAULT_BUILD_I18N_BCP47;

  const segments = raw.split('-').filter(Boolean);
  if (segments.length === 0) return DEFAULT_BUILD_I18N_BCP47;

  const language = segments[0]?.toLowerCase() ?? 'en';
  if (segments.length === 1) {
    if (language === 'en') return 'en-US';
    const region = language.toUpperCase();
    return `${language}-${region}`;
  }

  const region = segments
    .slice(1)
    .map((part, index) => (index === 0 ? part.toUpperCase() : part))
    .join('-');
  return `${language}-${region}`;
}

/** Map a BCP 47 tag to the closest supported UI locale (`en-US` → `en`). */
export function uiLocaleFromBcp47(bcp47: string): I18nLocale {
  const primary = bcp47.split('-')[0]?.toLowerCase() ?? 'en';
  return isI18nLocale(primary) ? primary : DEFAULT_LOCALE;
}

/** Resolve BUILD_I18N_LOCALE to a validated BCP 47 format tag. */
function resolveBuildFormatLocale(bcp47: string): FormatLocaleTag {
  if (isFormatLocaleTag(bcp47)) return bcp47;
  const uiLocale = uiLocaleFromBcp47(bcp47);
  return defaultFormatLocaleForUi(uiLocale);
}

/** Regional profile baked into a single-locale production bundle. */
export function localeBuildProfileFor(bcp47: string): LocaleBuildProfile {
  const locale = uiLocaleFromBcp47(bcp47);
  const formatLocale = resolveBuildFormatLocale(bcp47);
  return {
    locale,
    formatLocale,
    dateFormat: DEFAULT_DATE_FORMAT,
    hourCycle: DEFAULT_HOUR_CYCLE,
    numberStyle: DEFAULT_NUMBER_STYLE,
    currencyDisplay: DEFAULT_CURRENCY_DISPLAY,
    currencyCode: defaultCurrencyForFormatLocale(formatLocale),
  };
}
