import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  accentForeground,
  applyBaseColor,
  applyGeneratedTheme,
  applyIconColor,
  applyIconWeight,
  applyMenuStyle,
  applyThemePreset,
  GENERATED_FONTS,
  GENERATED_PRESET,
  GENERATED_RADII,
  generateSeededTheme,
  generateTheme,
  hexToHue,
  isThemePreset,
  nextAppVariant,
  nextAuthVariant,
  nextDashboardVariant,
  nextRandomHue,
  oklchToHex,
  randomThemeHue,
  rollColour,
  rollSurface,
  rollTypography,
  shuffleIcons,
  THEME_PRESETS,
} from './presets.ts';

const GENERATED_VARS = [
  '--color-primary',
  '--color-ring',
  '--color-sidebar-primary',
  '--color-sidebar-ring',
  '--color-primary-foreground',
  '--color-sidebar-primary-foreground',
  '--font-sans',
  '--font-heading',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--spacing',
  '--default-transition-duration',
  '--default-transition-timing-function',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
];

afterEach(() => {
  const root = document.documentElement;
  delete root.dataset.theme;
  delete root.dataset.base;
  delete root.dataset.menu;
  delete root.dataset.contrast;
  delete root.dataset.elevation;
  delete root.dataset.separation;
  delete root.dataset.shape;
  delete root.dataset.focus;
  root.style.removeProperty('--icon-stroke');
  for (const v of GENERATED_VARS) root.style.removeProperty(v);
});

