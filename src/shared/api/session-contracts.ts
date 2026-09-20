import { z } from 'zod';

import { isoDateString } from '@/core/types/wire.ts';

/**
 * Active-session contracts (core-be `/auth/me/sessions`) for the Security →
 * Sessions panel. core-be #795 enriched the row with `device` / `browser` /
 * `is_current` alongside `ip_address` / `user_agent`; there is no `location`
 * (geo-locate `ip_address` client-side if a region is ever needed). Revoking the
 * current session returns 409 — log out instead (handled in the panel).
 */

export type Session = {
  id: string;
  device: string;
  browser: string;
  ipAddress: string | null;
  lastActiveAt: string;
  current: boolean;
};

export const sessionWireSchema = z.object({
  id: z.string().min(1),
  device: z.string(),
  browser: z.string(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  last_active_at: isoDateString,
  is_current: z.boolean(),
});
export type SessionWire = z.infer<typeof sessionWireSchema>;

export function toSession(wire: SessionWire): Session {
  return {
    id: wire.id,
    device: wire.device,
    browser: wire.browser,
    ipAddress: wire.ip_address ?? null,
    lastActiveAt: wire.last_active_at,
    current: wire.is_current,
  };
}
