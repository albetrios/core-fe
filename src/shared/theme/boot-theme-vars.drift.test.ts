import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyGeneratedTheme,
  applyThemePreset,
  BOOT_SPLASH_VARS,
  DEFAULT_PRESET,
  generateSeededTheme,
  releaseBootThemeVars,
} from './presets.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** A value no stylesheet would ever produce: if it survives, that var is stuck. */
const BOOT_SENTINEL = 'oklch(0.123 0.456 78)';

/**
 * Every custom property `public/theme-init.js` can leave inline on `<html>` —
 * the ones it names literally, plus the snapshot keys it replays verbatim.
 */
function bootWrittenVars(): string[] {
  const source = readFileSync(join(repoRoot, 'public/theme-init.js'), 'utf8');
  const literal = [...source.matchAll(/setProperty\(\s*'(--[\w-]+)'/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
  return [...new Set([...literal, ...BOOT_SPLASH_VARS])];
}

/**
 * The boot script paints the splash from an INLINE palette on `<html>`, resolved
 * for the mode the document loaded in. An inline custom property outranks both
 * `:root` and `.dark`, so any one still there after the bundle takes over pins
 * its token to the boot mode for the life of the document — a later light/dark
 * switch then moves only the tokens the app owns and the page comes out half
 * dark, repaired only by a reload.
 *
 * So every var the boot script can write has to be either released by
 * {@link releaseBootThemeVars} or re-asserted by the look the caller applies
 * immediately after. Adding one to {@link BOOT_SPLASH_VARS} and to neither is
 * what this pins.
 */
describe('boot palette hand-off (theme-init.js ↔ shared/theme)', () => {
  afterEach(() => {
    const root = document.documentElement;
    for (const name of bootWrittenVars()) root.style.removeProperty(name);
    root.classList.remove('dark');
    delete root.dataset.theme;
  });

  it('accounts for the mode-specific palette the splash paints from', () => {
    expect(bootWrittenVars()).toEqual(
      expect.arrayContaining([
        '--color-background',
        '--color-foreground',
        '--color-muted',
      ]),
    );
  });

  const lookPaths = [
    ['named preset', () => applyThemePreset(DEFAULT_PRESET)],
    ['generated look', () => applyGeneratedTheme(generateSeededTheme(4242))],
  ] as const;

  for (const [label, applyLook] of lookPaths) {
    it(`leaves nothing the boot script wrote pinned to the boot mode (${label})`, () => {
      const root = document.documentElement;
      const written = bootWrittenVars();
      for (const name of written) root.style.setProperty(name, BOOT_SENTINEL);

      releaseBootThemeVars();
      applyLook();

      const pinned = written.filter(
        (name) => root.style.getPropertyValue(name) === BOOT_SENTINEL,
      );
      expect(pinned).toEqual([]);
    });
  }
});
