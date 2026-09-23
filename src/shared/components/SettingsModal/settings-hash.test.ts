import { describe, expect, it } from 'vitest';

import {
  isCanonicalSettingsHash,
  isSettingsHash,
  parseSettingsHash,
  settingsHash,
  settingsHashPath,
} from './settings-hash.ts';

describe('settingsHash', () => {
  it('builds the hash value without a leading #', () => {
    expect(settingsHash('account', 'profile')).toBe('settings/account/profile');
    expect(settingsHash('organization', 'general')).toBe('settings/organization/general');
  });
});

describe('isSettingsHash', () => {
  it('matches the bare settings hash', () => {
    expect(isSettingsHash('settings')).toBe(true);
    expect(isSettingsHash('#settings')).toBe(true);
  });

  it('matches scoped hashes', () => {
    expect(isSettingsHash('settings/account/profile')).toBe(true);
    expect(isSettingsHash('#settings/organization/members')).toBe(true);
  });

  it('does not match other hashes', () => {
    expect(isSettingsHash('')).toBe(false);
    expect(isSettingsHash('main-content')).toBe(false);
    expect(isSettingsHash('settings-other')).toBe(false);
  });
});

describe('parseSettingsHash', () => {
  it.each([
    ['settings/account/profile', 'account', 'profile'],
    ['settings/account/sessions', 'account', 'sessions'],
    ['settings/account/billing', 'account', 'billing'],
    ['#settings/organization/general', 'organization', 'general'],
    ['settings/account/integrations', 'account', 'integrations'],
  ])('parses %s', (hash, scope, section) => {
    expect(parseSettingsHash(hash)).toEqual({ scope, section });
  });

  it('returns null for non-settings hashes (modal closed)', () => {
    expect(parseSettingsHash('')).toBeNull();
    expect(parseSettingsHash('main-content')).toBeNull();
    expect(parseSettingsHash('#settingsx/account/profile')).toBeNull();
  });

  it('remaps legacy organization-scoped hashes to their account section', () => {
    // Billing lived under organization/ before it moved to the Account scope;
    // old deep links must keep landing on the moved section.
    expect(parseSettingsHash('#settings/organization/billing')).toEqual({
      scope: 'account',
      section: 'billing',
    });
    expect(parseSettingsHash('settings/organization/sessions')).toEqual({
      scope: 'account',
      section: 'sessions',
    });
    // Integrations made the same move, so a bookmarked organization link must still
    // open it rather than dropping the user on Profile.
    expect(parseSettingsHash('#settings/organization/integrations')).toEqual({
      scope: 'account',
      section: 'integrations',
    });
  });

  it('falls back to account/profile for a bare settings hash', () => {
    expect(parseSettingsHash('settings')).toEqual({
      scope: 'account',
      section: 'profile',
    });
  });

  it('falls back to account/profile for invalid scope or section', () => {
    expect(parseSettingsHash('settings/bogus/profile')).toEqual({
      scope: 'account',
      section: 'profile',
    });
    expect(parseSettingsHash('settings/account/bogus')).toEqual({
      scope: 'account',
      section: 'profile',
    });
    expect(parseSettingsHash('settings/account123/profile123123')).toEqual({
      scope: 'account',
      section: 'profile',
    });
    // Section from the wrong scope is invalid too.
    expect(parseSettingsHash('settings/account/general')).toEqual({
      scope: 'account',
      section: 'profile',
    });
  });
});

describe('settingsHashPath', () => {
  it('strips query or fragment junk appended to the hash', () => {
    expect(settingsHashPath('settings/account/profile?foo=bar')).toBe(
      'settings/account/profile',
    );
    expect(settingsHashPath('#settings/account/profile#oops')).toBe(
      'settings/account/profile',
    );
  });
});

describe('isCanonicalSettingsHash', () => {
  it('accepts an exact deep link', () => {
    expect(
      isCanonicalSettingsHash('#settings/account/profile', {
        scope: 'account',
        section: 'profile',
      }),
    ).toBe(true);
  });

  it('rejects malformed, bare, and legacy hashes', () => {
    const profile = { scope: 'account' as const, section: 'profile' as const };
    expect(isCanonicalSettingsHash('settings', profile)).toBe(false);
    expect(isCanonicalSettingsHash('settings/account123/profile123123', profile)).toBe(
      false,
    );
    expect(isCanonicalSettingsHash('settings/organization/billing', profile)).toBe(false);
    expect(isCanonicalSettingsHash('settings/account/profile?foo=bar', profile)).toBe(
      false,
    );
  });
});
