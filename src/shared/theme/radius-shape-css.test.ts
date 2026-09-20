import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GENERATED_RADII } from './presets.ts';

/**
 * The Corner radius and Shape axes are implemented in CSS, so this reads the
 * stylesheet: a contract that lives in `index.css` cannot be asserted through
 * jsdom, which resolves neither `@theme` nor `calc()`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

/** `--radius-<step>: <value>;` as declared in the `@theme` block. */
function radiusToken(step: string): string {
  const name = `--radius-${step}:`;
  const line = css.split('\n').find((candidate) => candidate.trim().startsWith(name));
  if (!line) throw new Error(`--radius-${step} is not declared in index.css`);
  return line.trim().slice(name.length).replace(/;$/, '').trim();
}

/** Resolve a declared token for a given base (`--radius-lg`, in rem). */
function resolveRem(step: string, baseRem: number): number {
  const value = radiusToken(step);
  const derived = /^calc\(var\(--radius-lg\) \* ([\d.]+)\)$/.exec(value);
  if (derived?.[1]) return baseRem * Number(derived[1]);
  return Number.parseFloat(value);
}

describe('corner radius scale (index.css @theme)', () => {
  it.each([
    ['xs', 0.125],
    ['2xl', 1],
    ['3xl', 1.5],
    ['4xl', 2],
  ])('--radius-%s derives from --radius-lg', (step) => {
    // Left at Tailwind's fixed defaults these ignored the axis: `rounded-2xl`
    // kept a 16px corner under radius "None", which is how the dashboard hero
    // stayed round in an otherwise square app.
    expect(radiusToken(step)).toMatch(/^calc\(var\(--radius-lg\) \* [\d.]+\)$/);
  });

  it.each([
    ['xs', 0.125],
    ['2xl', 1],
    ['3xl', 1.5],
    ['4xl', 2],
  ])('--radius-%s is still Tailwind’s stock value on the default look', (step, stock) => {
    // Nothing may move until the axis does.
    expect(resolveRem(step, GENERATED_RADII.default?.base ?? Number.NaN)).toBe(stock);
  });

  it('every derived step is square under radius "None" and grows with "Round"', () => {
    for (const step of ['xs', '2xl', '3xl', '4xl']) {
      expect(resolveRem(step, GENERATED_RADII.sharp?.base ?? Number.NaN)).toBe(0);
      expect(resolveRem(step, GENERATED_RADII.round?.base ?? Number.NaN)).toBeGreaterThan(
        resolveRem(step, GENERATED_RADII.default?.base ?? Number.NaN),
      );
    }
  });
});

describe('Sharp shape coverage (index.css [data-shape="sharp"])', () => {
  const squared = (slot: string) =>
    css.includes(`[data-shape='sharp'] [data-slot='${slot}']`);

  it.each([
    // surfaces
    'card',
    'surface',
    'dialog-content',
    'alert-dialog-content',
    'popover-content',
    'dropdown-menu-content',
    // controls
    'button',
    'input',
    'textarea',
    'select-trigger',
    'checkbox',
    'switch',
    'switch-thumb',
    'input-otp-slot',
    // round BY DESIGN — `rounded-full` in every other shape
    'badge',
    'avatar',
    'avatar-fallback',
    'progress',
    'progress-indicator',
    'floating-edge',
    'kbd',
    'pill',
    // tiles
    'icon-chip',
    'skeleton',
  ])('squares the %s slot', (slot) => {
    expect(squared(slot)).toBe(true);
  });
});

describe('big-monitor breakpoints (index.css @theme)', () => {
  it('names the tiers past Tailwind’s 2xl', () => {
    // `2xl` stops at 96rem (1536px). A 1920px desktop and a 2560px+ monitor are
    // different canvases again; `3xl:` / `4xl:` are what shells, containers and
    // the auth hero use to keep growing instead of floating mid-glass.
    expect(css).toMatch(/--breakpoint-3xl:\s*120rem;/);
    expect(css).toMatch(/--breakpoint-4xl:\s*160rem;/);
  });
});