describe('theme presets', () => {
  it('includes the default preset', () => {
    expect(THEME_PRESETS.some((p) => p.id === 'default')).toBe(true);
  });

  it('isThemePreset validates known ids', () => {
    expect(isThemePreset('violet')).toBe(true);
    expect(isThemePreset('default')).toBe(true);
    expect(isThemePreset('nope')).toBe(false);
  });

  it('sets data-theme for a non-default preset', () => {
    applyThemePreset('violet');
    expect(document.documentElement.dataset.theme).toBe('violet');
  });

  it('clears data-theme for the default preset', () => {
    applyThemePreset('violet');
    applyThemePreset('default');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('falls back to default for unknown ids', () => {
    applyThemePreset('bogus');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('generated themes (shuffle)', () => {
  const sample = {
    hue: 200,
    chartHue: 320,
    bodyFontId: 'serif',
    headingFontId: 'mono',
    radiusId: 'round',
  };

  it('GENERATED_PRESET is not a named preset', () => {
    expect(isThemePreset(GENERATED_PRESET)).toBe(false);
  });

  it('randomThemeHue returns a hue in 0–359', () => {
    for (let i = 0; i < 50; i += 1) {
      const h = randomThemeHue();
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('nextRandomHue returns a valid hue (with or without a current)', () => {
    expect(nextRandomHue(100)).toBeGreaterThanOrEqual(0);
    expect(nextRandomHue(100)).toBeLessThan(360);
    expect(nextRandomHue(null)).toBeLessThan(360);
  });

  it('generateTheme yields a valid full look (hue + chart + known fonts + radius)', () => {
    const t = generateTheme(null);
    expect(t.hue).toBeGreaterThanOrEqual(0);
    expect(t.hue).toBeLessThan(360);
    expect(t.chartHue).toBeLessThan(360);
    expect(GENERATED_FONTS[t.bodyFontId]).toBeDefined();
    expect(GENERATED_FONTS[t.headingFontId]).toBeDefined();
    expect(GENERATED_RADII[t.radiusId]).toBeDefined();
  });

  it('generateSeededTheme is reproducible (same seed → same look; different seeds differ)', () => {
    expect(generateSeededTheme(4821)).toEqual(generateSeededTheme(4821));
    expect(generateSeededTheme(1)).not.toEqual(generateSeededTheme(2));
  });

  it('accentForeground returns a contrast-safe foreground that adapts to the accent', () => {
    expect(accentForeground(0.85, 0.16, 100)).toBe('oklch(0.205 0 0)'); // light → dark text
    expect(accentForeground(0.3, 0.12, 265)).toBe('oklch(0.985 0 0)'); // dark → light text
  });

  it('per-section rolls return scoped partial looks with valid values', () => {
    expect(Object.keys(rollColour()).sort()).toEqual([
      'chartHue',
      'harmonyId',
      'hue',
      'intensityId',
    ]);
    expect(Object.keys(rollTypography()).sort()).toEqual([
      'bodyFontId',
      'headingFontId',
      'radiusId',
      'shapeId',
      'typeScaleId',
    ]);
    expect(Object.keys(rollSurface()).sort()).toEqual([
      'contrastId',
      'densityId',
      'elevationId',
      'focusId',
      'motionId',
      'separationId',
    ]);
    expect(GENERATED_FONTS[rollTypography().bodyFontId as string]).toBeDefined();
    expect(rollColour().hue).toBeGreaterThanOrEqual(0);
    expect(rollColour().hue).toBeLessThan(360);
  });

  it('oklchToHex / hexToHue round-trip an accent hue within tolerance', () => {
    const hex = oklchToHex(0.58, 0.16, 200);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Math.abs(hexToHue(hex) - 200)).toBeLessThanOrEqual(8);
  });

  it('hexToHue maps primaries to the expected OKLCH hue band (and is fault-tolerant)', () => {
    expect(hexToHue('#ff0000')).toBeGreaterThanOrEqual(20); // red
    expect(hexToHue('#ff0000')).toBeLessThanOrEqual(40);
    expect(hexToHue('#0000ff')).toBeGreaterThanOrEqual(250); // blue
    expect(hexToHue('#0000ff')).toBeLessThanOrEqual(290);
    expect(hexToHue('not-a-hex')).toBe(0); // safe fallback
  });

  it('applyGeneratedTheme derives the chart palette from the harmony rule', () => {
    applyGeneratedTheme({ ...sample, harmonyId: 'monochromatic', chartHue: 200 });
    const style = document.documentElement.style;
    // monochromatic keeps one hue (200) across all 5 series, stepping lightness
    for (let i = 1; i <= 5; i += 1) {
      expect(style.getPropertyValue(`--color-chart-${i}`)).toContain('200');
    }
  });

  it('applyGeneratedTheme applies the feel axes (shape/separation/focus + type scale)', () => {
    applyGeneratedTheme({
      ...sample,
      shapeId: 'pill',
      separationId: 'shadow',
      focusId: 'glow',
      typeScaleId: 'grand',
    });
    const root = document.documentElement;
    expect(root.dataset.shape).toBe('pill');
    expect(root.dataset.separation).toBe('shadow');
    expect(root.dataset.focus).toBe('glow');
    // a non-default type scale overrides --text-* (default leaves them stock)
    expect(root.style.getPropertyValue('--text-lg')).not.toBe('');
  });

  it('applyThemePreset sets rose and ocean presets', () => {
    applyThemePreset('rose');
    expect(document.documentElement.dataset.theme).toBe('rose');
    applyThemePreset('ocean');
    expect(document.documentElement.dataset.theme).toBe('ocean');
  });

  it('THEME_PRESETS includes rose and ocean', () => {
    expect(THEME_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining(['rose', 'ocean', 'violet', 'emerald']),
    );
  });

  it('applyGeneratedTheme uses instant motion when prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    applyGeneratedTheme({ ...sample, motionId: 'calm' });
    expect(
      document.documentElement.style.getPropertyValue('--default-transition-duration'),
    ).toBe('0ms');
    vi.unstubAllGlobals();
  });

  it('applyGeneratedTheme sets accent + fonts + radius + chart, clears data-theme', () => {
    applyThemePreset('violet'); // start from a named preset
    applyGeneratedTheme(sample);
    const style = document.documentElement.style;
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(style.getPropertyValue('--color-primary')).toContain('200');
    expect(style.getPropertyValue('--font-sans')).toContain('Georgia'); // serif
    expect(style.getPropertyValue('--font-heading')).toContain('Courier'); // mono
    expect(style.getPropertyValue('--radius-lg')).toBe('1rem');
    expect(style.getPropertyValue('--color-chart-1')).toContain('oklch');
    expect(style.getPropertyValue('--color-sidebar-ring')).toContain('oklch');
  });

  it('applyThemePreset clears any generated accent/font/radius/chart vars', () => {
    applyGeneratedTheme(sample);
    applyThemePreset('violet');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toBe('');
    expect(style.getPropertyValue('--font-sans')).toBe('');
    expect(style.getPropertyValue('--font-heading')).toBe('');
    expect(style.getPropertyValue('--radius-lg')).toBe('');
    expect(style.getPropertyValue('--color-chart-1')).toBe('');
    expect(document.documentElement.dataset.theme).toBe('violet');
  });
});

describe('orthogonal base colour + menu', () => {
  it('applyBaseColor sets/clears data-base', () => {
    applyBaseColor('stone');
    expect(document.documentElement.dataset.base).toBe('stone');
    applyBaseColor('neutral');
    expect(document.documentElement.dataset.base).toBeUndefined();
    applyBaseColor('bogus');
    expect(document.documentElement.dataset.base).toBeUndefined();
  });

  it('applyMenuStyle sets/clears data-menu', () => {
    applyMenuStyle('translucent');
    expect(document.documentElement.dataset.menu).toBe('translucent');
    applyMenuStyle('glass');
    expect(document.documentElement.dataset.menu).toBe('glass');
    applyMenuStyle('default');
    expect(document.documentElement.dataset.menu).toBeUndefined();
  });

  it('shuffleIcons keeps valid ids and varies weight + library over many rolls', () => {
    const current = { weight: 'regular', library: 'lucide', color: 'default' };
    let weightChanged = false;
    let libraryChanged = false;
    let colorChanged = false;
    for (let i = 0; i < 60; i += 1) {
      const next = shuffleIcons(current);
      expect(['thin', 'regular', 'bold']).toContain(next.weight);
      expect(['lucide', 'tabler', 'phosphor']).toContain(next.library);
      expect([
        'default',
        'foreground',
        'muted',
        'primary',
        'accent',
        'destructive',
      ]).toContain(next.color);
      if (next.weight !== current.weight) weightChanged = true;
      if (next.library !== current.library) libraryChanged = true;
      if (next.color !== current.color) colorChanged = true;
    }
    // ~50% / ~35% / ~30% per roll → effectively certain to flip at least once in 60.
    expect(weightChanged).toBe(true);
    expect(libraryChanged).toBe(true);
    expect(colorChanged).toBe(true);
  });

  it('nextAuthVariant returns a different design index in range (TEMP)', () => {
    for (const current of [0, 1, 2]) {
      for (let i = 0; i < 20; i += 1) {
        const v = nextAuthVariant(current);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(v).not.toBe(current);
      }
    }
  });

  it('nextAppVariant returns a different shell index in range (TEMP)', () => {
    for (const current of [0, 1, 2]) {
      for (let i = 0; i < 20; i += 1) {
        const v = nextAppVariant(current);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(v).not.toBe(current);
      }
    }
  });

  it('nextDashboardVariant returns a different arrangement index in range (TEMP)', () => {
    for (const current of [0, 1, 2, 3]) {
      for (let i = 0; i < 20; i += 1) {
        const v = nextDashboardVariant(current);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(4);
        expect(v).not.toBe(current);
      }
    }
  });

  it('applyIconWeight sets/clears --icon-stroke', () => {
    applyIconWeight('bold');
    expect(document.documentElement.style.getPropertyValue('--icon-stroke')).toBe('2.5');
    applyIconWeight('regular'); // default → cleared
    expect(document.documentElement.style.getPropertyValue('--icon-stroke')).toBe('');
  });

  it('applyIconColor sets/clears data-icon-color', () => {
    applyIconColor('primary');
    expect(document.documentElement.dataset.iconColor).toBe('primary');
    applyIconColor('default');
    expect(document.documentElement.dataset.iconColor).toBeUndefined();
  });
});
