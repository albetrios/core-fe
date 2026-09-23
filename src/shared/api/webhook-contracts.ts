import { z } from 'zod';

import { isoDateString, publicId } from '@/core/types/wire.ts';

/**
 * Outbound webhook contracts (core-be `/notify/webhooks`) for the Integrations
 * panel. Create body is `{ url, events[], secret?, is_enabled? }` (no
 * description); the secret is write-only (never returned). Mirrors the
 * established wire→domain mapper pattern.
 */
export type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

export const webhookWireSchema = z.object({
  id: publicId('whk'),
  url: z.string(),
  events: z.array(z.string()),
  // core-be uses `is_enabled`; tolerate `active` from older shapes.
  is_enabled: z.boolean().optional(),
  active: z.boolean().optional(),
  created_at: isoDateString,
});
export type WebhookWire = z.infer<typeof webhookWireSchema>;

export function toWebhook(wire: WebhookWire): Webhook {
  return {
    id: wire.id,
    url: wire.url,
    events: wire.events,
    active: wire.is_enabled ?? wire.active ?? true,
    createdAt: wire.created_at,
  };
}

/**
 * core-be's `httpsUrl` validator rejects any scheme but `https://` and caps the URL at
 * 2 KB. Mirroring both here turns a round-trip 400 into an inline message on the field.
 */
const webhookUrl = z
  .string()
  .trim()
  .pipe(
    z
      .url('Enter a valid https URL')
      .max(2048, 'That URL is too long')
      .refine((value) => value.startsWith('https://'), {
        message: 'Webhook URL must use HTTPS',
      }),
  );

/** New-webhook input (the URL + which events to deliver). */
export const createWebhookSchema = z.object({
  url: webhookUrl,
  events: z.array(z.string()).min(1, 'Choose at least one event'),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

/**
 * Edit input for `PATCH /notify/webhooks/:id`.
 *
 * @remarks
 * core-be's `UpdateWebhookDto` makes every field optional so a caller can change the URL,
 * the events or the enabled flag independently — and, critically, **omitting `secret` leaves
 * the existing secret untouched**. This form never sends one, so editing a webhook cannot
 * silently rotate the signing key out from under the receiver.
 */
export const updateWebhookSchema = z.object({
  url: webhookUrl,
  events: z.array(z.string()).min(1, 'Choose at least one event'),
});
/** Validated edit input — the replacement URL and event list, nothing else. */
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

/**
 * One entry of the dispatchable-event catalog (`GET /notify/webhook-events`).
 *
 * @remarks
 * This replaces a hardcoded four-name list that shared **no** values with the catalog
 * core-be actually dispatches. Since `CreateWebhookDto` validates `events` only as
 * `array(string)` — never against the catalog — those names were accepted on create and
 * then never fired. Sourcing the checklist from the API is what makes a new webhook
 * subscribe to something real.
 */
export const webhookEventCatalogWireSchema = z.object({
  event: z.string(),
  description: z.string(),
});
/** One `{ event, description }` entry as the catalog route returns it. */
export type WebhookEventCatalogEntry = z.infer<typeof webhookEventCatalogWireSchema>;

/** One row of a webhook's delivery history. */
export type WebhookDeliveryAttempt = {
  eventType: string;
  eventKey: string | null;
  /**
   * Delivery outcome as core-be records it on
   * `notify.webhook_delivery_attempts.status`. Known values: `PENDING`, `SENT`,
   * `FAILED`.
   *
   * Typed `string`, not that union: an unrecognised status must still round-trip
   * rather than fail to parse, and a `| string` member collapses the union to
   * `string` anyway — so the literals constrained nothing while reading as though
   * they did. They belong in this doc, where they inform without misleading.
   */
  status: string;
  httpStatusCode: number | null;
  sentAt: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  createdAt: string;
};

/**
 * Wire row for `GET /notify/webhooks/:id/delivery-attempts`.
 *
 * @remarks
 * The list projection deliberately omits `id`, `payload` and `response_body` (sec-r4-D6 /
 * sec-T #17), so there is no server-side row identifier to key a list on — callers compose
 * one from the row's own fields.
 */
export const webhookDeliveryAttemptWireSchema = z.object({
  event_type: z.string(),
  event_key: z.string().nullable().optional(),
  status: z.string(),
  http_status_code: z.number().nullable().optional(),
  sent_at: z.string().nullable().optional(),
  attempt_count: z.number(),
  next_retry_at: z.string().nullable().optional(),
  created_at: isoDateString,
});
/** One delivery-attempt row in its snake_case wire form. */
export type WebhookDeliveryAttemptWire = z.infer<typeof webhookDeliveryAttemptWireSchema>;

/** Map one delivery-attempt wire row into its camelCase domain shape. */
export function toWebhookDeliveryAttempt(
  wire: WebhookDeliveryAttemptWire,
): WebhookDeliveryAttempt {
  return {
    eventType: wire.event_type,
    eventKey: wire.event_key ?? null,
    status: wire.status,
    httpStatusCode: wire.http_status_code ?? null,
    sentAt: wire.sent_at ?? null,
    attemptCount: wire.attempt_count,
    nextRetryAt: wire.next_retry_at ?? null,
    createdAt: wire.created_at,
  };
}

/** What a test delivery reports back. */
export type WebhookTestResult = {
  success: boolean;
  statusCode: number | null;
  deliveredAt: string;
  responseBody: string | null;
};

/**
 * Wire shape for `POST /notify/webhooks/:id/test`.
 *
 * @remarks
 * A test that reaches the endpoint and gets a non-2xx answer still resolves — `success` is
 * `false` with the status code attached, not an HTTP error. A transport failure (DNS, TLS,
 * timeout) also resolves, with `status_code: null` and the error text in `response_body`.
 * So the caller must read `success`, never merely "the request did not throw".
 */
export const webhookTestResultWireSchema = z.object({
  success: z.boolean(),
  status_code: z.number().nullable().optional(),
  delivered_at: z.string(),
  response_body: z.string().nullable().optional(),
});
/** The test-delivery outcome in its snake_case wire form. */
export type WebhookTestResultWire = z.infer<typeof webhookTestResultWireSchema>;

/** Map the test-delivery wire result into its camelCase domain shape. */
export function toWebhookTestResult(wire: WebhookTestResultWire): WebhookTestResult {
  return {
    success: wire.success,
    statusCode: wire.status_code ?? null,
    deliveredAt: wire.delivered_at,
    responseBody: wire.response_body ?? null,
  };
}
