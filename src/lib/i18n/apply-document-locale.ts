import i18n from '@/lib/i18n/i18n.ts';
import {
  DEFAULT_TEXT_DIRECTION,
  resolvedTextDirection,
  type TextDirectionPreference,
} from '@/lib/i18n/intl-config.ts';
import { ensureActiveLocale } from '@/lib/i18n/load-namespace.ts';
import type { I18nLocale, TextDirection } from '@/lib/i18n/locales.ts';

/** Set `<html dir>` immediately (used when only the direction preference changes). */
export function applyDocumentDirection(dir: TextDirection): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = dir;
  }
}

/**
 * Load bundles, switch i18next language, and reflect the locale on the document:
 * `lang` for assistive tech + `dir` so the layout mirrors (honours an optional
 * text-direction preference — Auto follows the language, LTR/RTL force it).
 *
 * Pass `isStale` from a generation counter so a slower earlier switch cannot
 * overwrite document/i18next after a newer pick already won.
 */
export async function applyDocumentLocale(
  locale: I18nLocale,
  textDirectionPreference: TextDirectionPreference = DEFAULT_TEXT_DIRECTION,
  isStale?: () => boolean,
): Promise<void> {
  await ensureActiveLocale(locale, async () => {
    if (isStale?.()) return;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      applyDocumentDirection(resolvedTextDirection(textDirectionPreference, locale));
    }
    await i18n.changeLanguage(locale);
  });
}
