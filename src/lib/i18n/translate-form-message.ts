import i18n from '@/lib/i18n/i18n.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

const AUTH_NS = I18N_NAMESPACES.auth;
const ERRORS_NS = I18N_NAMESPACES.errors;

/** Dotted i18n keys used as Zod `message` values (e.g. `validation.emailRequired`). */
export function isLikelyI18nKey(message: string): boolean {
  // `\w` cannot match `.`, so the outer `+` and the inner `\w+` consume disjoint characters
  // and the engine has no ambiguous split to backtrack over. Anchored at both ends; matching
  // is linear in the input length.
  // eslint-disable-next-line security/detect-unsafe-regex -- \w and . are disjoint, no ambiguity
  return /^\w+(?:\.\w+)+$/.test(message);
}

/**
 * Resolve a react-hook-form / Zod field error message that may be an i18n key.
 * Falls back to the raw string when it is not a known key.
 */
export function translateFormMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (!isLikelyI18nKey(message)) return message;

  if (i18n.exists(message, { ns: AUTH_NS })) {
    return i18n.t(message, { ns: AUTH_NS });
  }
  if (i18n.exists(message, { ns: ERRORS_NS })) {
    return i18n.t(message, { ns: ERRORS_NS });
  }

  const translated = i18n.t(message);
  return translated === message ? message : translated;
}
