import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, postMock, patchMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: getMock, post: postMock, patch: patchMock, delete: deleteMock },
}));

import {
  createWebhook,
  deleteWebhook,
  listWebhookDeliveryAttempts,
  listWebhookEventCatalog,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from './webhooks-api.ts';

const WIRE = {
  id: `whk_${'0'.repeat(20)}1`,
  url: 'https://x.test/hook',
  events: ['member.created'],
  is_enabled: true,
  created_at: '2026-06-01T00:00:00.000Z',
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

describe('webhooks-api', () => {
  it('lists and maps wire → domain', async () => {
    getMock.mockResolvedValue({ data: [WIRE] });
    const res = await listWebhooks();
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/notify/webhooks'));
    expect(res).toEqual([
      {
        id: WIRE.id,
        url: 'https://x.test/hook',
        events: ['member.created'],
        active: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
  });

  it('creates via POST', async () => {
    postMock.mockResolvedValue({ data: WIRE });
    await createWebhook({ url: 'https://x.test/hook', events: ['member.created'] });
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/notify/webhooks'), {
      url: 'https://x.test/hook',
      events: ['member.created'],
    });
  });

  it('deletes via DELETE', async () => {
    deleteMock.mockResolvedValue({ data: null });
    await deleteWebhook(WIRE.id);
    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining(`/webhooks/${WIRE.id}`),
    );
  });
});

describe('updateWebhook', () => {
  it('PATCHes url + events to the webhook id', async () => {
    patchMock.mockResolvedValue({ data: { ...WIRE, url: 'https://moved.test/hook' } });

    const result = await updateWebhook(WIRE.id, {
      url: 'https://moved.test/hook',
      events: ['membership.created'],
    });

    expect(patchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/webhooks/${WIRE.id}`),
      {
        url: 'https://moved.test/hook',
        events: ['membership.created'],
      },
    );
    expect(result.url).toBe('https://moved.test/hook');
  });

  // core-be keeps the existing signing secret only while the field is ABSENT. Sending one —
  // even an empty string — rotates the key and breaks the receiver's signature check.
  it('never sends a secret, so an edit cannot rotate the signing key', async () => {
    patchMock.mockResolvedValue({ data: WIRE });
    await updateWebhook(WIRE.id, { url: 'https://x.test/hook', events: ['a'] });
    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('secret');
    expect(body).not.toHaveProperty('is_enabled');
  });
});

describe('testWebhook', () => {
  it('maps a delivered test', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        status_code: 200,
        delivered_at: '2026-06-01T00:00:00.000Z',
        response_body: 'ok',
      },
    });

    const result = await testWebhook(WIRE.id);

    expect(postMock).toHaveBeenCalledWith(
      expect.stringContaining(`/webhooks/${WIRE.id}/test`),
      {},
    );
    expect(result).toEqual({
      success: true,
      statusCode: 200,
      deliveredAt: '2026-06-01T00:00:00.000Z',
      responseBody: 'ok',
    });
  });

  // The endpoint answering 500 is a RESOLVED call with success:false — not a thrown error.
  // A caller that treats "did not throw" as "delivered" would report the opposite of reality.
  it('resolves with success:false when the endpoint refuses', async () => {
    postMock.mockResolvedValue({
      data: {
        success: false,
        status_code: 500,
        delivered_at: '2026-06-01T00:00:00.000Z',
        response_body: 'boom',
      },
    });

    await expect(testWebhook(WIRE.id)).resolves.toMatchObject({
      success: false,
      statusCode: 500,
    });
  });

  it('maps an unreachable endpoint to a null status code', async () => {
    postMock.mockResolvedValue({
      data: {
        success: false,
        status_code: null,
        delivered_at: '2026-06-01T00:00:00.000Z',
        response_body: 'ENOTFOUND',
      },
    });

    await expect(testWebhook(WIRE.id)).resolves.toMatchObject({
      success: false,
      statusCode: null,
    });
  });
});

describe('listWebhookDeliveryAttempts', () => {
  const ATTEMPT = {
    event_type: 'membership.created',
    event_key: 'mem_1',
    status: 'FAILED',
    http_status_code: 500,
    sent_at: '2026-06-01T00:00:00.000Z',
    attempt_count: 3,
    next_retry_at: '2026-06-01T00:05:00.000Z',
    created_at: '2026-06-01T00:00:00.000Z',
  };

  it('fetches ONE page and maps wire → domain', async () => {
    getMock.mockResolvedValue({
      data: [ATTEMPT],
      meta: { pagination: { next: 'cursor', has_more: true } },
    });

    const page = await listWebhookDeliveryAttempts(WIRE.id);

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0]?.[0]).toContain(
      `/webhooks/${WIRE.id}/delivery-attempts`,
    );
    expect(page.rows[0]).toEqual({
      eventType: 'membership.created',
      eventKey: 'mem_1',
      status: 'FAILED',
      httpStatusCode: 500,
      sentAt: '2026-06-01T00:00:00.000Z',
      attemptCount: 3,
      nextRetryAt: '2026-06-01T00:05:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
  });

  // A pending attempt has no status code and was never sent; those nulls must survive the
  // mapper rather than becoming undefined and rendering as blanks with no meaning.
  it('keeps the nulls on an attempt that has not been sent', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          ...ATTEMPT,
          status: 'PENDING',
          http_status_code: null,
          sent_at: null,
          next_retry_at: null,
        },
      ],
      meta: { pagination: { next: null, has_more: false } },
    });

    const page = await listWebhookDeliveryAttempts(WIRE.id);

    expect(page.rows[0]).toMatchObject({
      status: 'PENDING',
      httpStatusCode: null,
      sentAt: null,
      nextRetryAt: null,
    });
  });
});

describe('listWebhookEventCatalog', () => {
  it('returns the catalog core-be dispatches', async () => {
    getMock.mockResolvedValue({
      data: [
        { event: 'membership.created', description: 'When a membership is created' },
        {
          event: 'subscription.cancelled',
          description: 'When a subscription is cancelled',
        },
      ],
    });

    const rows = await listWebhookEventCatalog();

    expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining('/notify/webhook-events'),
    );
    expect(rows.map((row) => row.event)).toEqual([
      'membership.created',
      'subscription.cancelled',
    ]);
  });
});
