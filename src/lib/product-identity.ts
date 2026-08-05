/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source of truth: `tooling/setup/setup.config.json` → `project.*`.
 * Regenerate:      `pnpm identity:sync`
 * Rename product:  `pnpm rebrand "<Product Name>"`
 * Guarded by:      `pnpm validate:identity` + `tests/ci/identity.policy.test.ts`
 *
 * This is the only place app code may read the product name from — a hardcoded
 * brand literal anywhere under `src/` fails `pnpm validate:identity`.
 */

/** User-visible product name — document titles, PWA manifest, layout brand. */
export const PRODUCT_NAME = 'Core';

/** One-line product description — `<meta name="description">` and the manifest. */
export const PRODUCT_DESCRIPTION = 'Enterprise multi-tenant admin dashboard';

/** Browser chrome / PWA `theme_color`. */
export const PRODUCT_THEME_COLOR = '#0a0a0a';

/** PWA splash `background_color`. */
export const PRODUCT_BACKGROUND_COLOR = '#ffffff';
