import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoleSummary } from '@/shared/api/organization-contracts.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * The panel schedules its deferred removal through the query cache now, so it
 * needs a client. Kept local (rather than renderWithProviders) so these stay
 * router-free component tests.
 */
function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const {
  useMembersMock,
  removeMutate,
  updateRoleMutate,
  updateStatusMutate,
  useRolesMock,
} = vi.hoisted(() => ({
  useMembersMock: vi.fn(),
  removeMutate: vi.fn(),
  updateRoleMutate: vi.fn(),
  updateStatusMutate: vi.fn(),
  useRolesMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useMembers/index.ts', () => ({
  useMembers: useMembersMock,
  useRemoveMember: () => ({ mutate: removeMutate, mutateAsync: removeMutate }),
  useUpdateMemberRole: () => ({ mutate: updateRoleMutate }),
  useUpdateMemberStatus: () => ({ mutate: updateStatusMutate }),
}));
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({ useRoles: useRolesMock }));
vi.mock('@/shared/components/InviteMemberDialog/index.ts', () => ({
  InviteMemberDialog: () => (
    <button type="button" data-testid="invite-member-open">
      Invite member
    </button>
  ),
}));
vi.mock('@/shared/notify/notify-deferred.ts', () => ({
  // Commit immediately and hand back the real handle shape the caller stores.
  notifyDeferredCommit: ({ onCommit }: { onCommit: () => void | Promise<void> }) => {
    void onCommit();
    return { cancel: vi.fn(), flush: vi.fn() };
  },
}));

import { OrganizationMembersPanel } from './OrganizationMembersPanel.tsx';

const OWNER = {
  id: 'mem_owner',
  userId: 'usr_owner',
  name: 'Ada Byron',
  email: 'ada@acme.test',
  role: 'owner',
  roleId: 'rol_owner',
  roleName: 'Owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
};
const MEMBER = {
  id: 'mem_1',
  userId: 'usr_1',
  name: 'Jo Rivera',
  email: 'jo@acme.test',
  role: 'member',
  roleId: 'rol_member',
  roleName: 'Member',
  status: 'active',
  joinedAt: '2026-02-01T00:00:00.000Z',
};
const INVITED = {
  ...MEMBER,
  id: 'mem_inv',
  name: 'Sam Pending',
  email: 'sam@acme.test',
  status: 'invited',
  joinedAt: '', // never joined
};

function role(id: string, name: string): RoleSummary {
  return {
    id,
    name,
    description: '',
    permissions: [],
    memberCount: 0,
    isSystem: name.toLowerCase() === 'owner',
  };
}

function membersQueryResult(
  overrides: { rows?: (typeof MEMBER)[] } & Record<string, unknown>,
) {
  return {
    rows: overrides.rows ?? [],
    isPending: false,
    isError: false,
    isFetching: false,
    isRefreshing: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function rolesResult(rows: RoleSummary[]) {
  return {
    rows,
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function setCanManage(value: boolean) {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationType: value ? 'TEAM' : 'PERSONAL',
    permissions: value ? ['membership:manage', 'invitation:manage'] : [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrganizationStore.getState().clearOrganization();
  useRolesMock.mockReturnValue(
    rolesResult([role('rol_owner', 'Owner'), role('rol_member', 'Member')]),
  );
});

describe('OrganizationMembersPanel', () => {
  it('shows an empty state when there are no members', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [] }));
    render(<OrganizationMembersPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows a loading skeleton', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [], isPending: true }));
    render(<OrganizationMembersPanel />);
    expect(screen.getByTestId('members-loading')).toBeInTheDocument();
  });

  it('dims the current rows while new search params load — never a skeleton (X-2)', () => {
    // Search lives in the query key, so a keystroke is a new query. With
    // keepPreviousData the rows stay put and only dim; without it the panel
    // swapped them for a skeleton and the list blanked on every keystroke.
    useMembersMock.mockReturnValue(
      membersQueryResult({ rows: [MEMBER], isFetching: true, isRefreshing: true }),
    );
    render(<OrganizationMembersPanel />);

    expect(screen.queryByTestId('members-loading')).not.toBeInTheDocument();
    const list = screen.getByTestId('members-list');
    expect(list).toBeInTheDocument();
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();
    expect(list.closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows an actions menu for a non-owner member and the real role name', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByTestId('member-actions-mem_1')).toBeInTheDocument();
  });

  it('hides actions for the owner (an org cannot manage its owner here)', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [OWNER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.queryByTestId('member-actions-mem_owner')).not.toBeInTheDocument();
  });

  it('hides actions without the capability (e.g. a personal org)', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(false);
    render(<OrganizationMembersPanel />);
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();
    expect(screen.queryByTestId('member-actions-mem_1')).not.toBeInTheDocument();
  });

  it('changes a member role to a real org role (sends role_id)', async () => {
    // Regression: the reachable Members panel could not change a member's role.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-set-role-rol_member'));

    await waitFor(() =>
      expect(updateRoleMutate).toHaveBeenCalledWith(
        expect.objectContaining({ membershipId: 'mem_1', roleId: 'rol_member' }),
      ),
    );
  });

  it('suspends a member', async () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-toggle-status-mem_1'));

    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith({
        membershipId: 'mem_1',
        status: 'suspended',
      }),
    );
  });

  it('hides suspend/reactivate for an invited (never-joined) member', async () => {
    // core-be rejects flipping a never-joined membership to active, so the FE
    // must not offer it — invited members get role-change + remove only.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [INVITED] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_inv'));
    await screen.findByTestId('member-remove-mem_inv');
    expect(screen.queryByTestId('member-toggle-status-mem_inv')).not.toBeInTheDocument();
  });

  it('confirms and removes a member from the actions menu', async () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-remove-mem_1'));
    await user.click(await screen.findByTestId('confirm-accept'));

    await waitFor(() => expect(removeMutate).toHaveBeenCalledWith('mem_1'));
  });

  it('renders a search box and forwards the debounced term to the hook', async () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [] }));
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.type(screen.getByTestId('members-search'), 'jo');
    await waitFor(() =>
      expect(useMembersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'jo', sort: 'name', order: 'asc' }),
      ),
    );
  });

  it('loads the next page when Load more is clicked', async () => {
    const fetchNextPage = vi.fn();
    useMembersMock.mockReturnValue(
      membersQueryResult({ rows: [MEMBER], hasNextPage: true, fetchNextPage }),
    );
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('members-load-more'));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('exposes an Invite member button for a manager', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);
    expect(screen.getByTestId('invite-member-open')).toBeInTheDocument();
  });

  it('hides the invite button without invitation:manage', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(false);
    render(<OrganizationMembersPanel />);
    expect(screen.queryByTestId('invite-member-open')).not.toBeInTheDocument();
  });
});
