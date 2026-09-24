import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookFormDialog } from './WebhookFormDialog.tsx';

const { createMutate, updateMutate, useWebhookEventsMock } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  useWebhookEventsMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useWebhooks/index.ts', () => ({
  useCreateWebhook: () => ({ isPending: false, mutate: createMutate }),
  useUpdateWebhook: () => ({ isPending: false, mutate: updateMutate }),
}));
vi.mock('@/shared/hooks/useWebhookEvents/index.ts', () => ({
  useWebhookEvents: useWebhookEventsMock,
}));

const WEBHOOK = {
  id: 'whk_1',
  url: 'https://x.test/hook',
  events: ['membership.created'],
  active: true,
  createdAt: '2026-06-01T00:00:00.000Z',
};

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      { event: 'membership.created', description: 'When a membership is created' },
      { event: 'subscription.updated', description: 'When a subscription is updated' },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  useWebhookEventsMock.mockReturnValue(catalog());
});

describe('WebhookFormDialog — create', () => {
  it('offers the catalog from the API, not a hardcoded list', () => {
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);
    expect(screen.getByTestId('webhook-event-membership.created')).toBeInTheDocument();
    expect(screen.getByTestId('webhook-event-subscription.updated')).toBeInTheDocument();
    // The name the old client-side list offered and core-be never dispatches.
    expect(screen.queryByTestId('webhook-event-member.created')).not.toBeInTheDocument();
  });

  it('submits the chosen url and events', async () => {
    const user = userEvent.setup();
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);

    await user.type(screen.getByTestId('webhook-url'), 'https://new.test/hook');
    await user.click(screen.getByTestId('webhook-event-membership.created'));
    await user.click(screen.getByTestId('webhook-save'));

    expect(createMutate).toHaveBeenCalledWith(
      { url: 'https://new.test/hook', events: ['membership.created'] },
      expect.anything(),
    );
  });

  // core-be's `httpsUrl` rejects any other scheme. Catching it here turns a round-trip 400
  // into a message on the field.
  it('refuses a non-HTTPS URL before it reaches the API', async () => {
    const user = userEvent.setup();
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);

    await user.type(screen.getByTestId('webhook-url'), 'http://insecure.test/hook');
    await user.click(screen.getByTestId('webhook-event-membership.created'));
    await user.click(screen.getByTestId('webhook-save'));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('webhook-error')).toHaveTextContent(/https/i);
  });

  it('requires at least one event', async () => {
    const user = userEvent.setup();
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);

    await user.type(screen.getByTestId('webhook-url'), 'https://new.test/hook');
    await user.click(screen.getByTestId('webhook-save'));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('webhook-error')).toBeInTheDocument();
  });
});

describe('WebhookFormDialog — edit', () => {
  it('prefills from the webhook being edited', () => {
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={WEBHOOK} />);
    expect(screen.getByTestId('webhook-url')).toHaveValue('https://x.test/hook');
    expect(screen.getByTestId('webhook-event-membership.created')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('webhook-event-subscription.updated')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('updates through the id it was given', async () => {
    const user = userEvent.setup();
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={WEBHOOK} />);

    await user.click(screen.getByTestId('webhook-event-subscription.updated'));
    await user.click(screen.getByTestId('webhook-save'));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'whk_1',
        input: {
          url: 'https://x.test/hook',
          events: ['membership.created', 'subscription.updated'],
        },
      },
      expect.anything(),
    );
    expect(createMutate).not.toHaveBeenCalled();
  });
});

describe('WebhookFormDialog — catalog states', () => {
  it('shows a skeleton while the catalog loads', () => {
    useWebhookEventsMock.mockReturnValue(catalog({ isPending: true, rows: [] }));
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);
    expect(screen.getByTestId('webhook-events-loading')).toBeInTheDocument();
  });

  // A failed catalog must never read as "no events exist" — that invites saving a webhook
  // subscribed to nothing, which is exactly the silent-no-op this work removes.
  it('offers a retry when the catalog fails, rather than an empty checklist', () => {
    useWebhookEventsMock.mockReturnValue(catalog({ isError: true, rows: [] }));
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);
    expect(screen.getByTestId('webhook-events-error')).toBeInTheDocument();
    expect(screen.queryByTestId('webhook-events-empty')).not.toBeInTheDocument();
  });

  it('says so plainly when the catalog is genuinely empty', () => {
    useWebhookEventsMock.mockReturnValue(catalog({ rows: [] }));
    render(<WebhookFormDialog open onOpenChange={vi.fn()} webhook={null} />);
    expect(screen.getByTestId('webhook-events-empty')).toBeInTheDocument();
  });
});
