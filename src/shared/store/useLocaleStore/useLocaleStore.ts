import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  applyDocumentDirection,
  applyDocumentLocale,
} from '@/lib/i18n/apply-document-locale.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  getBuildLocaleProfile,
  I18N_BUILD_UI_LOCALE,
} from '@/lib/i18n/i18n-resources.ts';
import {
  type CurrencyCode,
  type CurrencyDisplayPreference,
  type DateFormatPreference,
  DEFAULT_CURRENCY_CODE,
  DEFAULT_CURRENCY_DISPLAY,
  DEFAULT_DATE_FORMAT,
  DEFAULT_FORMAT_LOCALE,
  DEFAULT_HOUR_CYCLE,
  DEFAULT_NUMBER_STYLE,
  DEFAULT_TEXT_DIRECTION,
  DEFAULT_TIME_ZONE,
  defaultCurrencyForFormatLocale,
  defaultFormatLocaleForUi,
  type FormatLocaleTag,
  type HourCyclePreference,
  normalizeCurrencyCode,
  normalizeCurrencyDisplayPreference,
  normalizeDateFormatPreference,
  normalizeFormatLocaleTag,
  normalizeHourCyclePreference,
  normalizeNumberStylePreference,
  normalizeTextDirectionPreference,
  normalizeTimeZonePreference,
  type NumberStylePreference,
  resolvedTextDirection,
  type TextDirectionPreference,
  type TimeZonePreference,
} from '@/lib/i18n/intl-config.ts';
import { cancelLocaleTransition, preloadLocaleIdle } from '@/lib/i18n/load-namespace.ts';
import { DEFAULT_LOCALE, type I18nLocale, isI18nLocale } from '@/lib/i18n/locales.ts';

interface LocaleStore {
  isLocaleReady: boolean;
  recoverInitialLocale: () => Promise<void>;
  locale: I18nLocale;
  formatLocale: FormatLocaleTag;
  dateFormat: DateFormatPreference;
  hourCycle: HourCyclePreference;
  timeZone: TimeZonePreference;
  textDirection: TextDirectionPreference;
  numberStyle: NumberStylePreference;
  currencyDisplay: CurrencyDisplayPreference;
  currencyCode: CurrencyCode;
  setLocale: (locale: I18nLocale) => Promise<void>;
  setFormatLocale: (formatLocale: FormatLocaleTag) => void;
  setDateFormat: (dateFormat: DateFormatPreference) => void;
  setHourCycle: (hourCycle: HourCyclePreference) => void;
  setTimeZone: (timeZone: TimeZonePreference) => void;
  setTextDirection: (textDirection: TextDirectionPreference) => void;
  setNumberStyle: (numberStyle: NumberStylePreference) => void;
  setCurrencyDisplay: (currencyDisplay: CurrencyDisplayPreference) => void;
  setCurrencyCode: (currencyCode: CurrencyCode) => void;
}

function initialLocaleState(): Pick<
  LocaleStore,
  | 'locale'
  | 'formatLocale'
  | 'dateFormat'
  | 'hourCycle'
  | 'timeZone'
  | 'textDirection'
  | 'numberStyle'
  | 'currencyDisplay'
  | 'currencyCode'
> {
  const profile = getBuildLocaleProfile();
  if (profile) {
    return {
      ...profile,
      timeZone: DEFAULT_TIME_ZONE,
      textDirection: DEFAULT_TEXT_DIRECTION,
    };
  }
  return {
    locale: DEFAULT_LOCALE,
    formatLocale: DEFAULT_FORMAT_LOCALE,
    dateFormat: DEFAULT_DATE_FORMAT,
    hourCycle: DEFAULT_HOUR_CYCLE,
    timeZone: DEFAULT_TIME_ZONE,
    textDirection: DEFAULT_TEXT_DIRECTION,
    numberStyle: DEFAULT_NUMBER_STYLE,
    currencyDisplay: DEFAULT_CURRENCY_DISPLAY,
    currencyCode: DEFAULT_CURRENCY_CODE,
  };
}

/**
 * Bumps on every locale apply — boot rehydrate, build-lock, and `setLocale`
 * alike — so a slower earlier apply cannot win the race and flip `<html>` +
 * i18next back after a newer one has landed.
 */
let localeApplyGeneration = 0;

/** Claims the current apply generation; the returned predicate reports staleness. */
function beginLocaleApply(): () => boolean {
  cancelLocaleTransition();
  const generation = ++localeApplyGeneration;
  return () => generation !== localeApplyGeneration;
}

