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
  it('gives a team the full management set', () => {
    const team = sectionsForOrgType('TEAM');
    expect(team).toEqual(['general', 'members', 'roles', 'integrations']);
    expect(team).not.toContain('billing');
  });

  // A personal workspace has no members, roles or org-level general settings, but core-be's
  // api-key routes are organization-scope `both` and a personal owner holds the `api-key:*`
  // codes — so hiding Integrations withheld a capability the backend grants.
  it('exposes only the integrations section for a personal org', () => {
    expect(sectionsForOrgType('PERSONAL')).toEqual(['integrations']);
  });
});
