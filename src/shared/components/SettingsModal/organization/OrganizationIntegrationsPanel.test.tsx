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
  updateWebhookMutate,
  testWebhookMutate,
  useWebhookEventsMock,
  useDeliveryAttemptsMock,
  webhookCtl,
} = vi.hoisted(() => ({
  createApiKeyMutate: vi.fn(),
  useApiKeysMock: vi.fn(),
  revokeMutateAsync: vi.fn(),
  useWebhooksMock: vi.fn(),
  createWebhookMutate: vi.fn(),
  deleteWebhookMutateAsync: vi.fn(),
  updateWebhookMutate: vi.fn(),
  testWebhookMutate: vi.fn(),
  useWebhookEventsMock: vi.fn(),
  useDeliveryAttemptsMock: vi.fn(),
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
vi.mock('@/shared/hooks/useWebhookEvents/index.ts', () => ({
  useWebhookEvents: useWebhookEventsMock,
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
    useUpdateWebhook: () => ({ isPending: false, mutate: updateWebhookMutate }),
    useTestWebhook: () => ({
      isPending: false,
      variables: undefined,
      mutate: testWebhookMutate,
    }),
    useWebhookDeliveryAttempts: useDeliveryAttemptsMock,
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
  // The checklist reads the real catalog now. These are core-be's actual event names — the
  // four this UI used to hardcode (`member.created`, `role.changed`, …) are not among them.
  useWebhookEventsMock.mockReturnValue({
    rows: [
      { event: 'membership.created', description: 'When a membership is created' },
      { event: 'subscription.updated', description: 'When a subscription is updated' },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  useDeliveryAttemptsMock.mockReturnValue({
    data: { rows: [], next: null, hasMore: false },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
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

  // The header must describe what is on screen. Integrations is an Account section,
  // so a personal workspace reaches it — and there the webhooks half is hidden, which
  // made "API keys and webhooks." a promise the panel could not keep.
  it('says "API keys" alone in a personal workspace, where webhooks are hidden', () => {
    useAuthStore.setState({
      user: { id: 'u', email: 'a@b.test', role: 'user' },
      isAuthenticated: true,
    });
    useOrganizationStore.setState({
      organizationType: 'PERSONAL',
      // A personal owner holds `api-key:*` but no notify codes.
      permissions: ['api-key:read', 'api-key:manage'],
      permissionsResolved: true,
    });
    render(<OrganizationIntegrationsPanel />);
    const keys = SETTINGS_KEYS.panels.integrations;
    expect(screen.getByText(copy(keys.descriptionApiKeysOnly))).toBeInTheDocument();
    expect(screen.queryByText(copy(keys.description))).not.toBeInTheDocument();
  });

  it('mentions webhooks when the webhooks half is actually shown', () => {
    setCanManage(true);
    render(<OrganizationIntegrationsPanel />);
    const keys = SETTINGS_KEYS.panels.integrations;
    expect(screen.getByText(copy(keys.description))).toBeInTheDocument();
    expect(screen.queryByText(copy(keys.descriptionApiKeysOnly))).not.toBeInTheDocument();
  });

  it('creates a webhook with a URL + selected event', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-add'));
    await user.type(await screen.findByTestId('webhook-url'), 'https://new.test/hook');
    await user.click(screen.getByTestId('webhook-event-membership.created'));
    await user.click(screen.getByTestId('webhook-save'));
    expect(createWebhookMutate).toHaveBeenCalledWith(
      { url: 'https://new.test/hook', events: ['membership.created'] },
      expect.anything(),
    );
  });

  // ── Edit / test / history: the three routes this panel never called ──────

  it('opens the edit form prefilled with the row being edited', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-edit-whk_1'));
    expect(await screen.findByTestId('webhook-url')).toHaveValue('https://x.test/hook');
  });

  it('saves an edit as a PATCH for that webhook id', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-edit-whk_1'));
    const url = await screen.findByTestId('webhook-url');
    await user.clear(url);
    await user.type(url, 'https://moved.test/hook');
    await user.click(screen.getByTestId('webhook-save'));
    expect(updateWebhookMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'whk_1',
        input: expect.objectContaining({ url: 'https://moved.test/hook' }),
      }),
      expect.anything(),
    );
    // Never a secret: core-be keeps the existing signing key only while the field is absent,
    // so sending one here would silently break the receiver's signature check.
    const [vars] = updateWebhookMutate.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(vars.input).not.toHaveProperty('secret');
  });

  // Reopening after a cancelled edit must not show the abandoned draft — the dialog is
  // remounted per open rather than re-seeded by an effect.
  it('re-seeds the form when it is reopened after a cancelled edit', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-edit-whk_1'));
    const first = await screen.findByTestId('webhook-url');
    await user.clear(first);
    await user.type(first, 'https://abandoned.test/hook');
    await user.click(screen.getByTestId('webhook-cancel'));

    await user.click(screen.getByTestId('webhook-edit-whk_1'));
    expect(await screen.findByTestId('webhook-url')).toHaveValue('https://x.test/hook');
  });

  it('fires a test delivery for the row', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-test-whk_1'));
    expect(testWebhookMutate).toHaveBeenCalledWith('whk_1', expect.anything());
  });

  // A refused delivery resolves — core-be answers `success: false` with the status it got.
  // Reporting that as "sent" would hide the breakage the button exists to reveal.
  it('reports a refused test delivery as a failure, not a success', async () => {
    setCanManage(true);
    testWebhookMutate.mockImplementation(
      (_id: string, options?: { onSuccess?: (result: unknown) => void }) => {
        options?.onSuccess?.({
          success: false,
          statusCode: 500,
          deliveredAt: '2026-01-01T00:00:00.000Z',
          responseBody: 'boom',
        });
      },
    );
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-test-whk_1'));
    const result = await screen.findByTestId('webhook-test-result-whk_1');
    expect(result).toHaveTextContent('500');
    expect(result).toHaveTextContent(/failed/i);
  });

  it('distinguishes an unreachable endpoint from one that answered', async () => {
    setCanManage(true);
    testWebhookMutate.mockImplementation(
      (_id: string, options?: { onSuccess?: (result: unknown) => void }) => {
        options?.onSuccess?.({
          success: false,
          statusCode: null,
          deliveredAt: '2026-01-01T00:00:00.000Z',
          responseBody: 'getaddrinfo ENOTFOUND',
        });
      },
    );
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-test-whk_1'));
    expect(await screen.findByTestId('webhook-test-result-whk_1')).toHaveTextContent(
      copy(SETTINGS_KEYS.panels.integrations.testNoStatus),
    );
  });

  it('opens the delivery history for the row', async () => {
    setCanManage(true);
    const user = userEvent.setup();
    render(<OrganizationIntegrationsPanel />);
    await user.click(screen.getByTestId('webhook-history-whk_1'));
    expect(await screen.findByTestId('webhook-attempts-dialog')).toBeInTheDocument();
  });

  // History is `webhook:read`, which everyone who can see this list already holds; the
  // write controls are `webhook:manage`. A read-only caller still gets the diagnosis.
  it('keeps delivery history reachable without webhook:manage', () => {
    // Not `setCanManage(false)` — that switches to a PERSONAL org, which hides the whole
    // team-only section. The case under test is a TEAM caller who can read but not manage.
    useAuthStore.setState({
      user: { id: 'u', email: 'a@b.test', role: 'user' },
      isAuthenticated: true,
    });
    useOrganizationStore.setState({
      organizationType: 'TEAM',
      permissions: ['webhook:read'],
      permissionsResolved: true,
    });
    render(<OrganizationIntegrationsPanel />);
    expect(screen.getByTestId('webhook-history-whk_1')).toBeInTheDocument();
    expect(screen.queryByTestId('webhook-test-whk_1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webhook-edit-whk_1')).not.toBeInTheDocument();
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
    await user.click(screen.getByTestId('webhook-event-membership.created'));
    await user.click(screen.getByTestId('webhook-save'));

    // Mid-flight: the way out is held, not live.
    expect(screen.getByTestId('webhook-cancel')).toBeDisabled();
    expect(screen.getByTestId('webhook-save')).toHaveAttribute('aria-busy', 'true');

    await act(async () => webhookCtl.settle?.(new Error('Endpoint already registered')));

    // The reason lands in the dialog, next to the field the server rejected.
    expect(screen.getByTestId('webhook-form-dialog')).toBeInTheDocument();
    // …on the shared error card — the surface the sign-in form and the step-up
    // dialog use — not as a bare red caption under the event chips.
    const inline = screen.getByTestId('webhook-error');
    expect(inline).toHaveTextContent(/already registered|went wrong/i);
    expect(inline).toHaveAttribute('role', 'alert');
    expect(inline).toHaveClass('bg-destructive/10');
    expect(inline.querySelector('svg')).not.toBeNull();
  });
});
