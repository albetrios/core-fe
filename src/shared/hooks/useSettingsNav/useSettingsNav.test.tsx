import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

const { useMeContextMock } = vi.hoisted(() => ({ useMeContextMock: vi.fn() }));

vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

import { includesSettingsSection, useVisibleSettingsSections } from './useSettingsNav.ts';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function sectionsFor(orgType: 'TEAM' | 'PERSONAL' | undefined) {
  useMeContextMock.mockReturnValue({
    data: orgType ? { activeOrganization: { type: orgType } } : undefined,
  });
  return renderHook(() => useVisibleSettingsSections(), { wrapper: createWrapper() })
    .result.current;
}

describe('useVisibleSettingsSections', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    useOrganizationStore.setState({
      organizationId: 'org_acme',
      permissions: ['organization:read', 'membership:read'],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    });
  });

  it('offers organization sections on a team workspace', () => {
    const sections = sectionsFor('TEAM');

    expect(
      includesSettingsSection(sections, { scope: 'account', section: 'billing' }),
    ).toBe(true);
    expect(
      includesSettingsSection(sections, { scope: 'organization', section: 'members' }),
    ).toBe(true);
  });

  /**
   * A personal workspace has no members to invite, so nothing may offer the
   * Members section there — an offer that opens an empty screen is worse than
   * no offer (this is what the dashboard's "Invite members" chip did).
   */
  it('withholds organization sections on a personal workspace', () => {
    const sections = sectionsFor('PERSONAL');

    expect(
      includesSettingsSection(sections, { scope: 'organization', section: 'members' }),
    ).toBe(false);
    expect(
      includesSettingsSection(sections, { scope: 'account', section: 'billing' }),
    ).toBe(true);
  });

  it('withholds a section the user has no permission for', () => {
    useOrganizationStore.setState({ permissions: [] });

    const sections = sectionsFor('TEAM');

    expect(
      includesSettingsSection(sections, { scope: 'account', section: 'billing' }),
    ).toBe(false);
    expect(
      includesSettingsSection(sections, { scope: 'organization', section: 'members' }),
    ).toBe(false);
    // Sections that need nothing but a signed-in user stay offered.
    expect(
      includesSettingsSection(sections, { scope: 'account', section: 'profile' }),
    ).toBe(true);
  });

  it('withholds organization sections without an organization in context', () => {
    useOrganizationStore.setState({ organizationId: null });

    const sections = sectionsFor('TEAM');

    expect(
      includesSettingsSection(sections, { scope: 'organization', section: 'members' }),
    ).toBe(false);
  });

  /**
   * While me/context is still resolving the org type is unknown, and
   * `visibleSettingsNavGroups` stays permissive on purpose: for a suggestion a
   * missing row is worse than an extra one.
   */
  it('stays permissive while the org type is unknown', () => {
    const sections = sectionsFor(undefined);

    expect(
      includesSettingsSection(sections, { scope: 'organization', section: 'members' }),
    ).toBe(true);
  });
});
