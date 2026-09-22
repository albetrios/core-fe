import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** The panel's copy as the bundle renders it — never the English literal. */
const copy = (key: string, lng = 'en') => i18n.t(key, { ns: SETTINGS_NS, lng });

const {
  createApiKeyMutate,
  useApiKeysMock,
  revokeMutateAsync,
  useWebhooksMock,
  createWebhookMutate,
  deleteWebhookMutateAsync,
  webhookCtl,
} = vi.hoisted(() => ({
  createApiKeyMutate: vi.fn(),
  useApiKeysMock: vi.fn(),
  revokeMutateAsync: vi.fn(),
  useWebhooksMock: vi.fn(),
  createWebhookMutate: vi.fn(),
  deleteWebhookMutateAsync: vi.fn(),
  /** Settles the in-flight create (set by the stub when `mutate` is called). */
  webhookCtl: { settle: null as null | ((error?: Error) => void) },
}));
vi.mock('@/shared/hooks/useApiKeys/index.ts', () => ({
  useApiKeys: useApiKeysMock,
  useRevokeApiKey: () => ({ mutateAsync: revokeMutateAsync }),
  // The panel now mounts ApiKeyCreateDialog, which reaches for this hook. Its
  // own behaviour is covered in ApiKeyCreateDialog.test.tsx; here it only has
  // to exist so the section renders.
  useCreateApiKey: () => ({ mutate: createApiKeyMutate, isPending: false }),
}));
vi.mock('@/shared/hooks/useWebhooks/index.ts', async () => {
  const { useState } = await import('react');
  return {
    useWebhooks: useWebhooksMock,
    // Real pending state: the dialog's hold-and-report behaviour is the subject
    // of the SET-26 test below, and a frozen `isPending: false` cannot show it.
    useCreateWebhook: () => {
      const [isPending, setIsPending] = useState(false);
      return {
        isPending,
        mutate: (
          input: unknown,
          options?: { onSuccess?: () => void; onError?: (error: Error) => void },
        ) => {
          createWebhookMutate(input, options);
          setIsPending(true);
          webhookCtl.settle = (error) => {
            setIsPending(false);
            if (error) options?.onError?.(error);
            else options?.onSuccess?.();
          };
        },
      };
    },
    useDeleteWebhook: () => ({ mutateAsync: deleteWebhookMutateAsync }),
  };
});

import { OrganizationIntegrationsPanel } from './OrganizationIntegrationsPanel.tsx';

// The API-key create dialog now sources its scope list from core-be's permission catalog.
// This suite renders the panel without a QueryClientProvider, so stub the hook.
const { useAssignablePermissionsMock } = vi.hoisted(() => ({
  useAssignablePermissionsMock: vi.fn(() => ({
    rows: [{ code: 'organization:read', name: 'View Organization', category: 'tenancy' }],
    isPending: false,
    isError: false,
  })),
}));
vi.mock('@/shared/hooks/useAssignablePermissions/index.ts', () => ({
  useAssignablePermissions: useAssignablePermissionsMock,
}));

const KEY = {
  id: 'key_1',
  name: 'CI deploy key',
  prefix: 'sk_live_abc',
  createdAt: '2026-01-15T00:00:00.000Z',
};

function apiKeysResult(overrides: { rows?: (typeof KEY)[] } & Record<string, unknown>) {
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
const WEBHOOK = {
  id: 'whk_1',
  url: 'https://x.test/hook',
  events: ['member.created'],
  active: true,
  createdAt: '2026-06-01T00:00:00.000Z',
};

function setCanManage(value: boolean) {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationType: value ? 'TEAM' : 'PERSONAL',
    // Each resource is gated on the permission core-be enforces for it: `api-key:manage` for
    // the key controls, `webhook:read` to see the Webhooks sub-section and `webhook:manage`
    // for its controls. The panel used to gate all of them on `role:manage`, a code none of
    // those routes checks.
    permissions: value ? ['api-key:manage', 'webhook:read', 'webhook:manage'] : [],
    permissionsResolved: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  revokeMutateAsync.mockResolvedValue(undefined);
  deleteWebhookMutateAsync.mockResolvedValue(undefined);
  useApiKeysMock.mockReturnValue(apiKeysResult({ rows: [KEY] }));
  useWebhooksMock.mockReturnValue({ data: [WEBHOOK], isLoading: false, isError: false });
  useOrganizationStore.getState().clearOrganization();
});

