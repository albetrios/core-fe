import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

import { isLikelyI18nKey, translateFormMessage } from './translate-form-message.ts';

describe('isLikelyI18nKey', () => {
  it('accepts dotted key paths and rejects prose', () => {
    expect(isLikelyI18nKey('validation.emailRequired')).toBe(true);
    expect(isLikelyI18nKey('a.b.c')).toBe(true);
    expect(isLikelyI18nKey('Enter a valid email.')).toBe(false);
    expect(isLikelyI18nKey('plainword')).toBe(false);
    expect(isLikelyI18nKey('trailing.dot.')).toBe(false);
  });
});

describe('translateFormMessage', () => {
  beforeAll(() => {
    // Deterministic fixtures — resolution order is auth → errors → default ns.
    i18n.addResourceBundle('en', I18N_NAMESPACES.auth, {
      form: { onlyInAuth: 'From auth ns', inBoth: 'Auth wins' },
    });
    i18n.addResourceBundle('en', I18N_NAMESPACES.errors, {
      form: { onlyInErrors: 'From errors ns', inBoth: 'Errors loses' },
    });
    i18n.addResourceBundle('en', 'common', {
      form: { onlyInDefault: 'From default ns' },
    });
  });

  it('passes undefined and non-key prose through untouched', () => {
    expect(translateFormMessage(undefined)).toBeUndefined();
    expect(translateFormMessage('Enter a valid email.')).toBe('Enter a valid email.');
  });

  it('resolves from the auth namespace first', () => {
    expect(translateFormMessage('form.onlyInAuth')).toBe('From auth ns');
    expect(translateFormMessage('form.inBoth')).toBe('Auth wins');
  });

  it('falls back to the errors namespace when auth misses', () => {
    expect(translateFormMessage('form.onlyInErrors')).toBe('From errors ns');
  });

  it('falls back to the default namespace last', () => {
    expect(translateFormMessage('form.onlyInDefault')).toBe('From default ns');
  });

  it('returns key-shaped strings unchanged when no namespace knows them', () => {
    expect(translateFormMessage('form.unknown.key')).toBe('form.unknown.key');
  });
});
