import { useTranslation } from 'react-i18next';

import {
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
import { OptionPills } from '@/shared/components/OptionPills/index.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Check } from '@/shared/icons/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

/**
 * UI language + text-direction controls — persisted via {@link useLocaleStore}.
 * Surfaced in Appearance. Language tiles hide on single-locale builds;
 * direction pills always show so RTL can be forced live.
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
        <CardDescription>
          {multiLocale
            ? t(LOCALE_KEYS.languageDescription)
            : t(LOCALE_KEYS.languageDirectionDescription)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {multiLocale ? (
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{t(LOCALE_KEYS.languageHeading)}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
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
                      active
                        ? appearanceTileActiveClassName
                        : appearanceTileIdleClassName,
                    )}
                  >
                    <span>
                      {}
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
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-2">
          {multiLocale ? (
            <p className="text-sm font-medium">{t(LOCALE_KEYS.textDirectionHeading)}</p>
          ) : null}
          <OptionPills
            ariaLabel={t(LOCALE_KEYS.textDirectionHeading)}
            value={textDirection}
            options={TEXT_DIRECTION_PREFERENCE_LIST}
            labelFor={(id) => t(TEXT_DIRECTION_LABEL_KEYS[id])}
            onPick={(id) => setTextDirection(id)}
            testPrefix="text-direction"
          />
        </div>
      </CardContent>
    </Card>
  );
}
