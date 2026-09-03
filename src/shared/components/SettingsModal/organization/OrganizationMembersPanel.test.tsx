import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
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
  removeMutateSync,
  removeMemberOptions,
  updateRoleMutate,
  updateStatusMutate,
  useRolesMock,
} = vi.hoisted(() => ({
  useMembersMock: vi.fn(),
  /** `mutateAsync` — the only removal entry point the panel may use. */
  removeMutate: vi.fn(),
  /** `mutate` — kept separate so a regression to the void-returning call shows. */
  removeMutateSync: vi.fn(),
  /** Every options object `useRemoveMember` was constructed with. */
  removeMemberOptions: [] as (Record<string, unknown> | undefined)[],
  updateRoleMutate: vi.fn(),
  updateStatusMutate: vi.fn(),
  useRolesMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useMembers/index.ts', async () => {
  const { useState } = await import('react');
  return {
    useMembers: useMembersMock,
    useRemoveMember: (options?: Record<string, unknown>) => {
      removeMemberOptions.push(options);
      return { mutate: removeMutateSync, mutateAsync: removeMutate };
    },
    // Real pending state: the flag is the subject of the SET-12 tests below.
    useUpdateMemberRole: () => {
      const [isPending, setIsPending] = useState(false);
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
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({ useRoles: useRolesMock }));
vi.mock('@/shared/components/InviteMemberDialog/index.ts', () => ({
  InviteMemberDialog: () => (
    <button type="button" data-testid="invite-member-open">
      Invite member
    </button>
  ),
}));
/**
 * Each scheduled commit, with the promise `onCommit()` handed back. The real
 * helper is what turns that promise into "committed" or `onCommitError`, so
 * whether the panel's write is actually inside it is the thing to assert.
 */
const deferredCommits = vi.hoisted(
  () => [] as { onCommit: () => void | Promise<void>; commit: Promise<unknown> }[],
);
vi.mock('@/shared/notify/notify-deferred.ts', () => ({
  // Commit immediately and hand back the real handle shape the caller stores.
  notifyDeferredCommit: (options: { onCommit: () => void | Promise<void> }) => {
    const commit = Promise.resolve(options.onCommit());
    // The real helper routes a rejection to `onCommitError`; keep it handled
    // here so tests can assert on `commit` without an unhandled rejection.
    commit.catch(() => undefined);
    deferredCommits.push({ onCommit: options.onCommit, commit });
    return { cancel: vi.fn(), flush: vi.fn() };
  },
}));

import { OrganizationMembersPanel } from './OrganizationMembersPanel.tsx';

/** The most recently scheduled deferred commit. */
const lastDeferred = () => {
  const call = deferredCommits.at(-1);
  if (!call) throw new Error('no deferred commit was scheduled');
  return call;
};
/** Let queued microtasks run without advancing any timer. */
const flushMicrotasks = () => act(async () => undefined);

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
    // A session whose guard chain has ANSWERED — the unresolved case is its own
    // test below (SET-23).
    permissionsResolved: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` keeps implementations, so a per-test `mockReturnValue` for
  // the write would leak into the next case.
  removeMutate.mockReset();
  removeMutateSync.mockReset();
  removeMemberOptions.length = 0;
  deferredCommits.length = 0;
  useOrganizationStore.getState().clearOrganization();
  useRolesMock.mockReturnValue(
    rolesResult([role('rol_owner', 'Owner'), role('rol_member', 'Member')]),
  );
});

/** Open the row menu, pick Remove, and accept the confirm dialog. */
async function confirmRemoval(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('member-actions-mem_1'));
  await user.click(await screen.findByTestId('member-remove-mem_1'));
  await user.click(await screen.findByTestId('confirm-accept'));
}

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
    // Picks a DIFFERENT role than the member's own — re-picking the current one
    // is a no-op by design now (SET-12).
    useRolesMock.mockReturnValue(
      rolesResult([
        role('rol_owner', 'Owner'),
        role('rol_member', 'Member'),
        role('rol_admin', 'Admin'),
      ]),
    );
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-set-role-rol_admin'));

    await waitFor(() =>
      expect(updateRoleMutate).toHaveBeenCalledWith(
        expect.objectContaining({ membershipId: 'mem_1', roleId: 'rol_admin' }),
      ),
    );
  });

  // ── SET-12: one membership write per gesture ─────────────────────────────

  it('sends nothing when the role a member already has is re-picked', async () => {
    // Radix fires onValueChange for the selected item too, so opening the menu
    // and clicking the current role PATCHed and toasted "Role updated" for a
    // change that did not happen.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-set-role-rol_member'));

    expect(updateRoleMutate).not.toHaveBeenCalled();
  });

  it('disables the role menu while a role change is in flight', async () => {
    // `useAppMutation` JOINS a second call to the one already running, so a
    // second pick looked accepted and then vanished. Say "busy" instead.
    useRolesMock.mockReturnValue(
      rolesResult([
        role('rol_owner', 'Owner'),
        role('rol_member', 'Member'),
        role('rol_admin', 'Admin'),
      ]),
    );
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await user.click(screen.getByTestId('member-actions-mem_1'));
    await user.click(await screen.findByTestId('member-set-role-rol_admin'));
    expect(updateRoleMutate).toHaveBeenCalledTimes(1);

    // The menu closes on select, so the disabled items are out of sight — the
    // row's own control has to carry the busy state.
    const trigger = screen.getByTestId('member-actions-mem_1');
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(trigger.querySelector('.animate-spin')).not.toBeNull();

    // Radix closes the menu on select; reopen it and try to pick again.
    await user.click(screen.getByTestId('member-actions-mem_1'));
    const other = await screen.findByTestId('member-set-role-rol_member');
    expect(other).toHaveAttribute('aria-disabled', 'true');

    await user.click(other);
    expect(updateRoleMutate).toHaveBeenCalledTimes(1);
  });

  it('contains a crash in a row menu to that row', async () => {
    // One member's actions are their own failure domain — a throw there must
    // not blank the whole list.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    useRolesMock.mockImplementation(() => {
      throw new Error('roles hook exploded');
    });
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);

    expect(await screen.findByTestId('member-actions-error-mem_1')).toBeInTheDocument();
    expect(screen.getByTestId('members-list')).toBeInTheDocument();
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();
    consoleError.mockRestore();
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

    await confirmRemoval(user);

    await waitFor(() => expect(removeMutate).toHaveBeenCalledWith('mem_1'));
    // Through `mutateAsync` only — `mutate` returns void and cannot be awaited.
    expect(removeMutateSync).not.toHaveBeenCalled();
  });

  // ── SET-7: the deferred removal is tied to the write it defers ───────────

  it('does not resolve the deferred commit until the DELETE lands', async () => {
    // The bug: the panel scheduled `() => removeMember.mutate(id)`, which
    // returns void. The deferred commit resolved the instant it fired, so the
    // toast reported the removal before the request had been answered.
    let completeWrite!: () => void;
    removeMutate.mockReturnValue(
      new Promise<void>((resolve) => {
        completeWrite = resolve;
      }),
    );
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await confirmRemoval(user);
    // Keyed on the SCHEDULE, not on which entry point ran — the assertions
    // below are what must tell `mutateAsync` apart from `mutate`.
    await waitFor(() => expect(deferredCommits).toHaveLength(1));

    let committed = false;
    void lastDeferred().commit.then(() => {
      committed = true;
    });
    await flushMicrotasks();
    // The DELETE is still in flight, so the commit must still be open.
    expect(committed).toBe(false);

    completeWrite();
    await act(async () => {
      await lastDeferred().commit;
    });
    expect(committed).toBe(true);
  });

  it('lets a failed DELETE reject, so the rollback path can run', async () => {
    // `mutate` never rejects, so `onCommitError` could not fire and the row
    // stayed gone after a delete the server refused.
    const failure = new Error('Forbidden');
    removeMutate.mockImplementation(() => Promise.reject(failure));
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationMembersPanel />);

    await confirmRemoval(user);
    await waitFor(() => expect(deferredCommits).toHaveLength(1));

    await expect(lastDeferred().commit).rejects.toBe(failure);
  });

  it('silences the mutation toast so one removal is confirmed once', () => {
    // The undo toast owns the whole sequence; without this the user got the
    // mutation's "Member removed" AND the deferred one, five seconds apart.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);

    expect(removeMemberOptions.at(-1)).toEqual({ suppressSuccessToast: true });
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

  // ── SET-19: the list says "not current yet" from the first keystroke ──────

  it('dims the rows the moment the search changes, and never blanks them', async () => {
    // `keepPreviousData` already stops the skeleton swap (X-2). The remaining
    // gap was the debounce window: for ~300ms the list showed an answer to a
    // question the user had already changed, and said nothing about it.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);

    expect(screen.getByTestId('members-list').closest('[aria-busy="true"]')).toBeNull();

    fireEvent.change(screen.getByTestId('members-search'), { target: { value: 'jo' } });

    // Immediately: before the debounce fires, before any request starts.
    expect(
      screen.getByTestId('members-list').closest('[aria-busy="true"]'),
    ).not.toBeNull();
    // …and the rows are still there. No skeleton, no height collapse.
    expect(screen.queryByTestId('members-loading')).not.toBeInTheDocument();
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('members-list').closest('[aria-busy="true"]')).toBeNull(),
    );
  });

  // ── SET-23: the invite slot keeps its place while permissions load ───────

  it('holds the invite slot with a disabled placeholder before permissions land', () => {
    // Regression: `useCan` is synchronous and the guard chain fills the store a
    // beat later, so the button was absent and then popped in.
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    useOrganizationStore.setState({ permissionsResolved: false });
    render(<OrganizationMembersPanel />);

    expect(screen.getByTestId('invite-member-pending')).toBeDisabled();
    expect(screen.queryByTestId('invite-member-open')).not.toBeInTheDocument();
  });

  it('swaps the placeholder for the real trigger once they do', () => {
    useMembersMock.mockReturnValue(membersQueryResult({ rows: [MEMBER] }));
    setCanManage(true);
    render(<OrganizationMembersPanel />);

    expect(screen.getByTestId('invite-member-open')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-pending')).not.toBeInTheDocument();
  });
});
