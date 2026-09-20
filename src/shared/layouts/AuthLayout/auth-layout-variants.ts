import { onceAsync } from '@/lib/lazy-module.ts';

/**
 * Chunk loaders for the auth shell variants — deliberately their own module.
 *
 * `AuthLayout.tsx` needs them for `React.lazy`; the route tree needs them to
 * warm the ACTIVE variant while the auth bootstrap is still in flight. If they
 * lived in `AuthLayout.tsx`, importing them from the route tree (entry chunk)
 * would drag the whole layout onto first paint. Here the entry pays for three
 * import thunks and nothing else.
 *
 * Each variant is fetched on first call and shared from then on (`onceAsync`).
 * A module-scope `import()` would instead fetch all three the moment this
 * module evaluates, which defeats the split.
 */
export const loadSplitAuth = onceAsync(() => import('./variants/AuthLayoutSplit.tsx'));
/** Spotlight auth shell chunk (variant 1). */
export const loadSpotlightAuth = onceAsync(
  () => import('./variants/AuthLayoutSpotlight.tsx'),
);
/** Minimal auth shell chunk (variant 2). */
export const loadMinimalAuth = onceAsync(
  () => import('./variants/AuthLayoutMinimal.tsx'),
);

/** Loaders in `authVariant` index order — index-aligned with `AUTH_SHELLS`. */
const AUTH_VARIANT_LOADERS = [loadSplitAuth, loadSpotlightAuth, loadMinimalAuth] as const;

/** Fetch one variant's chunk without mounting it. Unknown indices fall back to Split. */
export function preloadAuthLayoutVariant(variant: number): Promise<unknown> {
  return (AUTH_VARIANT_LOADERS[variant] ?? loadSplitAuth)();
}

/** Warms every variant chunk so tests can render any shell without a Suspense race. */
export function preloadAllAuthLayoutVariants(): Promise<unknown> {
  return Promise.all(AUTH_VARIANT_LOADERS.map((load) => load()));
}
