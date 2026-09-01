import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Member } from '@/shared/api/organization-contracts.ts';
import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { MembersTable } from './MembersTable.tsx';

const { updateRoleMutate, updateStatusMutate, removeMutate } = vi.hoisted(() => ({
  updateRoleMutate: vi.fn(),
  updateStatusMutate: vi.fn(),
  removeMutate: vi.fn(),
}));
vi.mock('@/shared/hooks/useMembers/index.ts', () => ({
  useUpdateMemberRole: () => ({ mutate: updateRoleMutate }),
  useUpdateMemberStatus: () => ({ mutate: updateStatusMutate }),
  useRemoveMember: () => ({ mutate: removeMutate }),
}));

function grantManagePermission() {
  useAuthStore.setState({
    user: { id: 'usr_t', email: 't@t.test', role: 'user' } as AuthUser,
  });
  useOrganizationStore.getState().setPermissions(['membership:manage']);
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

  describe('permission-gated row actions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      useAuthStore.setState({ user: null });
      useOrganizationStore.getState().clearOrganization();
    });

    it('hides the actions menu entirely without membership:manage', async () => {
      renderWithProviders(<MembersTable members={[member(1)]} />);
      await screen.findByTestId('members-table');

      expect(screen.queryByTestId('member-actions-m_1')).not.toBeInTheDocument();
    });

    it('changes a member role through the radio group', async () => {
      grantManagePermission();
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1, { role: 'member' })]} />);

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByRole('menuitemradio', { name: 'admin' }));

      expect(updateRoleMutate).toHaveBeenCalledWith({
        membershipId: 'm_1',
        role: 'admin',
      });
    });

    it('suspends an active member and reactivates a suspended one', async () => {
      grantManagePermission();
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(
        <MembersTable members={[member(1, { status: 'active' })]} />,
      );

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByTestId('member-toggle-status-m_1'));
      expect(updateStatusMutate).toHaveBeenCalledWith({
        membershipId: 'm_1',
        status: 'suspended',
      });

      unmount();
      renderWithProviders(
        <MembersTable members={[member(2, { status: 'suspended' })]} />,
      );
      await user.click(await screen.findByTestId('member-actions-m_2'));
      await user.click(await screen.findByTestId('member-toggle-status-m_2'));
      expect(updateStatusMutate).toHaveBeenLastCalledWith({
        membershipId: 'm_2',
        status: 'active',
      });
    });

    it('removal requires the confirm dialog and then fires the mutation', async () => {
      grantManagePermission();
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1)]} />);

      await user.click(await screen.findByTestId('member-actions-m_1'));
      await user.click(await screen.findByRole('menuitem', { name: /remove/i }));

      // Dialog gate: nothing fired yet.
      expect(removeMutate).not.toHaveBeenCalled();

      await user.click(await screen.findByTestId('member-remove-confirm-m_1'));
      expect(removeMutate).toHaveBeenCalledWith('m_1');
    });

    it('the role facet filter narrows rows to that role', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MembersTable
          members={[
            member(1, { role: 'admin' }),
            member(2, { role: 'viewer' }),
            member(3, { role: 'admin' }),
          ]}
        />,
      );
      await screen.findByTestId('members-table');

      await user.click(screen.getByTestId('members-role-filter'));
      await user.click(await screen.findByRole('option', { name: /admin/i }));

      expect(renderedNames()).toEqual(['Member 01', 'Member 03']);
    });
  });
});
