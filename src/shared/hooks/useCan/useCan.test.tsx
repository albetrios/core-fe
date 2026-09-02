import { act, render, renderHook, screen } from '@testing-library/react';
import { memo, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { useCan, useVisibleNav } from './useCan.ts';

const USER = { id: 'usr_1', email: 'u@e.com', role: 'user' } as AuthUser;

function setTeamOrg(isTeam: boolean) {
  useOrganizationStore.setState({ organizationType: isTeam ? 'TEAM' : 'PERSONAL' });
}

beforeEach(() => {
  useAuthStore.setState({ user: USER });
  useOrganizationStore.getState().clearOrganization();
});

describe('useCan', () => {
  it('is permissive with no requirement', () => {
    expect(renderHook(() => useCan({})).result.current).toBe(true);
  });

  it('checks an org-scoped permission', () => {
    useOrganizationStore.getState().setPermissions(['membership:read']);
    expect(
      renderHook(() => useCan({ permission: 'membership:read' })).result.current,
    ).toBe(true);
    expect(renderHook(() => useCan({ permission: 'role:manage' })).result.current).toBe(
      false,
    );
  });

  it('checks the team-organization guard', () => {
    setTeamOrg(true);
    expect(renderHook(() => useCan({ teamOrganizationOnly: true })).result.current).toBe(
      true,
    );
    setTeamOrg(false);
    expect(renderHook(() => useCan({ teamOrganizationOnly: true })).result.current).toBe(
      false,
    );
  });

  it('requires BOTH permission and team org (AND)', () => {
    useOrganizationStore.getState().setPermissions(['membership:read']);
    setTeamOrg(false);
    expect(
      renderHook(() =>
        useCan({ permission: 'membership:read', teamOrganizationOnly: true }),
      ).result.current,
    ).toBe(false);
  });
});

describe('useVisibleNav', () => {
  it('filters items by their access check', () => {
    setTeamOrg(true);
    useOrganizationStore.getState().setPermissions(['membership:read']);
    const items = [
      { id: 'a' },
      { id: 'b', teamOrganizationOnly: true as const },
      { id: 'c', permission: 'role:manage' as const },
    ];
    const visible = renderHook(() => useVisibleNav(items)).result.current;
    expect(visible.map((i) => i.id)).toEqual(['a', 'b']);
  });

  describe('SHELL-11 — the result is stable across renders', () => {
    // The only production caller hands this straight to every shell variant as
    // a prop. `.filter()` returns a new array every render, so an unmemoised
    // result changes identity on renders that changed nothing — which defeats
    // any `React.memo` on the shell subtree and re-renders the whole nav.
    const NAV = [
      { id: 'a' },
      { id: 'b', teamOrganizationOnly: true as const },
      { id: 'c', permission: 'role:manage' as const },
    ];

    it('returns the same array reference when nothing it reads has changed', () => {
      setTeamOrg(true);
      useOrganizationStore.getState().setPermissions(['membership:read']);

      const { result, rerender } = renderHook(() => useVisibleNav(NAV));
      const first = result.current;
      rerender();
      rerender();

      expect(result.current).toBe(first);
    });

    it('returns a new reference when the permissions it reads do change', () => {
      setTeamOrg(true);
      useOrganizationStore.getState().setPermissions(['membership:read']);

      const { result, rerender } = renderHook(() => useVisibleNav(NAV));
      const first = result.current;
      expect(first.map((i) => i.id)).toEqual(['a', 'b']);

      act(() => {
        useOrganizationStore
          .getState()
          .setPermissions(['membership:read', 'role:manage']);
      });
      rerender();

      // Memoised, not frozen: a real change still recomputes.
      expect(result.current).not.toBe(first);
      expect(result.current.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });

    it('lets a memoised consumer actually skip re-renders', () => {
      // This is the claim the card makes — "it defeats any future memoisation
      // of the shell subtree" — turned into a measurement. The shell variants
      // receive this array as a prop; a fresh array every render means
      // `React.memo` on them can never hit.
      setTeamOrg(true);
      useOrganizationStore.getState().setPermissions(['membership:read']);

      let childRenders = 0;
      const Child = memo(function Child({ items }: { items: { id: string }[] }) {
        childRenders += 1;
        return <span data-testid="count">{items.length}</span>;
      });

      function Parent() {
        const [, force] = useState(0);
        const items = useVisibleNav(NAV);
        return (
          <>
            <button
              type="button"
              data-testid="rerender"
              onClick={() => force((n) => n + 1)}
            >
              rerender
            </button>
            <Child items={items} />
          </>
        );
      }

      render(<Parent />);
      expect(childRenders).toBe(1);

      // Three parent renders that changed nothing the nav depends on.
      for (let i = 0; i < 3; i += 1) {
        act(() => {
          screen.getByTestId('rerender').click();
        });
      }

      // Unmemoised, this is 4. Memoised, the child never had a reason to run.
      expect(childRenders).toBe(1);
    });
  });
});
