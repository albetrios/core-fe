import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as VariantsModule from './auth-layout-variants.ts';

vi.mock('./variants/AuthLayoutSplit.tsx', () => ({ SplitAuth: () => null }));
vi.mock('./variants/AuthLayoutSpotlight.tsx', () => ({ SpotlightAuth: () => null }));
vi.mock('./variants/AuthLayoutMinimal.tsx', () => ({ MinimalAuth: () => null }));

type Variants = typeof VariantsModule;

/**
 * Which variant chunks have been FETCHED — the whole point of this module. Each
 * loader is a `onceAsync`, so `peek()` is defined exactly for the chunks that
 * were requested and have landed.
 */
function fetched(variants: Variants): string[] {
  return [
    ['split', variants.loadSplitAuth],
    ['spotlight', variants.loadSpotlightAuth],
    ['minimal', variants.loadMinimalAuth],
  ]
    .filter(([, load]) => (load as Variants['loadSplitAuth']).peek() !== undefined)
    .map(([name]) => name as string);
}

describe('auth-layout-variants', () => {
  let variants: Variants;

  beforeEach(async () => {
    // A fresh module instance per test: `onceAsync` remembers what it fetched.
    vi.resetModules();
    variants = await import('./auth-layout-variants.ts');
  });

  it('fetches nothing just by being imported — the entry chunk imports this module', () => {
    expect(fetched(variants)).toEqual([]);
  });

  it.each([
    [0, 'split'],
    [1, 'spotlight'],
    [2, 'minimal'],
  ] as const)('variant %i fetches only the %s chunk', async (variant, name) => {
    await variants.preloadAuthLayoutVariant(variant);

    expect(fetched(variants)).toEqual([name]);
  });

  it('falls back to Split for an index with no variant, like the layout does', async () => {
    await variants.preloadAuthLayoutVariant(42);

    expect(fetched(variants)).toEqual(['split']);
  });

  it('shares one module promise between a preload and the lazy() that follows', () => {
    // Two promises would request the chunk twice and let Suspense flake.
    expect(variants.loadSplitAuth()).toBe(variants.loadSplitAuth());
  });

  it('preloadAllAuthLayoutVariants warms every variant (test harness)', async () => {
    await variants.preloadAllAuthLayoutVariants();

    expect(fetched(variants)).toEqual(['split', 'spotlight', 'minimal']);
  });
});
