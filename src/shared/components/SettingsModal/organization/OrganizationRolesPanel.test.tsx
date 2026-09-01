import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
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

const { useRolesMock, deleteMutate } = vi.hoisted(() => ({
  useRolesMock: vi.fn(),
  deleteMutate: vi.fn(),
}));
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({
  useRoles: useRolesMock,
  useDeleteRole: () => ({ mutate: deleteMutate, mutateAsync: deleteMutate }),
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
vi.mock('@/shared/notify/notify-deferred.ts', () => ({
  // Commit immediately and hand back the real handle shape the caller stores.
  notifyDeferredCommit: ({ onCommit }: { onCommit: () => void | Promise<void> }) => {
    void onCommit();
    return { cancel: vi.fn(), flush: vi.fn() };
  },
}));

import { OrganizationRolesPanel } from './OrganizationRolesPanel.tsx';

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
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrganizationStore.getState().clearOrganization();
});

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

    await user.click(screen.getByTestId('role-actions-rol_1'));
    await user.click(await screen.findByTestId('role-delete-rol_1'));
    await user.click(await screen.findByTestId('confirm-accept'));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith('rol_1'));
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
});
