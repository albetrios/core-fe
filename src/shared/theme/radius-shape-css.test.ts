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
  /** The whole Sharp rule — `:is( … )`, the pseudo-element selectors, the body. */
  const sharpRule = (() => {
    // `\s*`: Prettier decides whether `:is(` stays on the prefix's line.
    const start = css.search(/\[data-shape='sharp'\]\s*:is\(/);
    if (start === -1)
      throw new Error("no [data-shape='sharp'] :is( … ) rule in index.css");
    // Comments out first: the prose inside the list has commas and braces of its own.
    return css
      .slice(start, css.indexOf('}', start) + 1)
      .replaceAll(/\/\*[\s\S]*?\*\//g, '');
  })();

  /** The arguments of `:is( … )`, one per slot. */
  const isArguments = sharpRule
    .slice(sharpRule.indexOf(':is(') + ':is('.length, sharpRule.indexOf(')'))
    .split(',')
    .map((argument) => argument.trim())
    .filter(Boolean);

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
    // the vendored carousel re-slots its arrow <Button>s, so `button` misses them
    'carousel-previous',
    'carousel-next',
    'kbd',
    'pill',
    // tiles
    'icon-chip',
    'skeleton',
  ])('squares the %s slot', (slot) => {
    expect(isArguments).toContain(`[data-slot='${slot}']`);
  });

  it.each(['before', 'after'])('squares the nav item’s ::%s route marker', (pseudo) => {
    // The active-route markers are pseudo-elements (`before:rounded-full` in the
    // sidebar, `after:rounded-full` in the top nav). They cannot carry a slot —
    // and cannot go inside `:is()` — so the rule reaches them through the nav
    // item that draws them.
    expect(sharpRule).toContain(`[data-shape='sharp'] [data-slot='nav-item']::${pseudo}`);
  });

  it('declares `border-radius: 0` — a selector list with no declaration squares nothing', () => {
    expect(sharpRule).toMatch(/\{\s*border-radius: 0;\s*\}$/);
  });

  it('keeps every `:is()` argument a single attribute selector', () => {
    // `:is()` takes the specificity of its HEAVIEST argument, for every slot in
    // the list. One `.dark [data-slot='x']` or `#id` in here would silently
    // outrank the elevation and separation rules on all 38 slots at once.
    expect(isArguments.length).toBeGreaterThan(30);
    for (const argument of isArguments) {
      expect(argument).toMatch(/^\[data-slot='[a-z-]+'\]$/);
    }
  });

  it('lists each slot once', () => {
    expect(new Set(isArguments).size).toBe(isArguments.length);
  });
});

describe('axis selector lists (index.css `:is()`)', () => {
  // The Shape and Elevation blocks list their slots inside `:is()` — one prefix
  // per list instead of one per slot, which is what keeps the initial CSS under
  // its budget. `:is()` takes the specificity of its HEAVIEST argument, so the
  // trade only holds while every argument is a single attribute selector.
  const lists = [
    ...css
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/\[data-([a-z]+)='([a-z-]+)'\]\s*:is\(([^)]*)\)/g),
  ].map((match) => ({
    axis: `${match[1]}=${match[2]}`,
    slots: (match[3] ?? '')
      .split(',')
      .map((argument) => argument.trim())
      .filter(Boolean),
  }));

  it('covers the shape and elevation axes', () => {
    expect(lists.map((list) => list.axis)).toEqual(
      expect.arrayContaining([
        'shape=pill',
        'shape=mixed',
        'shape=sharp',
        'elevation=flat',
        'elevation=soft',
        'elevation=lifted',
        'elevation=floating',
      ]),
    );
  });

  it('holds nothing but single `[data-slot]` arguments, each listed once', () => {
    for (const { axis, slots } of lists) {
      expect(slots.length, axis).toBeGreaterThan(0);
      expect(new Set(slots).size, axis).toBe(slots.length);
      for (const slot of slots) {
        expect(slot, axis).toMatch(/^\[data-slot='[a-z-]+'\]$/);
      }
    }
  });

  it.each(['flat', 'soft', 'lifted', 'floating'])(
    'elevation "%s" still reaches every overlay surface',
    (level) => {
      const list = lists.find((candidate) => candidate.axis === `elevation=${level}`);
      for (const slot of [
        'surface',
        'popover-content',
        'dropdown-menu-content',
        'dialog-content',
        'alert-dialog-content',
        'select-content',
      ]) {
        expect(list?.slots, level).toContain(`[data-slot='${slot}']`);
      }
    },
  );
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