describe('OrganizationIntegrationsPanel — API keys', () => {
  it('shows an empty state when there are no keys', () => {
    useApiKeysMock.mockReturnValue(apiKeysResult({ rows: [] }));
    render(<OrganizationIntegrationsPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('lists keys with a revoke control when the user has the permission', () => {
    setCanManage(true);
    render(<OrganizationIntegrationsPanel />);
    expect(screen.getByText('CI deploy key')).toBeInTheDocument();
    expect(screen.getByTestId('apikey-revoke-key_1')).toBeInTheDocument();
  });

  it('hides the revoke control without the permission', () => {
    setCanManage(false);
    render(<OrganizationIntegrationsPanel />);
    expect(screen.queryByTestId('apikey-revoke-key_1')).not.toBeInTheDocument();
  });

  it('confirms and revokes a key', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('apikey-revoke-key_1'));
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(revokeMutateAsync).toHaveBeenCalledWith('key_1'));
  });

  it('forwards the debounced search term to the hook', async () => {
    useApiKeysMock.mockReturnValue(apiKeysResult({ rows: [] }));
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.type(screen.getByTestId('apikeys-search'), 'ci');
    await waitFor(() =>
      expect(useApiKeysMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'ci', sort: 'name', order: 'asc' }),
      ),
    );
  });

  it('forwards the selected sort preset to the hook', async () => {
    useApiKeysMock.mockReturnValue(apiKeysResult({ rows: [] }));
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('apikeys-sort'));
    await user.click(await screen.findByRole('option', { name: 'Oldest first' }));
    await waitFor(() =>
      expect(useApiKeysMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'created_at', order: 'asc' }),
      ),
    );
  });

  it('loads the next page when Load more is clicked', async () => {
    const fetchNextPage = vi.fn();
    useApiKeysMock.mockReturnValue(
      apiKeysResult({ rows: [KEY], hasNextPage: true, fetchNextPage }),
    );
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('apikeys-load-more'));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationIntegrationsPanel — webhooks', () => {
  it('lists webhooks with cap-gated controls', () => {
    setCanManage(true);
    render(<OrganizationIntegrationsPanel />);
    expect(screen.getByText('https://x.test/hook')).toBeInTheDocument();
    expect(screen.getByTestId('webhook-add')).toBeInTheDocument();
    expect(screen.getByTestId('webhook-delete-whk_1')).toBeInTheDocument();
  });

  it('hides webhook controls without the permission', () => {
    setCanManage(false);
    render(<OrganizationIntegrationsPanel />);
    expect(screen.queryByTestId('webhook-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webhook-delete-whk_1')).not.toBeInTheDocument();
  });

  // Regression (F5): the section is reachable via api-key:read, but the Webhooks
  // sub-section stays hidden unless the caller can actually read webhooks — so
  // API-key management shows without dragging in an inaccessible webhooks UI.
  it('hides the whole Webhooks section without webhook:read, but keeps API keys', () => {
    useAuthStore.setState({
      user: { id: 'u', email: 'a@b.test', role: 'user' },
      isAuthenticated: true,
    });
    useOrganizationStore.setState({
      organizationType: 'TEAM',
      // Read-only on keys, nothing on webhooks: the caller sees the key list and neither the
      // create control nor the Webhooks section.
      permissions: ['api-key:read'],
      permissionsResolved: true,
    });
    render(<OrganizationIntegrationsPanel />);
    expect(screen.getByText('CI deploy key')).toBeInTheDocument();
    expect(screen.queryByTestId('webhook-add')).not.toBeInTheDocument();
    expect(screen.queryByText('https://x.test/hook')).not.toBeInTheDocument();
  });

  it('creates a webhook with a URL + selected event', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-add'));
    await user.type(await screen.findByTestId('webhook-url'), 'https://new.test/hook');
    await user.click(screen.getByTestId('webhook-event-member.created'));
    await user.click(screen.getByTestId('webhook-create'));
    expect(createWebhookMutate).toHaveBeenCalledWith(
      { url: 'https://new.test/hook', events: ['member.created'] },
      expect.anything(),
    );
  });

  it('confirms and deletes a webhook', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-delete-whk_1'));
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(deleteWebhookMutateAsync).toHaveBeenCalledWith('whk_1'));
  });

  // ── SET-4: a failed webhooks fetch is not an empty workspace ──────────────

  it('shows an error with a retry when the webhooks fetch fails', async () => {
    // Regression: `isError` was never read, so `hooks` stayed undefined, every
    // branch fell through, and the user saw a bare heading — no list, no empty
    // state, no error — and concluded there were no webhooks.
    const user = userEvent.setup();
    const refetch = vi.fn();
    setCanManage(true); // webhook:read — the sub-section renders at all
    useWebhooksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    render(<OrganizationIntegrationsPanel />);

    expect(screen.getByTestId('webhooks-error')).toBeInTheDocument();
    expect(screen.queryByTestId('webhooks-list')).not.toBeInTheDocument();
    // Crucially NOT the empty state — that would still say "No webhooks".
    expect(
      screen.queryByText(copy(SETTINGS_KEYS.panels.integrations.webhooksEmptyTitle)),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('retry-error').querySelector('button')!);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('still shows the empty state when the fetch succeeds with no webhooks', async () => {
    setCanManage(true);
    useWebhooksMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<OrganizationIntegrationsPanel />);

    expect(
      screen.getByText(copy(SETTINGS_KEYS.panels.integrations.webhooksEmptyTitle)),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('webhooks-error')).not.toBeInTheDocument();
  });

  // ── SET-26: the dialog holds itself, and owns its failure ────────────────

  it('holds Cancel and shows the server error inline while creating', async () => {
    // Regression: Cancel stayed live through the request, and a server-side
    // rejection only ever appeared as a toast — never beside the URL field.
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);

    await user.click(screen.getByTestId('webhook-add'));
    await user.type(screen.getByTestId('webhook-url'), 'https://hooks.acme.test/core');
    await user.click(screen.getByTestId('webhook-event-member.created'));
    await user.click(screen.getByTestId('webhook-create'));

    // Mid-flight: the way out is held, not live.
    expect(screen.getByTestId('webhook-cancel')).toBeDisabled();
    expect(screen.getByTestId('webhook-create')).toHaveAttribute('aria-busy', 'true');

    await act(async () => webhookCtl.settle?.(new Error('Endpoint already registered')));

    // The reason lands in the dialog, next to the field the server rejected.
    expect(screen.getByTestId('webhook-add-dialog')).toBeInTheDocument();
    // …on the shared error card — the surface the sign-in form and the step-up
    // dialog use — not as a bare red caption under the event chips.
    const inline = screen.getByTestId('webhook-error');
    expect(inline).toHaveTextContent(/already registered|went wrong/i);
    expect(inline).toHaveAttribute('role', 'alert');
    expect(inline).toHaveClass('bg-destructive/10');
    expect(inline.querySelector('svg')).not.toBeNull();
  });
});
