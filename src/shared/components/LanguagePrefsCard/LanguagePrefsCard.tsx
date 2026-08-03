import { useTranslation } from 'react-i18next';

import {
  appearanceChoiceClassName,
  appearanceRowTileClassName,
  appearanceTileActiveClassName,
  appearanceTileIdleClassName,
} from '@/lib/appearance-surface.ts';
import { isMultiLocaleBuild } from '@/lib/i18n/build-runtime.ts';
import {
  LOCALE_KEYS,
  LOCALE_LABEL_KEYS,
  LOCALE_NS,
  LOCALE_TEST_IDS,
  TEXT_DIRECTION_LABEL_KEYS,
  TEXT_DIRECTION_PREFERENCE_LIST,
} from '@/lib/i18n/locale.constants.ts';
import { I18N_LOCALES, LOCALE_NATIVE_LABELS } from '@/lib/i18n/locales.ts';
import { cn } from '@/lib/utils.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Check } from '@/shared/icons/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

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
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
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
  );
}

/**
 * UI language + text-direction controls — persisted via {@link useLocaleStore}.
 * Surfaced in Appearance (and Language & region). Language tiles hide on
 * single-locale builds; direction pills always show so RTL can be forced live.
 */
export function LanguagePrefsCard() {
  const { t } = useTranslation(LOCALE_NS);
  const locale = useLocaleStore((s) => s.locale);
  const textDirection = useLocaleStore((s) => s.textDirection);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const setTextDirection = useLocaleStore((s) => s.setTextDirection);
  const multiLocale = isMultiLocaleBuild();

  return (
    <Card data-testid={LOCALE_TEST_IDS.languageCard}>
      <CardHeader>
        <CardTitle className="text-base">
          {multiLocale
            ? t(LOCALE_KEYS.languageHeading)
            : t(LOCALE_KEYS.textDirectionHeading)}
        </CardTitle>
        <CardDescription>Saved on this device — changes apply live.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {multiLocale ? (
          <div
            className="grid gap-2 sm:grid-cols-2"
            role="group"
            aria-label={t(LOCALE_KEYS.languageHeading)}
          >
            {I18N_LOCALES.map((code) => {
              const active = locale === code;
              return (
                <button
                  key={code}
                  type="button"
                  data-slot="button"
                  aria-pressed={active}
                  onClick={() => void setLocale(code)}
                  data-testid={LOCALE_TEST_IDS.menuItem(code)}
                  className={cn(
                    appearanceRowTileClassName,
                    active ? appearanceTileActiveClassName : appearanceTileIdleClassName,
                  )}
                >
                  <span>
                    {/* eslint-disable-next-line security/detect-object-injection -- fixed locale catalog */}
                    {t(LOCALE_LABEL_KEYS[code], {
                      defaultValue: LOCALE_NATIVE_LABELS[code],
                    })}
                  </span>
                  {active ? (
                    <Check className="text-primary size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {multiLocale ? (
            <p className="text-sm font-medium">{t(LOCALE_KEYS.textDirectionHeading)}</p>
          ) : null}
          <OptionPills
            ariaLabel={t(LOCALE_KEYS.textDirectionHeading)}
            value={textDirection}
            options={TEXT_DIRECTION_PREFERENCE_LIST}
            labelFor={(id) =>
              // eslint-disable-next-line security/detect-object-injection -- fixed preference catalog
              t(TEXT_DIRECTION_LABEL_KEYS[id])
            }
            onPick={(id) => setTextDirection(id)}
            testPrefix="text-direction"
          />
        </div>
      </CardContent>
    </Card>
  );
}
