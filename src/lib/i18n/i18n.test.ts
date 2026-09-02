import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { i18n } from '@/lib/i18n/index.ts';
import { ensureLocale, ensureNamespace } from '@/lib/i18n/load-namespace.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

describe('i18n bootstrap', () => {
  it('loads the onboarding namespace with English strings', async () => {
    await ensureNamespace('en', I18N_NAMESPACES.onboarding);
    expect(i18n.t('steps.welcome.title', { ns: I18N_NAMESPACES.onboarding })).toBe(
      'Welcome aboard',
    );
  });

  it('loads Spanish auth strings when language is es', async () => {
    await ensureNamespace('es', I18N_NAMESPACES.auth);
    await i18n.changeLanguage('es');
    expect(i18n.t('mfa.heading', { ns: I18N_NAMESPACES.auth })).toBe(
      'Autenticación en dos pasos',
    );
    await i18n.changeLanguage('en');
  });
});

/**
 * Arabic CLDR defines SIX cardinal plural categories — zero, one, two, few,
 * many, other — where English has two. A locale file carrying only
 * `_one`/`_other` leaves four of them unresolved under `ar`, so i18next walks on
 * to `fallbackLng` and re-selects the category under ENGLISH rules, where every
 * count lands on `_other`: an Arabic user inviting 2-10 teammates got the
 * ENGLISH toast inside an Arabic UI. No crash and no raw key — silently the
 * wrong language, which is exactly why nothing caught it. These cases pin every
 * category to an Arabic resolution.
 */
describe('Arabic plural categories', () => {
  /** Every plural-suffixed key in `src/locales/ar`, with its namespace. */
  const PLURAL_KEYS = [
    [I18N_NAMESPACES.onboarding, 'toast.finishSuccessWithInvites'],
    [I18N_NAMESPACES.onboarding, 'toast.invitePartialFailure'],
    [I18N_NAMESPACES.onboarding, 'done.invitesPending'],
    [I18N_NAMESPACES.dashboard, 'members.description'],
    [I18N_NAMESPACES.settings, 'security.overview.passkeysOn'],
    [I18N_NAMESPACES.settings, 'panels.roles.memberCount'],
  ] as const;

  /** One representative count per Arabic CLDR category (asserted below). */
  const COUNT_BY_CATEGORY = {
    zero: 0,
    one: 1,
    two: 2,
    few: 3,
    many: 11,
    other: 100,
  } as const;

  const ARABIC_SCRIPT = /[؀-ۿ]/;
  const LATIN_SCRIPT = /[a-z]/i;

  beforeAll(async () => {
    await ensureLocale('ar');
    await i18n.changeLanguage('ar');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('resolves a count of 3 to Arabic instead of the English fallback', () => {
    const key = 'toast.finishSuccessWithInvites';
    const options = { ns: I18N_NAMESPACES.onboarding, count: 3 };

    expect(i18n.t(key, options)).toBe('أهلاً بك! مساحة عملك جاهزة — تم إرسال 3 دعوات.');
    expect(i18n.t(key, options)).not.toBe(i18n.t(key, { ...options, lng: 'en' }));
  });

  /**
   * The settings keys failed differently: they carry a BARE key beside
   * `_other`, and the bare key is i18next's last-resort lookup — so it caught
   * every unlisted category and 3 passkeys rendered as "one passkey registered
   * (3)". Arabic, so the script check above stays green, but the wrong words.
   */
  it('stops reusing the singular wording for plural counts', () => {
    expect(
      i18n.t('security.overview.passkeysOn', {
        ns: I18N_NAMESPACES.settings,
        count: 3,
      }),
    ).toBe('3 مفاتيح مرور مسجّلة');
  });

  it('exercises all six categories — one count each', () => {
    const rules = new Intl.PluralRules('ar');
    for (const [category, count] of Object.entries(COUNT_BY_CATEGORY)) {
      expect(rules.select(count), `count=${count}`).toBe(category);
    }
  });

  it.each(PLURAL_KEYS)('keeps %s:%s Arabic in every category', (ns, key) => {
    for (const [category, count] of Object.entries(COUNT_BY_CATEGORY)) {
      const where = `${ns}:${key} → ${category} (count=${count})`;
      const value = i18n.t(key, { ns, count });

      expect(value, where).toMatch(ARABIC_SCRIPT);
      expect(value, where).not.toMatch(LATIN_SCRIPT);
    }
  });
});
