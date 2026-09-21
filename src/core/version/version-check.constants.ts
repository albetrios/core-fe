import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/** Delay before the first /version.json poll (after app bootstrap). */
export const VERSION_CHECK_INITIAL_DELAY_MS = 2_000;

/** How long dismissing the update toast suppresses re-notification (per buildId). */
export const VERSION_UPDATE_SNOOZE_MS = 15 * 60 * 1_000;

/**
 * Marks the buildId this tab has already reloaded for, so the deferred reload runs
 * at most once per advertised build.
 *
 * Derived from `PRODUCT_NAMESPACE` rather than hardcoded: a renamed product would
 * otherwise show the previous brand in devtools. For this repo the namespace IS
 * `core`, so the key string is unchanged — no session state is lost.
 */
export const VERSION_CHECK_RELOADED_FOR_KEY = `${PRODUCT_NAMESPACE}:version-check:reloaded-for`;

/**
 * Marks the buildId this tab has already reloaded for after a lazy chunk went
 * missing, so stale-chunk recovery reloads at most once per advertised build.
 *
 * @remarks
 * Deliberately a DIFFERENT key from {@link VERSION_CHECK_RELOADED_FOR_KEY}: the
 * two reload paths detect different failures (a newer deploy vs. a 404'd chunk
 * from the deploy we are already on), so one standing down must never spend the
 * other's single attempt. Same `PRODUCT_NAMESPACE` derivation as its sibling.
 */
export const STALE_CHUNK_RELOADED_FOR_KEY = `${PRODUCT_NAMESPACE}:stale-chunk:reloaded-for`;

export function versionUpdateSnoozeKey(buildId: string): string {
  return `${PRODUCT_NAMESPACE}:version-check:snooze:${buildId}`;
}
