import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Member } from '@/shared/api/organization-contracts.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { removeMutate, updateRoleMutate, updateStatusMutate, ctl } = vi.hoisted(() => ({
  removeMutate: vi.fn(),
  updateRoleMutate: vi.fn(),
  updateStatusMutate: vi.fn(),
  /** Cross-test control surface for the stateful mutation stubs below. */
  ctl: {
    /** Settle the in-flight removal (set by the stub when `mutate` is called). */
    finishRemove: null as null | (() => void),
    /** When true, `useUpdateMemberRole` throws for every row. */
    roleHookThrows: false,
  },
}));

/**
 * The pending flags are the whole subject here, so the stubs carry real state
 * instead of a frozen `isPending: false` — a mock that can never be pending
 * cannot show a button that fails to disable itself.
 */
vi.mock('@/shared/hooks/useMembers/index.ts', async () => {
  const { useState } = await import('react');
  return {
    useRemoveMember: () => {
      const [isPending, setIsPending] = useState(false);
      return {
        isPending,
        mutate: (id: string, options?: { onSuccess?: () => void }) => {
          removeMutate(id, options);
          setIsPending(true);
          ctl.finishRemove = () => {
            setIsPending(false);
            options?.onSuccess?.();
          };
        },
      };
    },
    useUpdateMemberRole: () => {
      const [isPending, setIsPending] = useState(false);
      // Consistently, on every row: React retries a failed concurrent render
      // synchronously, so a throw that moves between passes escapes instead of
      // landing in a boundary.
      if (ctl.roleHookThrows) throw new Error('role hook exploded');
      return {
        isPending,
        mutate: (vars: unknown) => {
          updateRoleMutate(vars);
          setIsPending(true);
        },
      };
    },
    useUpdateMemberStatus: () => ({ isPending: false, mutate: updateStatusMutate }),
  };
});

vi.mock('@/shared/components/InviteMemberDialog/index.ts', () => ({
  InviteMemberDialog: () => (
    <button type="button" data-testid="invite-member-open">
      Invite member
    </button>
  ),
}));

import { MembersTable } from './MembersTable.tsx';

function setCanManage() {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationType: 'TEAM',
    permissions: ['membership:manage'],
  });
}

const MEMBERS: Member[] = [
  {
    id: 'm_1',
    userId: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@acme.test',
    role: 'owner',
    status: 'active',
    joinedAt: '2025-01-12T09:00:00.000Z',
  },
];

function member(index: number, overrides: Partial<Member> = {}): Member {
  return {
    id: `m_${index}`,
    userId: `u_${index}`,
    // Zero-padded so lexicographic order matches numeric order, letting the
    // sorting assertions below name an exact expected first row.
    name: `Member ${String(index).padStart(2, '0')}`,
    email: `member${index}@acme.test`,
    role: 'member',
    status: 'active',
    joinedAt: '2025-01-12T09:00:00.000Z',
    ...overrides,
  };
}

/** Row names in render order, excluding the header row. */
function renderedNames(): string[] {
  const rows = screen.getAllByRole('row').slice(1);
  return rows
    .map((row) => within(row).queryByText(/^Member \d\d$/)?.textContent ?? '')
    .filter(Boolean);
}

