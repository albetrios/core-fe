import i18n from '@/lib/i18n/i18n.ts';
import {
  DEFAULT_TEXT_DIRECTION,
  resolvedTextDirection,
  type TextDirectionPreference,
} from '@/lib/i18n/intl-config.ts';
import { ensureLocale } from '@/lib/i18n/load-namespace.ts';
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
 */
export async function applyDocumentLocale(
  locale: I18nLocale,
  textDirectionPreference: TextDirectionPreference = DEFAULT_TEXT_DIRECTION,
): Promise<void> {
  await ensureLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    applyDocumentDirection(resolvedTextDirection(textDirectionPreference, locale));
  }
  await i18n.changeLanguage(locale);
}
