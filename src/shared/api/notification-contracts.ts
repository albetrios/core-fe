import { z } from 'zod';

import { isoDateString, publicId } from '@/core/types/wire.ts';

/**
 * Notification domain contracts (core-be `/notify/notifications` +
 * `/users/me/notification-preferences`).
 *
 * core-be keys everything by a **canonical dotted `type`** (e.g.
 * `billing.payment_failed` — enum-validated at the edge since #964). The UI
 * models a coarser 4-**category** view (bell glyph + the preferences grid), so
 * this module owns the two-way mapping: wire `type` → UI `category` on read,
 * category → its member types on preference writes.
 */
/** @public Shared with tests/fixtures/notification-fixtures.ts outside Knip's source project. */
export const notificationCategorySchema = z.enum([
  'system',
  'member',
  'billing',
  'security',
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/**
 * Canonical core-be notification types per UI category — mirror of core-be's
 * `NOTIFICATION_TYPES` (`shared/constants/notification.constants.ts`), grouped.
 * A preference toggle for a category fans out to ALL its types; keep in sync
 * when core-be grows the vocabulary.
 */
const NOTIFICATION_TYPES_BY_CATEGORY: Record<NotificationCategory, readonly string[]> = {
  system: ['system.welcome', 'system.maintenance', 'webhook.delivery_failed'],
  member: ['membership.invite_accepted'],
  billing: [
    'billing.usage_threshold',
    'billing.payment_succeeded',
    'billing.payment_failed',
    'subscription.updated',
  ],
  security: ['security.alert'],
};

/**
 * UI category for a canonical dotted type. Exact table match first, then a
 * prefix fallback so a NEW backend type (e.g. `billing.refund_issued`) lands in
 * a sensible bucket instead of vanishing from the bell.
 */
function categoryForNotificationType(type: string): NotificationCategory {
  for (const [category, types] of Object.entries(NOTIFICATION_TYPES_BY_CATEGORY)) {
    if (types.includes(type)) return category as NotificationCategory;
  }
  const prefix = type.split('.')[0];
  if (prefix === 'security') return 'security';
  if (prefix === 'billing' || prefix === 'subscription') return 'billing';
  if (prefix === 'membership' || prefix === 'member') return 'member';
  return 'system';
}

/** Domain shape consumed by the UI. */

export type Notification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  isRead: boolean;
  href: string | null;
  actionLabel: string | null;
  createdAt: string;
};

/**
 * core-be wire shape (snake_case). `type` is the canonical dotted vocabulary;
 * `message`/`action_url`/`action_label` are the body/link fields.
 */
export const notificationWireSchema = z.object({
  id: publicId('ntf'),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
  action_url: z.string().nullable().optional(),
  action_label: z.string().nullable().optional(),
  is_read: z.boolean(),
  read_at: isoDateString.nullable().optional(),
  created_at: isoDateString,
});
export type NotificationWire = z.infer<typeof notificationWireSchema>;

/** Map a wire notification to the UI domain shape. */
export function toNotification(wire: NotificationWire): Notification {
  return {
    id: wire.id,
    category: categoryForNotificationType(wire.type),
    title: wire.title,
    body: wire.message,
    isRead: wire.is_read,
    href: wire.action_url ?? null,
    actionLabel: wire.action_label ?? null,
    createdAt: wire.created_at,
  };
}

/** Unread-count envelope (`GET /notify/notifications/unread-count` → `{ count }`). */
export const unreadCountWireSchema = z.object({
  count: z.number().int().nonnegative(),
});

/** Delivery channels the UI models. "desktop" is web push (core-be `WEB_PUSH`). */

export type NotificationChannel = 'email' | 'inApp' | 'desktop';

/** A single category × channel delivery preference (domain shape). */

export type NotificationPreference = {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
};

/**
 * Wire form — core-be `PUT/GET /users/me/notification-preferences`. A row is
 * `{ notification_type, channel, is_enabled }` keyed by `(type, channel)`;
 * the PUT replaces the whole set. `notification_type` is enum-validated against
 * the canonical vocabulary (#964) and `channel` is UPPERCASE — so the UI's
 * category grid expands each toggle to one row per member type on write, and
 * collapses rows back to categories on read.
 */
export const notificationPreferenceWireSchema = z.object({
  notification_type: z.string(),
  channel: z.enum(['EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP']),
  is_enabled: z.boolean(),
});
export type NotificationPreferenceWire = z.infer<typeof notificationPreferenceWireSchema>;

/** UI channel → core-be channel. SMS has no UI equivalent (send/receive skip it). */
const CHANNEL_TO_WIRE: Record<
  NotificationChannel,
  NotificationPreferenceWire['channel']
> = { email: 'EMAIL', inApp: 'IN_APP', desktop: 'WEB_PUSH' };
const CHANNEL_FROM_WIRE: Partial<
  Record<NotificationPreferenceWire['channel'], NotificationChannel>
> = { EMAIL: 'email', IN_APP: 'inApp', WEB_PUSH: 'desktop' };

/**
 * Collapse wire rows to the category × channel grid. A category is enabled on a
 * channel when ANY of its member types is enabled (writes always fan the same
 * bit out to every member type, so any == all in steady state — ANY just keeps
 * a drifted set visible instead of silently off). SMS rows are ignored (no UI).
 */
export function groupNotificationPreferences(
  rows: NotificationPreferenceWire[],
): NotificationPreference[] {
  const enabledByKey = new Map<string, boolean>();
  for (const row of rows) {
    const channel = CHANNEL_FROM_WIRE[row.channel];
    if (!channel) continue;
    const category = categoryForNotificationType(row.notification_type);
    const key = `${category}:${channel}`;
    enabledByKey.set(key, (enabledByKey.get(key) ?? false) || row.is_enabled);
  }
  return [...enabledByKey.entries()].map(([key, enabled]) => {
    const [category, channel] = key.split(':') as [
      NotificationCategory,
      NotificationChannel,
    ];
    return { category, channel, enabled };
  });
}

/**
 * Expand the category grid to canonical wire rows for the full-replace PUT —
 * one row per member type of each category, all carrying the toggle's bit.
 */
export function toNotificationPreferenceWires(
  prefs: NotificationPreference[],
): NotificationPreferenceWire[] {
  return prefs.flatMap((pref) =>
    NOTIFICATION_TYPES_BY_CATEGORY[pref.category].map((type) => ({
      notification_type: type,
      channel: CHANNEL_TO_WIRE[pref.channel],
      is_enabled: pref.enabled,
    })),
  );
}