describe('MembersTable', () => {
  it('renders members with search and export', async () => {
    renderWithProviders(<MembersTable members={MEMBERS} />);
    expect(await screen.findByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByTestId('members-export')).toBeInTheDocument();
    expect(screen.getByTestId('members-role-filter')).toBeInTheDocument();
  });

  it('shows an empty message when there are no members', async () => {
    renderWithProviders(<MembersTable members={[]} />);
    expect(await screen.findByText('No members found.')).toBeInTheDocument();
  });

  // TanStack Table v9 makes every feature opt-in via the shared
  // `dataTableFeatures` set. A feature omitted there still type-checks at the
  // call site but dies at runtime, so each registered feature is exercised
  // through the UI rather than asserted structurally.
  describe('table features', () => {
    it('sorts rows when a column header sort action is chosen', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2), member(3)]} />);

      await screen.findByTestId('members-table');
      expect(renderedNames()[0]).toBe('Member 01');

      await user.click(screen.getByRole('button', { name: /member/i }));
      await user.click(await screen.findByRole('menuitem', { name: /desc/i }));

      expect(renderedNames()[0]).toBe('Member 03');
    });

    it('sorts the joined-at column, which uses a different comparator', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MembersTable
          members={[
            member(1, { joinedAt: '2025-03-01T09:00:00.000Z' }),
            member(2, { joinedAt: '2025-01-01T09:00:00.000Z' }),
            member(3, { joinedAt: '2025-02-01T09:00:00.000Z' }),
          ]}
        />,
      );

      await screen.findByTestId('members-table');

      await user.click(screen.getByRole('button', { name: /joined/i }));
      await user.click(await screen.findByRole('menuitem', { name: /asc/i }));

      expect(renderedNames()).toEqual(['Member 02', 'Member 03', 'Member 01']);
    });

    it('filters rows through the search input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2), member(3)]} />);

      await screen.findByTestId('members-table');
      expect(renderedNames()).toHaveLength(3);

      await user.type(screen.getByPlaceholderText(/search/i), 'Member 02');

      expect(renderedNames()).toEqual(['Member 02']);
    });

    it('paginates when rows exceed the default page size', async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 12 }, (_, i) => member(i + 1));
      renderWithProviders(<MembersTable members={many} />);

      await screen.findByTestId('members-table');
      // Default page size is 10, so 12 members split 10 + 2.
      expect(renderedNames()).toHaveLength(10);
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /next page/i }));

      expect(renderedNames()).toEqual(['Member 11', 'Member 12']);
    });

    it('tracks row selection from the select-all checkbox', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2)]} />);

      await screen.findByTestId('members-table');
      await user.click(screen.getByRole('checkbox', { name: /select all/i }));

      expect(screen.getByText(/2 of 2 row\(s\) selected/i)).toBeInTheDocument();
    });
  });

  // ── SET-12: one membership write per gesture, and a confirm that waits ────

  describe('row actions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      ctl.finishRemove = null;
      ctl.roleHookThrows = false;
      useOrganizationStore.getState().clearOrganization();
    });

    it('holds the remove dialog open until the request resolves', async () => {
      // Regression: the confirm had no e.preventDefault(), so Radix closed the
      // dialog on click and whatever came back — an error, a rollback — landed
      // on a screen the dialog had already left.
      const user = userEvent.setup();
      setCanManage();
      renderWithProviders(<MembersTable members={MEMBERS} />);

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByTestId('member-remove-m_1'));

      const confirm = await screen.findByTestId('member-remove-confirm-m_1');
      await user.click(confirm);

      expect(removeMutate).toHaveBeenCalledTimes(1);
      // Still open, still busy — the gesture owns its own outcome, and it says
      // so with the same spinner every other confirm in the app uses.
      const busy = await screen.findByTestId('member-remove-confirm-m_1');
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute('aria-busy', 'true');
      expect(busy.querySelector('.animate-spin')).not.toBeNull();

      act(() => ctl.finishRemove?.());
      expect(screen.queryByTestId('member-remove-confirm-m_1')).not.toBeInTheDocument();
    });

    it("sends nothing when the member's current role is re-picked", async () => {
      // Radix fires onValueChange for the selected item too, so opening the menu
      // and clicking the role already in effect PATCHed and toasted for nothing.
      const user = userEvent.setup();
      setCanManage();
      renderWithProviders(<MembersTable members={MEMBERS} />);

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByTestId('member-set-role-owner'));

      expect(updateRoleMutate).not.toHaveBeenCalled();
    });

    it('disables the role menu while a role change is in flight', async () => {
      // useAppMutation JOINS a second call to the first, so a second pick was
      // accepted by the UI and then silently dropped. Say "busy" instead.
      const user = userEvent.setup();
      setCanManage();
      renderWithProviders(<MembersTable members={MEMBERS} />);

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByTestId('member-set-role-admin'));
      expect(updateRoleMutate).toHaveBeenCalledTimes(1);

      // The menu is shut now, so the row itself carries the busy state.
      expect(
        screen.getByTestId('member-actions-m_1').querySelector('.animate-spin'),
      ).not.toBeNull();

      // Radix closes the menu on select; reopen it and try to pick again.
      await user.click(await screen.findByTestId('member-actions-m_1'));
      const viewer = await screen.findByTestId('member-set-role-viewer');
      expect(viewer).toHaveAttribute('aria-disabled', 'true');

      await user.click(viewer);
      expect(updateRoleMutate).toHaveBeenCalledTimes(1);
    });

    it('contains a crash in the actions cell to that cell', async () => {
      // The actions cell is its own failure domain: a throw there costs the
      // menu, not the table it sits in.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      setCanManage();
      ctl.roleHookThrows = true;
      renderWithProviders(<MembersTable members={[member(1), member(2)]} />);

      expect(await screen.findByTestId('member-actions-error-m_1')).toBeInTheDocument();
      expect(screen.getByTestId('member-actions-error-m_2')).toBeInTheDocument();
      // Everything around the failed cells still rendered.
      expect(screen.getByTestId('members-table')).toBeInTheDocument();
      expect(renderedNames()).toEqual(['Member 01', 'Member 02']);
      expect(screen.getByTestId('members-export')).toBeInTheDocument();
      consoleError.mockRestore();
    });
  });
});
