import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyCreateDialog } from './ApiKeyCreateDialog.tsx';

// The permission picker now reads core-be's catalog (`GET /tenancy/permissions`) intersected
// with what the caller holds, instead of a hardcoded client list. Stub the hook so these
// tests stay about the dialog rather than the fetch.
const { useAssignablePermissionsMock } = vi.hoisted(() => ({
  useAssignablePermissionsMock: vi.fn(() => ({
    rows: [
      { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
      { code: 'membership:read', name: 'View Members', category: 'tenancy' },
      { code: 'membership:manage', name: 'Manage Members', category: 'tenancy' },
      { code: 'invitation:manage', name: 'Manage Invitations', category: 'tenancy' },
      { code: 'webhook:manage', name: 'Manage Webhooks', category: 'notify' },
    ],
    isPending: false,
    isError: false,
  })),
}));
vi.mock('@/shared/hooks/useAssignablePermissions/index.ts', () => ({
  useAssignablePermissions: useAssignablePermissionsMock,
}));

const { createMutate, createState, copySensitiveText, notifyError, notifySuccess } =
  vi.hoisted(() => ({
    createMutate: vi.fn(),
    // Mutable so a test can put the mutation in flight; the hook is read on
    // every render, so flipping this before `render` is enough.
    createState: { isPending: false },
    copySensitiveText: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  }));

vi.mock('@/shared/hooks/useApiKeys/index.ts', () => ({
  useCreateApiKey: () => ({ mutate: createMutate, isPending: createState.isPending }),
}));
vi.mock('@/lib/sensitive-clipboard.ts', () => ({ copySensitiveText }));
vi.mock('@/shared/notify/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const notify = actual.notify as Record<string, unknown>;
  return { ...actual, notify: { ...notify, error: notifyError, success: notifySuccess } };
});

/** A created key, as the mutation hands it back. */
const CREATED = {
  id: 'pat_x',
  name: 'Production server',
  prefix: 'core_ab',
  createdAt: '2026-09-21T00:00:00.000Z',
  secret: 'core_ab_SUPERSECRETVALUE',
};

/** Make the next create succeed with {@link CREATED} (or an override). */
function createSucceeds(key: Partial<typeof CREATED> = {}) {
  createMutate.mockImplementation((_vars, handlers) => {
    handlers.onSuccess({ ...CREATED, ...key });
  });
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('apikey-create-open'));
  await screen.findByTestId('apikey-create-dialog');
  return user;
}

