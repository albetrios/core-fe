import i18n from '@/lib/i18n/i18n.ts';
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

import { AUTH_NS, CALLBACK_MANIFEST } from './callback.constants.ts';

export const manifest = {
  segment: 'callback',
  path: '/callback/$provider',
  title: i18n.t(CALLBACK_MANIFEST.titleKey, { ns: AUTH_NS }),
  testId: CALLBACK_MANIFEST.testId,
  permission: null,
  kind: 'leaf',
  children: [],
} as const satisfies PageManifest;
