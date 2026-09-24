import { describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';

import {
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from './onboarding.constants.ts';
import { manifest } from './onboarding.manifest.ts';

describe('onboarding manifest', () => {
  // `routeTree.tsx` imports this manifest statically, so it ships in the entry
  // chunk. Reading its three values off `ONBOARDING_KEYS` / `ONBOARDING_TEST_IDS`
  // put that module's whole key table on the first paint of every load, so they
  // are declared locally. This is the other half of that trade: they must stay
  // identical to the originals.
  it('matches the onboarding constants it duplicates', () => {
    expect(manifest.testId).toBe(ONBOARDING_TEST_IDS.page);
    expect(manifest.title).toBe(
      i18n.t(ONBOARDING_KEYS.manifest.title, { ns: ONBOARDING_NS }),
    );
    // A key or namespace that resolves to nothing would make both sides the raw key.
    expect(manifest.title).not.toBe(ONBOARDING_KEYS.manifest.title);
  });

  it('does not import the onboarding key table', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    const source = readFileSync(join(here, 'onboarding.manifest.ts'), 'utf8');
    expect(source).not.toMatch(/from '\.\/onboarding\.constants\.ts'/);
  });
});
