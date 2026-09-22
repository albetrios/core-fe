import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Sentry feedback trigger is third-party: it lives in a shadow root and is
 * injected outside React (`autoInject: true` in `app/observability/sentry.ts`),
 * so the only place its placement can be steered from is the stylesheet. That
 * puts the contract in `index.css`, which jsdom cannot evaluate — hence a read
 * of the source, the same approach `theme/radius-shape-css.test.ts` takes.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

/** The stylesheet with comments stripped, so a rule quoted in prose can't pass. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Sentry feedback trigger placement', () => {
  it('is steered from index.css at all', () => {
    expect(rules).toContain('#sentry-feedback');
  });

  // The trigger is pinned above everything a modal dims, so it sat lit up over
  // Settings, over a confirm dialog and over the invite form at every width
  // (QA-V3 suggestion 9).
  it('is hidden while a modal dialog is open', () => {
    const hidden =
      /:root:has\(\s*\[data-slot='dialog-overlay'\][\s\S]{0,120}#sentry-feedback\s*\{\s*display:\s*none/.test(
        rules,
      );
    expect(hidden).toBe(true);
  });

  // Keyed on the OVERLAY, which is what marks a dialog modal. The Appearance
  // panel has no scrim and leaves the page interactive, so nothing is being
  // interrupted there and its trigger must survive.
  it('keys on the overlay, not the content, so non-modal panels keep it', () => {
    // Every block that hides the trigger — there is more than one (the consent
    // card claims the same corner below `sm`), so this asserts across all of
    // them rather than picking one and hoping it is the modal rule.
    const hidingBlocks = rules
      .split('}')
      .filter((block) => block.includes('#sentry-feedback') && block.includes('display'));
    expect(hidingBlocks.length).toBeGreaterThan(0);
    expect(hidingBlocks.some((block) => block.includes('dialog-overlay'))).toBe(true);
    expect(hidingBlocks.every((block) => !block.includes('dialog-content'))).toBe(true);
  });

  // Pre-existing contract, asserted here so the rules above cannot be "fixed"
  // by deleting the block they share: the mobile tab bar publishes its height
  // and the trigger lifts clear of it.
  it('still lifts clear of the mobile tab bar', () => {
    expect(rules).toContain('--floating-bottom-offset');
    expect(rules).toMatch(
      /#sentry-feedback\s*\{[^}]*--inset:[^}]*--floating-bottom-offset/,
    );
  });
});
