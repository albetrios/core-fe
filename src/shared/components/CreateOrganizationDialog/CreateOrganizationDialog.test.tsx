import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notify } from '@/shared/notify/index.ts';
import { createOrganization } from '@/shared/tenancy/my-organizations.ts';
import { hydrateSessionContext } from '@/shared/tenancy/session-context.ts';
import { switchToOrganization } from '@/shared/tenancy/switch.ts';

import { CreateOrganizationDialog } from './CreateOrganizationDialog.tsx';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createOrganization: vi.fn() };
});
vi.mock('@/shared/tenancy/session-context.ts', () => ({
  hydrateSessionContext: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToOrganization: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const ORG = { id: 'org_9', name: 'Acme', slug: 'acme' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openAndSubmit(name: string, slug = '') {
  fireEvent.click(screen.getByTestId('create-organization-open'));
  await screen.findByTestId('create-organization-dialog-form');
  fireEvent.change(screen.getByTestId('create-organization-dialog-name'), {
    target: { value: name },
  });
  if (slug) {
    fireEvent.change(screen.getByTestId('create-organization-dialog-slug'), {
      target: { value: slug },
    });
  }
  fireEvent.click(screen.getByTestId('create-organization-dialog-submit'));
}

describe('CreateOrganizationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createOrganization).mockResolvedValue(ORG as never);
  });

  it('creates the org, syncs context, and navigates to its dashboard', async () => {
    render(<CreateOrganizationDialog />, { wrapper });
    await openAndSubmit('Acme');

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    // Empty slug is normalized to undefined so the backend derives it.
    expect(createOrganization).toHaveBeenCalledWith({ name: 'Acme', slug: undefined });
    expect(hydrateSessionContext).toHaveBeenCalledTimes(1);
    expect(switchToOrganization).toHaveBeenCalledWith('org_9');
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { organizationSlug: 'acme' },
        replace: true,
      }),
    );
    // Dialog closes on success.
    await waitFor(() =>
      expect(
        screen.queryByTestId('create-organization-dialog-form'),
      ).not.toBeInTheDocument(),
    );
  });

  it('passes an explicit slug through', async () => {
    render(<CreateOrganizationDialog />, { wrapper });
    await openAndSubmit('Acme Rockets', 'rockets');

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith({
        name: 'Acme Rockets',
        slug: 'rockets',
      }),
    );
  });

  it('surfaces a create failure and keeps the dialog open for a retry', async () => {
    vi.mocked(createOrganization).mockRejectedValue(new Error('slug taken'));
    render(<CreateOrganizationDialog />, { wrapper });
    await openAndSubmit('Acme');

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-organization-dialog-form')).toBeInTheDocument();
  });

  it('blocks submission on an empty name with a field alert', async () => {
    render(<CreateOrganizationDialog />, { wrapper });
    await openAndSubmit('');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('controlled mode delegates open state to the parent', async () => {
    const onOpenChange = vi.fn();
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />, { wrapper });

    // No trigger in controlled mode; the dialog is already open.
    expect(screen.queryByTestId('create-organization-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-organization-dialog-form')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
