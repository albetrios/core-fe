import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateValue } from '@/lib/i18n/format.ts';
import {
  type FormatLocaleTag,
  LOCALE_FORMAT_SAMPLES,
  type TimeZonePreference,
} from '@/lib/i18n/intl-config.ts';
import {
  DATE_FORMAT_LABEL_KEYS,
  DATE_FORMAT_PREFERENCE_LIST,
  FORMAT_LOCALE_LIST,
  formatLocaleTestId,
  HOUR_CYCLE_LABEL_KEYS,
  HOUR_CYCLE_PREFERENCE_LIST,
  LOCALE_KEYS,
  LOCALE_NS,
  LOCALE_TEST_IDS,
  TIME_ZONE_LIST,
  timeZoneTestId,
} from '@/lib/i18n/locale.constants.ts';
import { FieldLabel, OptionPills } from '@/shared/components/OptionPills/index.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import {
  localeFormatPrefs,
  useLocaleStore,
} from '@/shared/store/useLocaleStore/index.ts';

/**
 * Device-local date/time controls — regional format locale (country), IANA
 * timezone, date style, and clock cycle. Persisted via {@link useLocaleStore};
 * changes apply live to every `formatDate` / `<FormattedDate />` consumer.
 */
export function DateTimePrefsCard() {
  const { t } = useTranslation(LOCALE_NS);
  const locale = useLocaleStore((s) => s.locale);
  const formatLocale = useLocaleStore((s) => s.formatLocale);
  const dateFormat = useLocaleStore((s) => s.dateFormat);
  const hourCycle = useLocaleStore((s) => s.hourCycle);
  const timeZone = useLocaleStore((s) => s.timeZone);
  const numberStyle = useLocaleStore((s) => s.numberStyle);
  const currencyDisplay = useLocaleStore((s) => s.currencyDisplay);
  const currencyCode = useLocaleStore((s) => s.currencyCode);
  const setFormatLocale = useLocaleStore((s) => s.setFormatLocale);
  const setDateFormat = useLocaleStore((s) => s.setDateFormat);
  const setHourCycle = useLocaleStore((s) => s.setHourCycle);
  const setTimeZone = useLocaleStore((s) => s.setTimeZone);

  const previews = useMemo(() => {
    const prefs = localeFormatPrefs({
      locale,
      formatLocale,
      dateFormat,
      hourCycle,
      timeZone,
      numberStyle,
      currencyDisplay,
      currencyCode,
    });
    return {
      sampleDateTime: formatDateValue(LOCALE_FORMAT_SAMPLES.dateIso, prefs),
      sampleTimeOnly: formatDateValue(LOCALE_FORMAT_SAMPLES.dateIso, {
        ...prefs,
        dateFormat: 'time',
      }),
      zoneLabel:
        timeZone === 'auto'
          ? t(LOCALE_KEYS.timeZoneDevice)
          : (TIME_ZONE_LIST.find((entry) => entry.id === timeZone)?.label ?? timeZone),
    };
  }, [
    t,
    locale,
    formatLocale,
    dateFormat,
    hourCycle,
    timeZone,
    numberStyle,
    currencyDisplay,
    currencyCode,
  ]);

  return (
    <Card data-testid={LOCALE_TEST_IDS.dateTimeCard}>
      <CardHeader>
        <CardTitle className="text-base">{t(LOCALE_KEYS.dateTimeHeading)}</CardTitle>
        <CardDescription>{t(LOCALE_KEYS.dateTimeDescription)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <FieldLabel>{t(LOCALE_KEYS.formatLocaleHeading)}</FieldLabel>
          <Select
            value={formatLocale}
            onValueChange={(value) => setFormatLocale(value as FormatLocaleTag)}
          >
            <SelectTrigger
              aria-label={t(LOCALE_KEYS.formatLocaleHeading)}
              data-testid="format-locale-select"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[90] max-h-64">
              {FORMAT_LOCALE_LIST.map((entry) => (
                <SelectItem
                  key={entry.id}
                  value={entry.id}
                  data-testid={formatLocaleTestId(entry.id)}
                >
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>{t(LOCALE_KEYS.timeZoneHeading)}</FieldLabel>
          <Select
            value={timeZone}
            onValueChange={(value) => setTimeZone(value as TimeZonePreference)}
          >
            <SelectTrigger
              aria-label={t(LOCALE_KEYS.timeZoneHeading)}
              data-testid="time-zone-select"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[90] max-h-64">
              {TIME_ZONE_LIST.map((entry) => (
                <SelectItem
                  key={entry.id}
                  value={entry.id}
                  data-testid={timeZoneTestId(entry.id)}
                >
                  {entry.id === 'auto' ? t(LOCALE_KEYS.timeZoneDevice) : entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>{t(LOCALE_KEYS.dateFormatHeading)}</FieldLabel>
          <OptionPills
            ariaLabel={t(LOCALE_KEYS.dateFormatHeading)}
            value={dateFormat}
            options={DATE_FORMAT_PREFERENCE_LIST}
            labelFor={(id) => t(DATE_FORMAT_LABEL_KEYS[id])}
            onPick={(id) => setDateFormat(id)}
            testPrefix="date-format"
          />
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>{t(LOCALE_KEYS.hourCycleHeading)}</FieldLabel>
          <OptionPills
            ariaLabel={t(LOCALE_KEYS.hourCycleHeading)}
            value={hourCycle}
            options={HOUR_CYCLE_PREFERENCE_LIST}
            labelFor={(id) => t(HOUR_CYCLE_LABEL_KEYS[id])}
            onPick={(id) => setHourCycle(id)}
            testPrefix="hour-cycle"
          />
        </div>

        <div className="bg-muted/30 text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
          <p>{t(LOCALE_KEYS.previewDate, { value: previews.sampleDateTime })}</p>
          <p>{t(LOCALE_KEYS.previewTime, { value: previews.sampleTimeOnly })}</p>
          <p data-testid="locale-preview-timezone">
            {t(LOCALE_KEYS.previewTimeZone, { value: previews.zoneLabel })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