/** Initial readiness includes translations, not just persisted preferences. */
async function applyInitialLocale(
  state: LocaleStore | undefined,
  isStale: () => boolean,
) {
  if (isStale()) {
    const current = useLocaleStore.getState();
    applyDocumentDirection(resolvedTextDirection(current.textDirection, current.locale));
    return;
  }
  if (!state) {
    await useLocaleStore.getState().recoverInitialLocale();
    return;
  }
  const locale = getBuildLocaleProfile()?.locale ?? state.locale;
  try {
    await applyDocumentLocale(locale, state.textDirection, isStale);
    if (!isStale()) useLocaleStore.setState({ locale, isLocaleReady: true });
  } catch {
    if (!isStale()) await useLocaleStore.getState().recoverInitialLocale();
  }
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set, get) => ({
      ...initialLocaleState(),
      isLocaleReady: false,
      recoverInitialLocale: async () => {
        if (get().isLocaleReady) return;
        const isStale = beginLocaleApply();
        // Recovery uses bundled resources, never another deferred namespace fetch.
        await i18n.changeLanguage(I18N_BUILD_UI_LOCALE);
        if (isStale()) return;
        if (typeof document !== 'undefined')
          document.documentElement.lang = I18N_BUILD_UI_LOCALE;
        applyDocumentDirection(
          resolvedTextDirection(get().textDirection, I18N_BUILD_UI_LOCALE),
        );
        set({ locale: I18N_BUILD_UI_LOCALE, isLocaleReady: true });
      },
      setLocale: async (locale) => {
        const isStale = beginLocaleApply();
        await applyDocumentLocale(locale, get().textDirection, isStale);
        if (isStale()) return;
        // Language carries regional format + currency. Timezone is left alone —
        // clobbering `auto` or a user pick with a region default caused silent
        // calendar day shifts once display TZ was wired into formatters.
        const formatLocale = defaultFormatLocaleForUi(locale);
        set({
          locale,
          isLocaleReady: true,
          formatLocale,
          currencyCode: defaultCurrencyForFormatLocale(formatLocale),
        });
        preloadLocaleIdle(locale);
      },
      // Region snaps currency. Timezone is never clobbered — same posture as setLocale.
      setFormatLocale: (formatLocale) =>
        set({
          formatLocale,
          currencyCode: defaultCurrencyForFormatLocale(formatLocale),
        }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setHourCycle: (hourCycle) => set({ hourCycle }),
      setTimeZone: (timeZone) => set({ timeZone }),
      setTextDirection: (textDirection) => {
        set({ textDirection });
        applyDocumentDirection(resolvedTextDirection(textDirection, get().locale));
      },
      setNumberStyle: (numberStyle) => set({ numberStyle }),
      setCurrencyDisplay: (currencyDisplay) => set({ currencyDisplay }),
      setCurrencyCode: (currencyCode) => set({ currencyCode }),
    }),
    {
      name: 'locale-preference',
      version: 7,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<LocaleStore>),
        // Late storage cannot undo timeout recovery or a newer language choice.
        ...(current.isLocaleReady ? { locale: current.locale } : {}),
        isLocaleReady: current.isLocaleReady,
        recoverInitialLocale: current.recoverInitialLocale,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<LocaleStore> | undefined;
        if (!state || typeof state !== 'object') {
          return {
            locale: DEFAULT_LOCALE,
            formatLocale: DEFAULT_FORMAT_LOCALE,
            dateFormat: DEFAULT_DATE_FORMAT,
            hourCycle: DEFAULT_HOUR_CYCLE,
            timeZone: DEFAULT_TIME_ZONE,
            textDirection: DEFAULT_TEXT_DIRECTION,
            numberStyle: DEFAULT_NUMBER_STYLE,
            currencyDisplay: DEFAULT_CURRENCY_DISPLAY,
            currencyCode: DEFAULT_CURRENCY_CODE,
          };
        }
        const locale = isI18nLocale(state.locale ?? '') ? state.locale : DEFAULT_LOCALE;
        return {
          locale,
          formatLocale: normalizeFormatLocaleTag(state.formatLocale, locale),
          dateFormat: normalizeDateFormatPreference(state.dateFormat),
          hourCycle: normalizeHourCyclePreference(state.hourCycle),
          timeZone: normalizeTimeZonePreference(state.timeZone),
          textDirection: normalizeTextDirectionPreference(state.textDirection),
          numberStyle: normalizeNumberStylePreference(state.numberStyle),
          currencyDisplay: normalizeCurrencyDisplayPreference(state.currencyDisplay),
          currencyCode: normalizeCurrencyCode(state.currencyCode),
        };
      },
      partialize: (state) => ({
        locale: state.locale,
        formatLocale: state.formatLocale,
        dateFormat: state.dateFormat,
        hourCycle: state.hourCycle,
        timeZone: state.timeZone,
        textDirection: state.textDirection,
        numberStyle: state.numberStyle,
        currencyDisplay: state.currencyDisplay,
        currencyCode: state.currencyCode,
      }),
      onRehydrateStorage: () => {
        const isStale = beginLocaleApply();
        return (state) => {
          // Synchronous hydration runs inside create(), before the store binding exists.
          queueMicrotask(() => {
            void applyInitialLocale(state, isStale);
          });
        };
      },
    },
  ),
);

/** Current regional formatting prefs (for Intl formatters). */
export function localeFormatPrefs(
  state: Pick<
    LocaleStore,
    | 'locale'
    | 'formatLocale'
    | 'dateFormat'
    | 'hourCycle'
    | 'timeZone'
    | 'numberStyle'
    | 'currencyDisplay'
    | 'currencyCode'
  >,
) {
  return {
    locale: state.locale,
    formatLocale: state.formatLocale,
    dateFormat: state.dateFormat,
    hourCycle: state.hourCycle,
    timeZone: state.timeZone,
    numberStyle: state.numberStyle,
    currencyDisplay: state.currencyDisplay,
    currencyCode: state.currencyCode,
  };
}
