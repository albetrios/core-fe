import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';

import { fetchAllPages } from './fetch-all-pages.ts';
import { fetchListPage, type ListPage } from './fetch-list-page.ts';
import {
  type CreateWebhookInput,
  toWebhook,
  toWebhookDeliveryAttempt,
  toWebhookTestResult,
  type UpdateWebhookInput,
  type Webhook,
  type WebhookDeliveryAttempt,
  webhookDeliveryAttemptWireSchema,
  type WebhookEventCatalogEntry,
  webhookEventCatalogWireSchema,
  type WebhookTestResult,
  webhookTestResultWireSchema,
  webhookWireSchema,
} from './webhook-contracts.ts';

const WEBHOOKS_API = `${API_BASE_PATH}/notify/webhooks`;
const WEBHOOK_EVENTS_API = `${API_BASE_PATH}/notify/webhook-events`;

export async function listWebhooks(): Promise<Webhook[]> {
  return (await fetchAllPages(WEBHOOKS_API, webhookWireSchema, 'webhooks')).map(
    toWebhook,
  );
}

export async function createWebhook(input: CreateWebhookInput): Promise<Webhook> {
  const res = await apiClient.post<unknown>(WEBHOOKS_API, input);
  return toWebhook(webhookWireSchema.parse(res.data));
}

/**
 * Change a webhook's URL and/or subscribed events.
 *
 * @remarks
 * Sends only `url` and `events`. `secret` is deliberately omitted — core-be leaves the
 * existing signing secret in place when the field is absent, so editing a webhook can never
 * rotate the key out from under the receiver. `is_enabled` is likewise untouched.
 *
 * @param id - Public id (`whk_…`) of the webhook to change.
 * @param input - The replacement URL and event list.
 * @returns The webhook as the server now holds it.
 *
 * @example
 * await updateWebhook('whk_abc', { url: 'https://x.test/hook', events: ['membership.created'] });
 */
export async function updateWebhook(
  id: string,
  input: UpdateWebhookInput,
): Promise<Webhook> {
  const res = await apiClient.patch<unknown>(`${WEBHOOKS_API}/${id}`, {
    url: input.url,
    events: input.events,
  });
  return toWebhook(webhookWireSchema.parse(res.data));
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiClient.delete<unknown>(`${WEBHOOKS_API}/${id}`);
}

/**
 * Fire a signed test delivery at a webhook's URL and report what came back.
 *
 * @remarks
 * Resolves for every outcome the endpoint produces, including a refusal: a non-2xx answer
 * comes back as `success: false` with the status code, and a transport failure as
 * `success: false` with a null status code and the error text in `responseBody`. Callers
 * must branch on `success` rather than treating a resolved promise as a delivered event.
 * core-be also records the attempt in the delivery history, so a test shows up there too.
 *
 * @param id - Public id (`whk_…`) of the webhook to test.
 * @returns The delivery outcome.
 */
export async function testWebhook(id: string): Promise<WebhookTestResult> {
  const res = await apiClient.post<unknown>(`${WEBHOOKS_API}/${id}/test`, {});
  return toWebhookTestResult(webhookTestResultWireSchema.parse(res.data));
}

/**
 * One page of a webhook's delivery history, newest page first per the server's cursor.
 *
 * @remarks
 * Deliberately a single page rather than `fetchAllPages`: delivery history grows without
 * bound on a busy webhook, and the panel only ever shows the most recent attempts. Rows are
 * parsed tolerantly, so one malformed row does not empty the list.
 *
 * @param id - Public id (`whk_…`) of the webhook.
 * @param options - Page size and forward cursor.
 * @returns The page of attempts plus its forward cursor.
 */
export async function listWebhookDeliveryAttempts(
  id: string,
  options: { limit?: number; after?: string } = {},
): Promise<ListPage<WebhookDeliveryAttempt>> {
  const page = await fetchListPage(
    `${WEBHOOKS_API}/${id}/delivery-attempts`,
    webhookDeliveryAttemptWireSchema,
    'webhook-delivery-attempts',
    { limit: options.limit ?? 25, after: options.after },
  );
  return { ...page, rows: page.rows.map(toWebhookDeliveryAttempt) };
}

/**
 * The catalog of event types core-be can dispatch (`GET /notify/webhook-events`).
 *
 * @remarks
 * Reference data, not org-scoped: the same list for every tenant. It is the only honest
 * source for the subscribe checklist, because `CreateWebhookDto` accepts any string — a
 * client-side list that drifts produces webhooks that are created successfully and then
 * never fire.
 *
 * @returns Every dispatchable event with its human description.
 */
export async function listWebhookEventCatalog(): Promise<WebhookEventCatalogEntry[]> {
  const res = await apiClient.get<unknown>(WEBHOOK_EVENTS_API);
  return webhookEventCatalogWireSchema.array().parse(res.data);
}
