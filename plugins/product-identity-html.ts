import type { Plugin } from 'vite';

import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_THEME_COLOR,
} from '../src/lib/product-identity.ts';

/**
 * Identity tokens substituted in `index.html`. Deliberately `{{…}}` rather than
 * Vite's `%VAR%` html-env syntax so they can never collide with an env key.
 */
const TOKENS: Record<string, string> = {
  '{{PRODUCT_NAME}}': PRODUCT_NAME,
  '{{PRODUCT_DESCRIPTION}}': PRODUCT_DESCRIPTION,
  '{{PRODUCT_THEME_COLOR}}': PRODUCT_THEME_COLOR,
};

/** Any `{{PRODUCT_*}}` token left after substitution is a typo, not a value. */
const UNRESOLVED = /\{\{PRODUCT_[A-Z_]+\}\}/;

/**
 * Substitutes product identity into `index.html` — document title, meta
 * description, `theme-color`, and the boot-splash brand name.
 *
 * These four strings used to be hardcoded, which made them the most-missed spots
 * in a rebrand (the splash name in particular is markup, not config). Sourcing
 * them from `src/lib/product-identity.ts` — itself generated from
 * `tooling/setup/setup.config.json` — removes them from the rename surface
 * entirely, so `pnpm rebrand` never has to touch HTML.
 *
 * Runs `pre` so the substituted markup is what every later html transform (and
 * the CSP plugin's placeholder pass) sees.
 */
export function productIdentityHtml(): Plugin {
  return {
    name: 'product-identity-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const out = Object.entries(TOKENS).reduce(
          (acc, [token, value]) => acc.replaceAll(token, value),
          html,
        );
        const leftover = UNRESOLVED.exec(out);
        if (leftover) {
          throw new Error(
            `product-identity-html: unknown token ${leftover[0]} in index.html — ` +
              `known tokens are ${Object.keys(TOKENS).join(', ')}.`,
          );
        }
        return out;
      },
    },
  };
}
