import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RoleSummary } from '@/shared/api/organization-contracts.ts';
import { axeForDialog } from '@/tests/utils/axe-for-dialog.ts';

import { CreateRoleDialog } from './CreateRoleDialog.tsx';

const { createRoleMutate, updateRoleMutate, useRolePermissionsMock } = vi.hoisted(() => ({
  createRoleMutate: vi.fn(),
  updateRoleMutate: vi.fn(),
  useRolePermissionsMock: vi.fn(() => ({ data: undefined, isSuccess: false })),
}));
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({
  useCreateRole: () => ({ mutateAsync: createRoleMutate, isPending: false }),
  useUpdateRole: () => ({ mutateAsync: updateRoleMutate, isPending: false }),
  useRolePermissions: useRolePermissionsMock,
}));

const EDIT_ROLE: RoleSummary = {
  id: 'rol_x',
  name: 'Member',
  description: 'Everyday access',
  permissions: ['membership:read'],
  memberCount: 3,
  isSystem: false,
};

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('role-create-open'));
  await screen.findByTestId('role-create-form');
  return user;
}

describe('CreateRoleDialog', () => {
  it('opens a form with name, description, and a permission checklist', async () => {
    render(<CreateRoleDialog />);
    await open();
    expect(screen.getByTestId('role-create-name')).toBeInTheDocument();
    expect(screen.getByTestId('role-create-description')).toBeInTheDocument();
    expect(screen.getByTestId('role-perm-membership:manage')).toBeInTheDocument();
    expect(screen.getByTestId('role-perm-invitation:manage')).toBeInTheDocument();
  });

  it('blocks submit until at least one permission is selected', async () => {
    render(<CreateRoleDialog />);
    const user = await open();

    await user.type(screen.getByTestId('role-create-name'), 'Member');
    await user.type(screen.getByTestId('role-create-description'), 'Everyday access');
    await user.click(screen.getByTestId('role-create-submit'));

    expect(await screen.findByText(/at least one permission/i)).toBeInTheDocument();
    expect(createRoleMutate).not.toHaveBeenCalled();
  });

  it('creates a role with the chosen name, description, and permissions', async () => {
    createRoleMutate.mockResolvedValueOnce({ id: 'rol_x', name: 'Member' });
    render(<CreateRoleDialog />);
    const user = await open();

    await user.type(screen.getByTestId('role-create-name'), 'Member');
    await user.type(screen.getByTestId('role-create-description'), 'Everyday access');
    await user.click(screen.getByTestId('role-perm-membership:read'));
    await user.click(screen.getByTestId('role-create-submit'));

    await waitFor(() =>
      expect(createRoleMutate).toHaveBeenCalledWith({
        name: 'Member',
        description: 'Everyday access',
        permissions: ['membership:read'],
      }),
    );
  });

  it('has no accessibility violations', async () => {
    const { baseElement } = render(<CreateRoleDialog />);
    await open();
    expect(await axeForDialog(baseElement)).toHaveNoViolations();
  });

  it('edits an existing role: pre-filled and saves via updateRole', async () => {
    // Regression: roles could be created + deleted but not EDITED.
    // The list omits permissions, so the dialog fetches the real grants to
    // pre-fill — otherwise a save would wipe them.
    useRolePermissionsMock.mockReturnValue({
      data: ['membership:read'],
      isSuccess: true,
    });
    updateRoleMutate.mockResolvedValueOnce(EDIT_ROLE);
    const user = userEvent.setup();
    render(<CreateRoleDialog role={EDIT_ROLE} open onOpenChange={vi.fn()} />);

    const form = await screen.findByTestId('role-create-form');
    expect(form).toBeInTheDocument();
    // Pre-filled from the role.
    expect(screen.getByTestId('role-create-name')).toHaveValue('Member');
    // Pre-filled from the fetched permissions (checkbox reflects the grant).
    await waitFor(() =>
      expect(screen.getByTestId('role-perm-membership:read')).toHaveAttribute(
        'data-state',
        'checked',
      ),
    );
    // Add a permission and save.
    await user.click(screen.getByTestId('role-perm-membership:manage'));
    await user.click(screen.getByTestId('role-create-submit'));

    await waitFor(() =>
      expect(updateRoleMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'rol_x',
          name: 'Member',
          permissions: expect.arrayContaining(['membership:read', 'membership:manage']),
        }),
      ),
    );
  });

  // ── SET-10: pre-fill once, on the success transition ──────────────────────

  it('shows a skeleton instead of an all-unchecked checklist while grants load', async () => {
    // Regression: the list row carries no permissions, so the edit form opened
    // with every box unchecked and then visibly ticked itself.
    useRolePermissionsMock.mockReturnValue({ data: undefined, isSuccess: false });
    render(<CreateRoleDialog role={EDIT_ROLE} open onOpenChange={() => {}} />);

    expect(await screen.findByTestId('role-edit-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('role-perm-membership:read')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-create-submit')).toBeDisabled();
  });

  it('keeps in-progress edits when the permissions query refetches', async () => {
    // The permissions key is a DESCENDANT of the roles prefix, so ANY other role
    // mutation invalidates it. Keying the pre-fill on `data` re-ran reset() on
    // every refetch and wiped whatever the user had typed.
    const user = userEvent.setup();
    useRolePermissionsMock.mockReturnValue({
      data: ['membership:read'],
      isSuccess: true,
    });
    const { rerender } = render(
      <CreateRoleDialog role={EDIT_ROLE} open onOpenChange={() => {}} />,
    );

    const name = await screen.findByTestId('role-create-name');
    await user.clear(name);
    await user.type(name, 'Editor');
    await user.click(screen.getByTestId('role-perm-invitation:manage'));

    // A refetch lands: same values, brand-new array identity.
    useRolePermissionsMock.mockReturnValue({
      data: ['membership:read'],
      isSuccess: true,
    });
    rerender(<CreateRoleDialog role={EDIT_ROLE} open onOpenChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId('role-create-name')).toHaveValue('Editor'),
    );
    expect(screen.getByTestId('role-perm-invitation:manage')).toBeChecked();
  });
});
