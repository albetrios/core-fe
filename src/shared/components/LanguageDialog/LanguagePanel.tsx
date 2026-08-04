import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { appearanceChoiceClassName } from '@/lib/appearance-surface.ts';
import type { CurrencyCode } from '@/lib/i18n/intl-config.ts';
import {
  CURRENCY_CODE_LIST,
  CURRENCY_DISPLAY_LABEL_KEYS,
  CURRENCY_DISPLAY_PREFERENCE_LIST,
  DIRECTION_LABEL_KEYS,
  FIRST_DAY_LABEL_KEYS,
  LOCALE_KEYS,
  LOCALE_NS,
  LOCALE_TEST_IDS,
  MEASUREMENT_LABEL_KEYS,
  NUMBER_STYLE_LABEL_KEYS,
  NUMBER_STYLE_PREFERENCE_LIST,
} from '@/lib/i18n/locale.constants.ts';
import { cn } from '@/lib/utils.ts';
import { DateTimePrefsCard } from '@/shared/components/DateTimePrefsCard/index.ts';
import { LanguagePrefsCard } from '@/shared/components/LanguagePrefsCard/index.ts';
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
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

function FieldLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium">{children}</p>;
}

function OptionPills<T extends string>({
  ariaLabel,
  value,
  options,
  labelFor,
  onPick,
  testPrefix,
}: {
  ariaLabel: string;
  value: T;
  options: readonly T[];
  labelFor: (id: T) => string;
  onPick: (id: T) => void;
  testPrefix: string;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{ariaLabel}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              data-slot="button"
              aria-pressed={active}
              onClick={() => onPick(id)}
              data-testid={`${testPrefix}-${id}`}
              className={cn(
                appearanceChoiceClassName,
                'min-w-0 flex-1 text-center text-xs sm:flex-none',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
            >
              {labelFor(id)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Language + money formatting for the Language & region dialog. Date/time and
 * regional format locale live in {@link DateTimePrefsCard} (also surfaced in
 * Appearance so single-locale builds can still override display).
 */
export function LanguagePanel() {
  const { t } = useTranslation(LOCALE_NS);
  const numberStyle = useLocaleStore((s) => s.numberStyle);
  const currencyDisplay = useLocaleStore((s) => s.currencyDisplay);
  const currencyCode = useLocaleStore((s) => s.currencyCode);
  const setNumberStyle = useLocaleStore((s) => s.setNumberStyle);
  const setCurrencyDisplay = useLocaleStore((s) => s.setCurrencyDisplay);
  const setCurrencyCode = useLocaleStore((s) => s.setCurrencyCode);
  const {
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    direction,
    firstDayOfWeek,
    measurementSystem,
  } = useLocaleFormat();

  const previews = useMemo(
    () => ({
      sampleNumber: formatNumber(1284750.5, { maximumFractionDigits: 1 }),
      sampleRelative: formatRelativeTime(
        '2026-06-25T12:30:45.000Z',
        new Date('2026-06-25T14:30:45.000Z'),
      ),
      sampleCurrency: formatCurrency(9900),
    }),
    [formatNumber, formatRelativeTime, formatCurrency],
  );

  return (
    <div className="flex flex-col gap-4" data-testid={LOCALE_TEST_IDS.panel}>
      <LanguagePrefsCard />
      <DateTimePrefsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(LOCALE_KEYS.numberStyleHeading)}</CardTitle>
          <CardDescription>{t(LOCALE_KEYS.formatLocaleDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <FieldLabel>{t(LOCALE_KEYS.numberStyleHeading)}</FieldLabel>
            <OptionPills
              ariaLabel={t(LOCALE_KEYS.numberStyleHeading)}
              value={numberStyle}
              options={NUMBER_STYLE_PREFERENCE_LIST}
              labelFor={(id) =>
                // eslint-disable-next-line security/detect-object-injection -- fixed preference catalog
                t(NUMBER_STYLE_LABEL_KEYS[id])
              }
              onPick={(id) => setNumberStyle(id)}
              testPrefix="number-style"
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t(LOCALE_KEYS.currencyDisplayHeading)}</FieldLabel>
            <OptionPills
              ariaLabel={t(LOCALE_KEYS.currencyDisplayHeading)}
              value={currencyDisplay}
              options={CURRENCY_DISPLAY_PREFERENCE_LIST}
              labelFor={(id) =>
                // eslint-disable-next-line security/detect-object-injection -- fixed preference catalog
                t(CURRENCY_DISPLAY_LABEL_KEYS[id])
              }
              onPick={(id) => setCurrencyDisplay(id)}
              testPrefix="currency-display"
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t(LOCALE_KEYS.currencyCodeHeading)}</FieldLabel>
            <Select
              value={currencyCode}
              onValueChange={(value) => setCurrencyCode(value as CurrencyCode)}
            >
              <SelectTrigger
                aria-label={t(LOCALE_KEYS.currencyCodeHeading)}
                data-testid="currency-code-select"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[90] max-h-64">
                {CURRENCY_CODE_LIST.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    data-testid={`currency-code-${entry.id.toLowerCase()}`}
                  >
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t(LOCALE_KEYS.previewHeading)}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-1 text-xs">
          <p>{t(LOCALE_KEYS.previewNumber, { value: previews.sampleNumber })}</p>
          <p>{t(LOCALE_KEYS.previewRelative, { value: previews.sampleRelative })}</p>
          <p>{t(LOCALE_KEYS.previewCurrency, { value: previews.sampleCurrency })}</p>
          <p data-testid="locale-preview-direction">
            {t(LOCALE_KEYS.previewDirection, {
              // eslint-disable-next-line security/detect-object-injection -- fixed direction catalog
              value: t(DIRECTION_LABEL_KEYS[direction]),
            })}
          </p>
          <p data-testid="locale-preview-first-day">
            {t(LOCALE_KEYS.previewFirstDay, {
              // eslint-disable-next-line security/detect-object-injection -- fixed first-day catalog
              value: t(FIRST_DAY_LABEL_KEYS[firstDayOfWeek]),
            })}
          </p>
          <p data-testid="locale-preview-measurement">
            {t(LOCALE_KEYS.previewMeasurement, {
              // eslint-disable-next-line security/detect-object-injection -- fixed measurement catalog
              value: t(MEASUREMENT_LABEL_KEYS[measurementSystem]),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
