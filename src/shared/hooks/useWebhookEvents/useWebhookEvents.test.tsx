import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebhookEvents } from './useWebhookEvents.ts';

const { listWebhookEventCatalog } = vi.hoisted(() => ({
  listWebhookEventCatalog: vi.fn(),
}));
vi.mock('@/shared/api/webhooks-api.ts', () => ({ listWebhookEventCatalog }));

/** core-be's real catalog — note that none of these match the four names this UI hardcoded. */
const CATALOG = [
  { event: 'organization.created', description: 'When an organization is created' },
  { event: 'membership.created', description: 'When a membership is created' },
  { event: 'subscription.cancelled', description: 'When a subscription is cancelled' },
];

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
});

describe('useWebhookEvents', () => {
  it('returns the catalog core-be dispatches', async () => {
    listWebhookEventCatalog.mockResolvedValue(CATALOG);

    const { result } = renderHook(() => useWebhookEvents(), { wrapper });

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((row) => row.event)).toEqual([
      'organization.created',
      'membership.created',
      'subscription.cancelled',
    ]);
  });

  // The names this replaces were accepted by `CreateWebhookDto` (it validates `events` as a
  // bare string array) and then never dispatched — a webhook that looked fine and did
  // nothing. Pinning their absence keeps anyone from reintroducing the client-side list.
  it('does not serve the hardcoded names the old checklist offered', async () => {
    listWebhookEventCatalog.mockResolvedValue(CATALOG);

    const { result } = renderHook(() => useWebhookEvents(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    const events = result.current.rows.map((row) => row.event);
    for (const stale of [
      'member.created',
      'member.removed',
      'role.changed',
      'billing.updated',
    ]) {
      expect(events).not.toContain(stale);
    }
  });

  // An empty list on failure would read as "nothing to subscribe to" and invite saving a
  // webhook wired to no events at all.
  it('reports the failure instead of an empty catalog', async () => {
    listWebhookEventCatalog.mockRejectedValue(new Error('catalog down'));

    const { result } = renderHook(() => useWebhookEvents(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
  });

  it('exposes a refetch so the checklist can offer a retry', async () => {
    listWebhookEventCatalog.mockRejectedValueOnce(new Error('flaky'));

    const { result } = renderHook(() => useWebhookEvents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    listWebhookEventCatalog.mockResolvedValue(CATALOG);
    result.current.refetch();

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
  });
});
