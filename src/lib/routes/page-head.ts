import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from '@/lib/product-identity.ts';

import type { PageManifest } from './page-manifest.ts';

/** Product name — the title suffix on every page (and the `/` fallback). */
export const APP_TITLE = PRODUCT_NAME;

/** Default meta description for the app shell. */
export const APP_DESCRIPTION = PRODUCT_DESCRIPTION;

/** "Sign in · <product>" — the one composition rule for document titles. */
export function composePageTitle(pageTitle: string): string {
  return `${pageTitle} · ${APP_TITLE}`;
}

/**
 * TanStack Router `head` option for a route island: renders the manifest's
 * `title` as the document title through the root `<HeadContent />`. The
 * deepest matched route wins, so a leaf's title overrides its layout's.
 */
export function manifestHead(
  manifest: Pick<PageManifest, 'title'>,
): () => { meta: [{ title: string }] } {
  return () => ({ meta: [{ title: composePageTitle(manifest.title) }] });
}
