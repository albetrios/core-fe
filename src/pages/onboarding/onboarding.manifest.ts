import i18n from '@/lib/i18n/i18n.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

/**
 * Onboarding — leaf island (`/onboarding`).
 * First-run flow that collects profile basics before sending the user to the dashboard.
 *
 * The title key and test id are written out here, not read off
 * `onboarding.constants.ts`: `routeTree.tsx` imports this manifest statically,
 * so it is in the entry chunk, and importing the constants module for these two
 * values put its whole key table on the first paint of every load.
 * `onboarding.manifest.test.ts` pins them to the originals.
 */
export const manifest = {
  segment: 'onboarding',
  path: '/onboarding',
  title: i18n.t('manifest.title', { ns: I18N_NAMESPACES.onboarding }),
  testId: 'onboarding-page',
  permission: null,
  kind: 'leaf',
  children: [],
} as const satisfies PageManifest;
