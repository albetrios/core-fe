import { describe, expect, it, vi } from 'vitest';

const disabledModulesRef = vi.hoisted(() => ({ value: new Set<string>() }));
vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    get disabledModules() {
      return disabledModulesRef.value;
    },
  },
}));

import {
  firstVisibleSettingsSection,
  visibleSettingsNavGroups,
} from './settings-nav-visibility.ts';
import { DEFAULT_SETTINGS } from './settings-sections.ts';

const teamCtx = {
  hasOrganizationContext: true,
  orgType: 'TEAM' as const,
  teamOrganizations: true,
  role: 'user' as const,
  permissions: [
    'organization:read',
    'membership:read',
    'role:read',
    'webhook:read',
  ] as const,
};

const personalOnlyCtx = {
  hasOrganizationContext: true,
  orgType: 'PERSONAL' as const,
  teamOrganizations: false,
  role: 'user' as const,
  permissions: ['organization:read'] as const,
};

// personal-and-team deployment (teams ARE enabled), but the ACTIVE workspace is
// the user's PERSONAL org — organization settings must still be hidden.
//
// `api-key:read` is in this list deliberately. A personal owner really does hold
// it (core-be grants the whole tenancy set to every owner), and `integrations`
// is gated on exactly that code — so a context without it made the assertion
// below pass for the wrong reason: the item was filtered by permission, never by
// org type, and the nav could offer Integrations in a personal workspace with
// this suite still green.
const personalWorkspaceInTeamDeploymentCtx = {
  hasOrganizationContext: true,
  orgType: 'PERSONAL' as const,
  teamOrganizations: true,
  role: 'user' as const,
  permissions: [
    'organization:read',
    'membership:read',
    'role:read',
    'webhook:read',
    'api-key:read',
  ] as const,
};

describe('visibleSettingsNavGroups', () => {
  beforeEach(() => {
    disabledModulesRef.value = new Set();
  });

  it('includes organization sections for team deployments', () => {
    const groups = visibleSettingsNavGroups(teamCtx);
    const org = groups.find((g) => g.scope === 'organization');
    expect(org?.items.map((i) => i.section)).toContain('members');
  });

  it('omits the organization group in personal-only deployments', () => {
    const groups = visibleSettingsNavGroups(personalOnlyCtx);
    expect(groups.some((g) => g.scope === 'organization')).toBe(false);
    expect(groups.some((g) => g.items.some((i) => i.section === 'billing'))).toBe(true);
  });

  it('hides organization settings while in a PERSONAL workspace even when teams are enabled', () => {
    const groups = visibleSettingsNavGroups(personalWorkspaceInTeamDeploymentCtx);
    // No organization group surfaces for a personal workspace…
    expect(groups.some((g) => g.scope === 'organization')).toBe(false);
    // …but account settings (incl. billing) remain available.
    expect(groups.some((g) => g.scope === 'account')).toBe(true);
    expect(groups.some((g) => g.items.some((i) => i.section === 'billing'))).toBe(true);
  });

  it('hides module-gated sections when L6b disables them', () => {
    disabledModulesRef.value = new Set(['members', 'billing']);
    const groups = visibleSettingsNavGroups(teamCtx);
    const org = groups.find((g) => g.scope === 'organization');
    expect(org?.items.map((i) => i.section)).not.toContain('members');
    const account = groups.find((g) => g.scope === 'account');
    expect(account?.items.map((i) => i.section)).not.toContain('billing');
  });
});

describe('firstVisibleSettingsSection', () => {
  it('returns profile when account nav is present', () => {
    expect(
      firstVisibleSettingsSection(visibleSettingsNavGroups(personalOnlyCtx)),
    ).toEqual(DEFAULT_SETTINGS);
  });
});
