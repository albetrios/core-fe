import { z } from 'zod';

/**
 * Route-param validation (docs/reference/routing-and-tenancy.md §8).
 *
 * Params arrive as raw strings; every loader validates them here **before any
 * fetch** — a malformed param is a 404, decided locally. Parsers return `null`
 * on invalid input; the guard layer owns throwing `notFound()`.
 */

/**
 * Organization slug as it appears in team URLs: human-readable, lowercase
 * alphanumeric with internal hyphens (1–64 chars). Team orgs carry a slug;
 * personal orgs have none and live on root `/dashboard` instead (FE-22).
 */
export const organizationSlugParamSchema = z
  .string()
  .min(1)
  .max(64)
  // Single char-class (ReDoS-safe — no nested quantifiers) plus an edge check
  // rejecting leading/trailing hyphens; the membership lookup is the real gate.
  .regex(/^[a-z0-9-]+$/, 'invalid organization slug')
  .refine((s) => !(s.startsWith('-') || s.endsWith('-')), 'invalid organization slug');

/** Parse a raw `$organizationSlug` param; `null` when malformed. */
export function parseOrganizationSlugParam(raw: string): string | null {
  const result = organizationSlugParamSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/* ── Invitation ID param ─────────────────────────────────────────── */

/** Invitation ID as it appears in URLs: `inv_` + random suffix. */
export const invitationIdParamSchema = z
  .string()
  .regex(/^inv_[A-Za-z0-9]{1,64}$/, 'invalid invitation id');

/** Parse a raw `$invitationId` param; `null` when malformed. */
export function parseInvitationIdParam(raw: string): string | null {
  const result = invitationIdParamSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/* ── OAuth provider param ────────────────────────────────────────── */

/**
 * OAuth provider slug as it appears in the provider-specific callback URL
 * (`/callback/google`, `/callback/github`): lowercase kebab, ≤ 32 chars.
 * Format-only gate — whether the provider is actually wired is core-be's
 * decision (its callback route 501s on an unknown provider).
 */
export const oauthProviderParamSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, 'invalid oauth provider');

/** Parse a raw `$provider` param; `null` when malformed. */
export function parseOAuthProviderParam(raw: string): string | null {
  const result = oauthProviderParamSchema.safeParse(raw);
  return result.success ? result.data : null;
}