describe('ApiKeyCreateDialog', () => {
  beforeEach(() => {
    // These are module-level mocks: without a reset, an implementation set by
    // one case decides the next one's outcome.
    createMutate.mockReset();
    createState.isPending = false;
    copySensitiveText.mockReset().mockResolvedValue(true);
    notifyError.mockReset();
    notifySuccess.mockReset();
  });

  it('sends the name, chosen scopes and a NUMBER of days', async () => {
    // Regression: the fetcher used to omit `scopes` (required, and the body is
    // `.strict()` server-side) and send `expires_in_days` as a STRING, so every
    // create this dialog could have made would have been rejected 400.
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Production server');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        { name: 'Production server', scopes: ['organization:read'], expiresInDays: 90 },
        expect.anything(),
      ),
    );
  });

  it('omits the expiry entirely for a key that never expires', async () => {
    // core-be caps `expires_in_days` at 365, so "never" cannot be expressed as
    // a bigger number — the field has to be absent.
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Forever');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-expiry'));
    await user.click(await screen.findByRole('option', { name: 'Never' }));
    await user.click(screen.getByTestId('apikey-create'));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: null }),
        expect.anything(),
      ),
    );
  });

  it('refuses to submit without a scope, and says why', async () => {
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'No scopes');
    await user.click(screen.getByTestId('apikey-create'));

    expect(await screen.findByTestId('apikey-error')).toHaveTextContent(
      'Pick at least one scope',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('refuses to submit without a name, and says why', async () => {
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));

    expect(await screen.findByTestId('apikey-error')).toHaveTextContent(
      'Give the key a name',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('reveals the secret once and holds Done until it is acknowledged', async () => {
    // core-be stores only a hash. A secret dismissed by a stray keypress is
    // gone, and the key has to be rotated — so the gate is not decoration.
    createSucceeds();
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Production server');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));

    expect(await screen.findByTestId('apikey-secret')).toHaveTextContent(
      'core_ab_SUPERSECRETVALUE',
    );
    expect(screen.getByTestId('apikey-secret-done')).toBeDisabled();

    await user.click(screen.getByTestId('apikey-secret-ack'));
    expect(screen.getByTestId('apikey-secret-done')).toBeEnabled();

    await user.click(screen.getByTestId('apikey-secret-copy'));
    await waitFor(() =>
      expect(copySensitiveText).toHaveBeenCalledWith('core_ab_SUPERSECRETVALUE'),
    );
  });

  it('keeps the dialog open while an unacknowledged secret is on screen', async () => {
    createSucceeds({ id: 'pat_y', name: 'Escape test', secret: 'core_cd_ANOTHERSECRET' });
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Escape test');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));
    await screen.findByTestId('apikey-secret');

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('apikey-secret')).toBeInTheDocument();
  });

  it('shows the server reason beside the form and stays open', async () => {
    // A create rejected for a reason the form can act on (a duplicate name, a
    // scope the plan does not allow) must not close the dialog and throw the
    // typed values away — the message belongs next to the field, not only in a
    // toast that fades.
    createMutate.mockImplementation((_vars, handlers) => {
      handlers.onError(new Error('An API key with that name already exists'));
    });
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Duplicate');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));

    expect(await screen.findByTestId('apikey-error')).toBeInTheDocument();
    expect(screen.getByTestId('apikey-create-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('apikey-name')).toHaveValue('Duplicate');
  });

  it('a second click on a scope takes it off again', async () => {
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Toggling');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-scope-membership:read'));
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ['membership:read'] }),
        expect.anything(),
      ),
    );
  });

  it('Cancel closes the dialog and the next open starts empty', async () => {
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Abandoned');
    await user.click(screen.getByTestId('apikey-create'));
    expect(await screen.findByTestId('apikey-error')).toBeInTheDocument();

    await user.click(screen.getByTestId('apikey-cancel'));
    await waitFor(() =>
      expect(screen.queryByTestId('apikey-create-dialog')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('apikey-create-open'));
    await screen.findByTestId('apikey-create-dialog');
    // Neither the abandoned name nor the error it produced survives.
    expect(screen.getByTestId('apikey-name')).toHaveValue('');
    expect(screen.queryByTestId('apikey-error')).not.toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('Done closes the dialog once the secret is acknowledged', async () => {
    createSucceeds();
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Production server');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));
    await screen.findByTestId('apikey-secret');

    await user.click(screen.getByTestId('apikey-secret-ack'));
    await user.click(screen.getByTestId('apikey-secret-done'));

    await waitFor(() =>
      expect(screen.queryByTestId('apikey-create-dialog')).not.toBeInTheDocument(),
    );
    // Reopening lands on the form, not on the secret of the key just made.
    await user.click(screen.getByTestId('apikey-create-open'));
    await screen.findByTestId('apikey-create-dialog');
    expect(screen.queryByTestId('apikey-secret')).not.toBeInTheDocument();
  });

  it('says so when the clipboard refuses the secret', async () => {
    // A silent failure here is the worst case: the user believes they have the
    // secret, closes the only screen that shows it, and has to rotate the key.
    createSucceeds();
    copySensitiveText.mockResolvedValue(false);
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Production server');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));
    await screen.findByTestId('apikey-secret');

    await user.click(screen.getByTestId('apikey-secret-copy'));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('confirms a copy that worked', async () => {
    createSucceeds();
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Production server');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));
    await screen.findByTestId('apikey-secret');

    await user.click(screen.getByTestId('apikey-secret-copy'));

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('cannot be dismissed, or cancelled, while the create is in flight', async () => {
    // Esc and the overlay both come through `onOpenChange`. Closing mid-request
    // would lose the secret of a key the server is about to create.
    createState.isPending = true;
    render(<ApiKeyCreateDialog />);
    const user = await open();

    expect(screen.getByTestId('apikey-cancel')).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('apikey-create-dialog')).toBeInTheDocument();
  });
});
