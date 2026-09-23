import { z } from 'zod';

import { isoDateString } from '@/core/types/wire.ts';

/**
 * Active-session contracts (core-be `/auth/me/sessions`) for the Security →
 * Sessions panel. core-be #795 enriched the row with `device` / `browser` /
 * `is_current` alongside `ip_address` / `user_agent`; there is no `location`
 * (geo-locate `ip_address` client-side if a region is ever needed). Revoking the
 * current session returns 409 — log out instead (handled in the panel).
 *
 * `device` and `browser` are NULLABLE. core-be derives them with a dependency-free
 * heuristic (`parseUserAgent`) that recognises seven device families and five
 * browsers and returns null for everything else — a mobile app, an API client,
 * curl, a headless run, or a request with no `User-Agent` at all. Demanding a
 * string here did not surface a loud error: `parseListTolerant` drops a row the
 * schema rejects, so those sessions vanished from the panel and could never be
 * signed out. The panel supplies the display fallback, because the fallback is
 * user-facing copy and belongs in the locale bundle, not here.
 */

export type Session = {
  id: string;
  device: string | null;
  browser: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  current: boolean;
};

export const sessionWireSchema = z.object({
  id: z.string().min(1),
  device: z.string().nullable().optional(),
  browser: z.string().nullable().optional(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  last_active_at: isoDateString,
  is_current: z.boolean(),
});
export type SessionWire = z.infer<typeof sessionWireSchema>;

export function toSession(wire: SessionWire): Session {
  return {
    id: wire.id,
    device: wire.device ?? null,
    browser: wire.browser ?? null,
    ipAddress: wire.ip_address ?? null,
    lastActiveAt: wire.last_active_at,
    current: wire.is_current,
  };
}
