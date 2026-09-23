import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookDeliveryAttemptsDialog } from './WebhookDeliveryAttemptsDialog.tsx';

const { useDeliveryAttemptsMock } = vi.hoisted(() => ({
  useDeliveryAttemptsMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useWebhooks/index.ts', () => ({
  useWebhookDeliveryAttempts: useDeliveryAttemptsMock,
}));

const SENT = {
  eventType: 'membership.created',
  eventKey: 'mem_1',
  status: 'SENT',
  httpStatusCode: 200,
  sentAt: '2026-06-01T10:00:00.000Z',
  attemptCount: 1,
  nextRetryAt: null,
  createdAt: '2026-06-01T10:00:00.000Z',
};

const FAILED = {
  ...SENT,
  eventType: 'subscription.updated',
  status: 'FAILED',
  httpStatusCode: 500,
  attemptCount: 3,
  nextRetryAt: '2026-06-01T10:05:00.000Z',
};

function attempts(overrides: Record<string, unknown> = {}) {
  return {
    data: { rows: [SENT, FAILED], next: null, hasMore: false },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDeliveryAttemptsMock.mockReturnValue(attempts());
});

describe('WebhookDeliveryAttemptsDialog', () => {
  it('lists each attempt with its event, status and code', () => {
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );

    const list = screen.getByTestId('webhook-attempts-list');
    expect(list).toHaveTextContent('membership.created');
    expect(list).toHaveTextContent('SENT');
    expect(list).toHaveTextContent('200');
    expect(list).toHaveTextContent('subscription.updated');
    expect(list).toHaveTextContent('FAILED');
    expect(list).toHaveTextContent('500');
  });

  it('names the endpoint the history belongs to', () => {
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('https://x.test/hook')).toBeInTheDocument();
  });

  // The list projection returns no row id (sec-r4-D6 / sec-T #17), so two attempts of the
  // same event must still render as two rows rather than collapsing on a duplicate key.
  it('renders repeated attempts of the same event as separate rows', () => {
    useDeliveryAttemptsMock.mockReturnValue(
      attempts({
        data: {
          rows: [SENT, { ...SENT, attemptCount: 2 }, { ...SENT, attemptCount: 3 }],
          next: null,
          hasMore: false,
        },
      }),
    );
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('webhook-attempts-list').children).toHaveLength(3);
  });

  it('shows a skeleton while loading', () => {
    useDeliveryAttemptsMock.mockReturnValue(
      attempts({ isLoading: true, data: undefined }),
    );
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('webhook-attempts-loading')).toBeInTheDocument();
  });

  // A failed fetch must not read as "this webhook has never delivered" — the empty state
  // would point the operator at the wrong problem entirely.
  it('offers a retry on failure instead of the empty state', () => {
    useDeliveryAttemptsMock.mockReturnValue(attempts({ isError: true, data: undefined }));
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('webhook-attempts-error')).toBeInTheDocument();
    expect(screen.queryByTestId('webhook-attempts-list')).not.toBeInTheDocument();
  });

  it('shows an empty state when the webhook has never delivered', () => {
    useDeliveryAttemptsMock.mockReturnValue(
      attempts({ data: { rows: [], next: null, hasMore: false } }),
    );
    render(
      <WebhookDeliveryAttemptsDialog
        webhookId="whk_1"
        webhookUrl="https://x.test/hook"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('webhook-attempts-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('webhook-attempts-close')).toBeInTheDocument();
  });

  it('stays closed when no webhook is selected', () => {
    render(
      <WebhookDeliveryAttemptsDialog webhookId={null} webhookUrl="" onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('webhook-attempts-dialog')).not.toBeInTheDocument();
  });
});
