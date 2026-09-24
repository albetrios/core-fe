import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { useRolesMock, deleteMutate, deleteMutateSync, deleteRoleOptions } = vi.hoisted(
  () => ({
    useRolesMock: vi.fn(),
    /** `mutateAsync` — the only deletion entry point the panel may use. */
    deleteMutate: vi.fn(),
    /** `mutate` — kept separate so a regression to the void-returning call shows. */
    deleteMutateSync: vi.fn(),
    /** Every options object `useDeleteRole` was constructed with. */
    deleteRoleOptions: [] as (Record<string, unknown> | undefined)[],
  }),
);
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({
  useRoles: useRolesMock,
  useDeleteRole: (options?: Record<string, unknown>) => {
    deleteRoleOptions.push(options);
    return { mutate: deleteMutateSync, mutateAsync: deleteMutate };
  },
}));
// CreateRoleDialog has its own suite; here we only assert the panel renders it
// (create trigger + controlled edit instance), so stub it to reflect its mode.
vi.mock('@/shared/components/CreateRoleDialog/index.ts', () => ({
  CreateRoleDialog: ({ role }: { role?: { id: string } }) => (
    <button
      type="button"
      data-testid={role ? `role-edit-dialog-${role.id}` : 'role-create-open'}
    >
      {role ? 'Edit role' : 'New role'}
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

import { OrganizationRolesPanel } from './OrganizationRolesPanel.tsx';

/** The most recently scheduled deferred commit. */
const lastDeferred = () => {
  const call = deferredCommits.at(-1);
  if (!call) throw new Error('no deferred commit was scheduled');
  return call;
};
/** Let queued microtasks run without advancing any timer. */
const flushMicrotasks = () => act(async () => undefined);

const CUSTOM_ROLE = {
  id: 'rol_1',
  name: 'Billing Manager',
  description: 'Manages billing',
  permissions: ['subscription:manage'],
  memberCount: 2,
  isSystem: false,
};
const SYSTEM_ROLE = {
  id: 'rol_owner',
  name: 'Owner',
  description: 'Full access',
  permissions: [],
  memberCount: 1,
  isSystem: true,
};

function rolesQueryResult(
  overrides: { rows?: (typeof CUSTOM_ROLE | typeof SYSTEM_ROLE)[] } & Record<
    string,
    unknown
  >,
) {
  return {
    rows: overrides.rows ?? [],
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function setCanManage(value: boolean) {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationType: value ? 'TEAM' : 'PERSONAL',
    permissions: value ? ['role:manage'] : [],
    // These tests stand in for a session whose guard chain has ANSWERED; the
    // unresolved case has its own test below (SET-23).
    permissionsResolved: true,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // `clearAllMocks` keeps implementations, so a per-test `mockReturnValue` for
  // the write would leak into the next case.
  deleteMutate.mockReset();
  deleteMutateSync.mockReset();
  deleteRoleOptions.length = 0;
  deferredCommits.length = 0;
  useOrganizationStore.getState().clearOrganization();
});

/** Open the row menu, pick Delete, and accept the confirm dialog. */
async function confirmDeletion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('role-actions-rol_1'));
  await user.click(await screen.findByTestId('role-delete-rol_1'));
  await user.click(await screen.findByTestId('confirm-accept'));
}

describe('OrganizationRolesPanel', () => {
  it('shows an empty state when there are no roles', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [] }));
    render(<OrganizationRolesPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows a loading skeleton while roles load', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [], isPending: true }));
    render(<OrganizationRolesPanel />);
    expect(screen.getByTestId('roles-loading')).toBeInTheDocument();
  });

  it('shows a retry error when the roles query fails', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [], isError: true }));
    render(<OrganizationRolesPanel />);
    expect(screen.getByText(/couldn.t load roles/i)).toBeInTheDocument();
  });

  it('shows an actions menu only for custom roles, and only with the permission', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE, SYSTEM_ROLE] }));
    setCanManage(true);
    render(<OrganizationRolesPanel />);
    expect(screen.getByText('Billing Manager')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByTestId('role-actions-rol_1')).toBeInTheDocument();
    expect(screen.queryByTestId('role-actions-rol_owner')).not.toBeInTheDocument();
  });

  it('hides actions without the manage-roles permission', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(false);
    render(<OrganizationRolesPanel />);
    expect(screen.queryByTestId('role-actions-rol_1')).not.toBeInTheDocument();
  });

  it('opens the edit dialog for a custom role', async () => {
    // Regression: roles could only be created + deleted, never edited.
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await user.click(screen.getByTestId('role-actions-rol_1'));
    await user.click(await screen.findByTestId('role-edit-rol_1'));
    expect(await screen.findByTestId('role-edit-dialog-rol_1')).toBeInTheDocument();
  });

  it('exposes a New role button for a manager (roles were create-less before)', () => {
    // Regression: the panel was read/delete-only, so a new org (which has only
    // the system Owner role) could never gain a role to invite members as.
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [SYSTEM_ROLE] }));
    setCanManage(true);
    render(<OrganizationRolesPanel />);
    expect(screen.getByTestId('role-create-open')).toBeInTheDocument();
  });

  it('hides the New role button without role:manage', () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [SYSTEM_ROLE] }));
    setCanManage(false);
    render(<OrganizationRolesPanel />);
    expect(screen.queryByTestId('role-create-open')).not.toBeInTheDocument();
  });

  it('confirms and deletes a custom role from the actions menu', async () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await confirmDeletion(user);

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith('rol_1'));
    // Through `mutateAsync` only — `mutate` returns void and cannot be awaited.
    expect(deleteMutateSync).not.toHaveBeenCalled();
  });

  // ── SET-7: the deferred deletion is tied to the write it defers ──────────

  it('does not resolve the deferred commit until the DELETE lands', async () => {
    // The bug: the panel scheduled `() => deleteRole.mutate(id)`, which returns
    // void. The deferred commit resolved the instant it fired, so the toast
    // reported the deletion before the request had been answered.
    let completeWrite!: () => void;
    deleteMutate.mockReturnValue(
      new Promise<void>((resolve) => {
        completeWrite = resolve;
      }),
    );
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await confirmDeletion(user);
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
    const failure = new Error('Role is in use');
    deleteMutate.mockImplementation(() => Promise.reject(failure));
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await confirmDeletion(user);
    await waitFor(() => expect(deferredCommits).toHaveLength(1));

    await expect(lastDeferred().commit).rejects.toBe(failure);
  });

  it('silences the mutation toast so one deletion is confirmed once', () => {
    // The undo toast owns the whole sequence; without this the user got the
    // mutation's "Role deleted" AND the deferred one, five seconds apart.
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    render(<OrganizationRolesPanel />);

    expect(deleteRoleOptions.at(-1)).toEqual({ suppressSuccessToast: true });
  });

  it('forwards the debounced search term to the hook', async () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [] }));
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await user.type(screen.getByTestId('roles-search'), 'bill');
    await waitFor(() =>
      expect(useRolesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'bill', sort: 'name', order: 'asc' }),
      ),
    );
  });

  it('forwards the selected sort preset to the hook', async () => {
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [] }));
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await user.click(screen.getByTestId('roles-sort'));
    await user.click(await screen.findByRole('option', { name: 'Name (Z–A)' }));

    await waitFor(() =>
      expect(useRolesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'name', order: 'desc' }),
      ),
    );
  });

  it('loads the next page when Load more is clicked', async () => {
    const fetchNextPage = vi.fn();
    useRolesMock.mockReturnValue(
      rolesQueryResult({ rows: [CUSTOM_ROLE], hasNextPage: true, fetchNextPage }),
    );
    const user = userEvent.setup();
    render(<OrganizationRolesPanel />);

    await user.click(screen.getByTestId('roles-load-more'));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  // ── SET-23: the New role slot keeps its place ────────────────────────────

  it('holds the New role slot with a disabled placeholder before permissions land', () => {
    // Its own list: this test used to inherit whichever one the test before it
    // left installed.
    useRolesMock.mockReturnValue(rolesQueryResult({ rows: [CUSTOM_ROLE] }));
    setCanManage(true);
    useOrganizationStore.setState({ permissionsResolved: false });
    render(<OrganizationRolesPanel />);

    expect(screen.getByTestId('role-create-pending')).toBeDisabled();
    expect(screen.queryByTestId('role-create-open')).not.toBeInTheDocument();
  });
});
