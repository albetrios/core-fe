import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeyCreateDialog } from './ApiKeyCreateDialog.tsx';

const { createMutate, copySensitiveText } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  copySensitiveText: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/shared/hooks/useApiKeys/index.ts', () => ({
  useCreateApiKey: () => ({ mutate: createMutate, isPending: false }),
}));
vi.mock('@/lib/sensitive-clipboard.ts', () => ({ copySensitiveText }));

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('apikey-create-open'));
  await screen.findByTestId('apikey-create-dialog');
  return user;
}

describe('ApiKeyCreateDialog', () => {
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
    createMutate.mockImplementation((_vars, handlers) => {
      handlers.onSuccess({
        id: 'pat_x',
        name: 'Production server',
        prefix: 'core_ab',
        createdAt: '2026-09-21T00:00:00.000Z',
        secret: 'core_ab_SUPERSECRETVALUE',
      });
    });
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
    createMutate.mockImplementation((_vars, handlers) => {
      handlers.onSuccess({
        id: 'pat_y',
        name: 'Escape test',
        prefix: 'core_cd',
        createdAt: '2026-09-21T00:00:00.000Z',
        secret: 'core_cd_ANOTHERSECRET',
      });
    });
    render(<ApiKeyCreateDialog />);
    const user = await open();

    await user.type(screen.getByTestId('apikey-name'), 'Escape test');
    await user.click(screen.getByTestId('apikey-scope-organization:read'));
    await user.click(screen.getByTestId('apikey-create'));
    await screen.findByTestId('apikey-secret');

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('apikey-secret')).toBeInTheDocument();
  });
});
