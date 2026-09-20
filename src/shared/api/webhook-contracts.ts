import { z } from 'zod';

import { isoDateString, publicId } from '@/core/types/wire.ts';

/**
 * Outbound webhook contracts (core-be `/notify/webhooks`) for the Integrations
 * panel. Create body is `{ url, events[], secret?, is_enabled? }` (no
 * description); the secret is write-only (never returned). Mirrors the
 * established wire→domain mapper pattern.
 */
export const WEBHOOK_EVENTS = [
  'member.created',
  'member.removed',
  'role.changed',
  'billing.updated',
] as const;

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

/** New-webhook input (the URL + which events to deliver). */
export const createWebhookSchema = z.object({
  url: z.url('Enter a valid https URL'),
  events: z.array(z.string()).min(1, 'Choose at least one event'),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
