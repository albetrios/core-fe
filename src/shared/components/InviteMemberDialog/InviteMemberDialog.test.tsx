import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RoleSummary } from '@/shared/api/organization-contracts.ts';

import { InviteMemberDialog } from './InviteMemberDialog.tsx';

const { inviteMutate, useRolesMock } = vi.hoisted(() => ({
  inviteMutate: vi.fn(),
  useRolesMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useInvitations/index.ts', () => ({
  useInviteMember: () => ({ mutateAsync: inviteMutate, isPending: false }),
}));
vi.mock('@/shared/hooks/useRoles/index.ts', () => ({
  useRoles: useRolesMock,
}));

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

function rolesResult(rows: RoleSummary[], isPending = false) {
  return {
    rows,
    isPending,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('invite-member-open'));
  return user;
}

describe('InviteMemberDialog', () => {
  it('submits the email + selected role_id (the org has real roles)', async () => {
    // Regression: the form used to submit a hardcoded role NAME to a
    // non-existent /invitations endpoint. It must post a real role_id.
    useRolesMock.mockReturnValue(
      rolesResult([role('rol_owner', 'Owner'), role('rol_mem', 'Member')]),
    );
    inviteMutate.mockResolvedValueOnce({ email: 'new@x.test' });
    render(<InviteMemberDialog />);
    const user = await open();

    await screen.findByTestId('invite-member-form');
    await user.type(screen.getByTestId('invite-member-email'), 'new@x.test');
    await user.click(screen.getByTestId('invite-member-submit'));

    await waitFor(() =>
      expect(inviteMutate).toHaveBeenCalledWith({
        email: 'new@x.test',
        roleId: 'rol_mem',
      }),
    );
  });

  it('excludes the Owner role from the invite options', async () => {
    useRolesMock.mockReturnValue(
      rolesResult([role('rol_owner', 'Owner'), role('rol_mem', 'Member')]),
    );
    render(<InviteMemberDialog />);
    const user = await open();
    await user.click(await screen.findByTestId('invite-member-role'));

    expect(await screen.findByRole('option', { name: 'Member' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument();
  });

  it('guides the user to create a role when only Owner exists', async () => {
    useRolesMock.mockReturnValue(rolesResult([role('rol_owner', 'Owner')]));
    render(<InviteMemberDialog />);
    await open();

    expect(await screen.findByTestId('invite-member-no-roles')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-form')).not.toBeInTheDocument();
  });

  it('shows a loading state while roles are fetching', async () => {
    useRolesMock.mockReturnValue(rolesResult([], true));
    render(<InviteMemberDialog />);
    await open();

    expect(await screen.findByTestId('invite-member-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-no-roles')).not.toBeInTheDocument();
  });

  // ── SET-11: a failed roles fetch is not "you have no roles" ───────────────

  it('offers a retry when the roles fetch fails, not "go create a role"', async () => {
    // Regression: the else branch caught isError too, so a network failure told
    // the user to create a role that already exists.
    const refetch = vi.fn();
    const user = userEvent.setup();
    useRolesMock.mockReturnValue({
      ...rolesResult([]),
      isError: true,
      refetch,
    });
    render(<InviteMemberDialog />);
    await user.click(screen.getByTestId('invite-member-open'));

    expect(await screen.findByTestId('invite-member-roles-error')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-no-roles')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('retry-button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('still guides the user when the fetch SUCCEEDS with no assignable role', async () => {
    const user = userEvent.setup();
    useRolesMock.mockReturnValue(rolesResult([role('rol_owner', 'Owner')]));
    render(<InviteMemberDialog />);
    await user.click(screen.getByTestId('invite-member-open'));

    expect(await screen.findByTestId('invite-member-no-roles')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-member-roles-error')).not.toBeInTheDocument();
  });

  // ── Least-privilege default ───────────────────────────────────────────────

  it('opens on Member, not on whatever the roster sorts first', async () => {
    // Regression: the field defaulted to `invitableRoles[0]`, and every
    // organization this app provisions sorts `Admin` first — so the quiet path
    // through the dialog handed a new teammate admin rights.
    useRolesMock.mockReturnValue(
      rolesResult([
        role('rol_admin', 'Admin'),
        role('rol_mem', 'Member'),
        role('rol_view', 'Viewer'),
      ]),
    );
    render(<InviteMemberDialog />);
    await open();

    expect(await screen.findByTestId('invite-member-role')).toHaveTextContent('Member');
  });

  it('falls back to Viewer when the organization has no Member role', async () => {
    useRolesMock.mockReturnValue(
      rolesResult([role('rol_admin', 'Admin'), role('rol_view', 'Viewer')]),
    );
    render(<InviteMemberDialog />);
    await open();

    expect(await screen.findByTestId('invite-member-role')).toHaveTextContent('Viewer');
  });

  it('preselects nothing — and says so — when only custom roles exist', async () => {
    // A custom role carries no permission set here to rank it by, so guessing
    // one would be a blind privilege grant. The inviter chooses instead, and a
    // send with nothing chosen has to SAY that rather than silently do nothing.
    const user = userEvent.setup();
    useRolesMock.mockReturnValue(
      rolesResult([role('rol_a', 'Support'), role('rol_b', 'Editor')]),
    );
    render(<InviteMemberDialog />);
    await user.click(screen.getByTestId('invite-member-open'));
    await screen.findByTestId('invite-member-form');

    const roleTrigger = screen.getByTestId('invite-member-role');
    expect(roleTrigger).not.toHaveTextContent('Support');
    expect(roleTrigger).not.toHaveTextContent('Editor');

    await user.type(screen.getByTestId('invite-member-email'), 'new@x.test');
    await user.click(screen.getByTestId('invite-member-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Select a role');
    expect(roleTrigger).toHaveAttribute('aria-invalid', 'true');
    expect(inviteMutate).not.toHaveBeenCalled();
  });

  it('never overwrites a role the user already picked', async () => {
    // The default effect re-runs whenever the first role id changes; a refetch
    // that reorders the list used to reset the field under the user.
    const user = userEvent.setup();
    useRolesMock.mockReturnValue(
      rolesResult([role('rol_a', 'Support'), role('rol_b', 'Editor')]),
    );
    const { rerender } = render(<InviteMemberDialog />);
    await user.click(screen.getByTestId('invite-member-open'));
    await screen.findByTestId('invite-member-role');

    await user.click(screen.getByTestId('invite-member-role'));
    await user.click(await screen.findByRole('option', { name: 'Editor' }));
    expect(screen.getByTestId('invite-member-role')).toHaveTextContent('Editor');

    // A refetch brings a NEW first role — on the unfixed build the effect fires
    // again and replaces the user's choice with it.
    useRolesMock.mockReturnValue(
      rolesResult([
        role('rol_c', 'Ops'),
        role('rol_a', 'Support'),
        role('rol_b', 'Editor'),
      ]),
    );
    rerender(<InviteMemberDialog />);

    await waitFor(() =>
      expect(screen.getByTestId('invite-member-role')).toHaveTextContent('Editor'),
    );
  });
});
