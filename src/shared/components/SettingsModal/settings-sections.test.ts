import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';
import enSettings from '@/locales/en/settings.json';

import {
  filterNav,
  SECTIONS_BY_SCOPE,
  sectionsForOrgType,
  SETTINGS_NAV,
} from './settings-sections.ts';

const translate = (key: string) => i18n.t(key, { ns: I18N_NAMESPACES.settings });

describe('SETTINGS_NAV registry', () => {
  beforeAll(() => {
    i18n.addResourceBundle('en', I18N_NAMESPACES.settings, enSettings, true, true);
  });

  it('lists every section of both scopes exactly once', () => {
    for (const group of SETTINGS_NAV) {
      const sections = group.items.map((i) => i.section);
      expect(sections).toEqual([...SECTIONS_BY_SCOPE[group.scope]]);
      expect(new Set(sections).size).toBe(sections.length);
    }
  });

  it('every item carries its group scope', () => {
    for (const group of SETTINGS_NAV) {
      for (const item of group.items) {
        expect(item.scope).toBe(group.scope);
      }
    }
  });
});

describe('filterNav', () => {
  beforeAll(() => {
    i18n.addResourceBundle('en', I18N_NAMESPACES.settings, enSettings, true, true);
  });

  it('returns all groups when the query is empty', () => {
    expect(filterNav(SETTINGS_NAV, '', translate)).toEqual(SETTINGS_NAV);
    expect(filterNav(SETTINGS_NAV, '   ', translate)).toEqual(SETTINGS_NAV);
  });

  it('matches by label (case-insensitive)', () => {
    const sections = filterNav(SETTINGS_NAV, 'SECURITY', translate).flatMap((g) =>
      g.items.map((i) => i.section),
    );
    expect(sections).toContain('security');
  });

  it('matches by keyword', () => {
    const sections = filterNav(SETTINGS_NAV, 'invoices', translate).flatMap((g) =>
      g.items.map((i) => i.section),
    );
    expect(sections).toEqual(['billing']);
  });

  it('drops groups with no matching items', () => {
    const groups = filterNav(SETTINGS_NAV, 'passkey', translate);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.scope).toBe('account');
  });

  it('returns no groups when nothing matches', () => {
    expect(filterNav(SETTINGS_NAV, 'zzznomatch', translate)).toEqual([]);
  });
});

describe('sectionsForOrgType', () => {
  it('gives a team the organization management set', () => {
    const team = sectionsForOrgType('TEAM');
    expect(team).toEqual(['general', 'members', 'roles']);
    // Billing and Integrations are ACCOUNT sections — neither belongs to an org type.
    expect(team).not.toContain('billing');
    expect(team).not.toContain('integrations');
  });

  // Nothing is an organization setting in a personal workspace. Integrations used to be
  // listed here, which put this function at odds with `isSettingsSectionAvailable` — that
  // refuses organization scope outright for a PERSONAL workspace, so the nav offered an
  // entry that bounced to a fallback the moment it was clicked.
  it('exposes no organization sections for a personal org', () => {
    expect(sectionsForOrgType('PERSONAL')).toEqual([]);
  });
});
