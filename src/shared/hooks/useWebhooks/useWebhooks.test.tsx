import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useUpdateWebhook,
  useWebhookDeliveryAttempts,
  useWebhooks,
} from './useWebhooks.ts';

const { listMock, createMock, deleteMock, updateMock, testMock, attemptsMock } = vi.hoisted(
  () => ({
    listMock: vi.fn(),
    createMock: vi.fn(),
    deleteMock: vi.fn(),
    updateMock: vi.fn(),
    testMock: vi.fn(),
    attemptsMock: vi.fn(),
  }),
);
vi.mock('@/shared/api/webhooks-api.ts', () => ({
  listWebhooks: listMock,
  createWebhook: createMock,
  deleteWebhook: deleteMock,
  updateWebhook: updateMock,
  testWebhook: testMock,
  listWebhookDeliveryAttempts: attemptsMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const WEBHOOK = {
  id: 'whk_1',
  url: 'https://x.test/hook',
  events: ['member.created'],
  active: true,
  createdAt: '2026-06-01T00:00:00.000Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue([WEBHOOK]);
  createMock.mockResolvedValue(WEBHOOK);
  deleteMock.mockResolvedValue(undefined);
  updateMock.mockResolvedValue(WEBHOOK);
  testMock.mockResolvedValue({
    success: true,
    statusCode: 200,
    deliveredAt: '2026-06-01T00:00:00.000Z',
    responseBody: 'ok',
  });
  attemptsMock.mockResolvedValue({ rows: [], next: null, hasMore: false });
});

describe('useWebhooks', () => {
  it('loads the webhook list', async () => {
    const { result } = renderHook(() => useWebhooks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([WEBHOOK]);
  });

  it('creates a webhook', async () => {
    const { result } = renderHook(() => useCreateWebhook(), { wrapper });
    result.current.mutate({ url: 'https://x.test/hook', events: ['member.created'] });
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        url: 'https://x.test/hook',
        events: ['member.created'],
      }),
    );
  });

  it('deletes a webhook', async () => {
    const { result } = renderHook(() => useDeleteWebhook(), { wrapper });
    result.current.mutate('whk_1');
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('whk_1'));
  });
});

describe('useUpdateWebhook', () => {
  it('sends the id and the replacement fields to the API', async () => {
    const { result } = renderHook(() => useUpdateWebhook(), { wrapper });

    result.current.mutate({
      id: 'whk_1',
      input: { url: 'https://moved.test/hook', events: ['membership.created'] },
    });

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('whk_1', {
        url: 'https://moved.test/hook',
        events: ['membership.created'],
      }),
    );
  });

  it('surfaces a rejected update rather than reporting success', async () => {
    updateMock.mockRejectedValue(new Error('url already registered'));
    const { result } = renderHook(() => useUpdateWebhook(), { wrapper });

    result.current.mutate({
      id: 'whk_1',
      input: { url: 'https://x.test/hook', events: ['membership.created'] },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useTestWebhook', () => {
  it('fires a test for the given webhook', async () => {
    const { result } = renderHook(() => useTestWebhook(), { wrapper });
    result.current.mutate('whk_1');
    await waitFor(() => expect(testMock).toHaveBeenCalledWith('whk_1'));
  });

  // A refusal is a RESOLVED mutation carrying `success: false`. The hook must hand that
  // outcome back intact rather than treating the resolved promise as a delivery.
  it('resolves a refused delivery instead of erroring', async () => {
    testMock.mockResolvedValue({
      success: false,
      statusCode: 500,
      deliveredAt: '2026-06-01T00:00:00.000Z',
      responseBody: 'boom',
    });
    const { result } = renderHook(() => useTestWebhook(), { wrapper });

    result.current.mutate('whk_1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ success: false, statusCode: 500 });
    expect(result.current.isError).toBe(false);
  });

  it('reports a mutation that genuinely failed', async () => {
    testMock.mockRejectedValue(new Error('rate limited'));
    const { result } = renderHook(() => useTestWebhook(), { wrapper });

    result.current.mutate('whk_1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useWebhookDeliveryAttempts', () => {
  it('loads the history for the chosen webhook', async () => {
    const { result } = renderHook(() => useWebhookDeliveryAttempts('whk_1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(attemptsMock).toHaveBeenCalledWith('whk_1');
  });

  // The dialog renders with `null` before a row is chosen; firing a request for a webhook
  // that does not exist would 404 on every mount of the integrations panel.
  it('does not fetch until a webhook is chosen', async () => {
    const { result } = renderHook(() => useWebhookDeliveryAttempts(null), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(attemptsMock).not.toHaveBeenCalled();
  });
});
