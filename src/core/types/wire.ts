import { z } from 'zod';

/**
 * Shared Zod helpers for core-be wire shapes.
 *
 * core-be public ids are `<prefix>_<21 lowercase alphanumerics>`, where the
 * prefix is 2–5 lowercase letters (e.g. `org_`, `usr_`, `mem_`, `inv_`, `rol_`,
 * `key_`, `sub_`, `pln_`, `am_`, `whk_`). Timestamps are ISO-8601 strings and
 * money is a decimal string (`"19.00"`).
 */

const PUBLIC_ID_SUFFIX_LEN = 21;

/** Zod schema for a specific prefixed public id, e.g. `publicId('org')`. */
export function publicId(prefix: string) {
  // Both interpolations are internal constants — `prefix` is an entity key from this module's
  // own call sites and the length is the literal above. Nothing user-supplied reaches the
  // pattern, so there is no injection surface here.
  // eslint-disable-next-line security/detect-non-literal-regexp -- prefix is an internal entity key, not input
  const re = new RegExp(`^${prefix}_[a-z0-9]{${PUBLIC_ID_SUFFIX_LEN}}$`);
  return z.string().regex(re, `invalid ${prefix} id`);
}

/** Generic public-id guard accepting any valid 2–5 char prefix. */
export const anyPublicIdSchema = z
  .string()
  .regex(/^[a-z]{2,5}_[a-z0-9]{21}$/, 'invalid public id');

/** ISO-8601 timestamp string (core-be returns dates as ISO strings, never epochs). */
export const isoDateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid ISO-8601 date');

// `safe-regex` flags the nested quantifier, but the two branches match disjoint character
// classes — a digit is never a dot — so no input can make the engine backtrack between them.
// Anchored at both ends with a bounded `{1,2}`: matching is linear in the input length.
// eslint-disable-next-line security/detect-unsafe-regex -- disjoint classes, no backtracking ambiguity
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Convert a core-be decimal-string amount (e.g. `"19.00"`) to integer cents for
 * safe UI math.
 *
 * @throws if `value` is not a numeric string with 0–2 decimal places.
 */
export function decimalStringToCents(value: string): number {
  if (!DECIMAL_RE.test(value)) {
    throw new Error(`invalid decimal string: ${value}`);
  }
  return Math.round(Number.parseFloat(value) * 100);
}

/** Zod transform: a decimal-string amount → integer cents. */
export const decimalString = z
  .string()
  .regex(DECIMAL_RE, 'invalid decimal string')
  .transform((v) => Math.round(Number.parseFloat(v) * 100));
