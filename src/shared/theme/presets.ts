export interface ThemePreset {
  id: string;
  label: string;
}

/**
 * Built-in accent presets. `default` uses the base `@theme` palette (no
 * `data-theme`); the others apply accent overrides via the `[data-theme='<id>']`
 * blocks in `src/index.css`, composed with `.dark`.
 *
 * Product-design floors for every axis (type scale, density, motion, WCAG):
 * docs/reference/preset-product-design-rules.md
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: 'default', label: 'Default' },
  { id: 'violet', label: 'Violet' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'rose', label: 'Rose' },
  { id: 'ocean', label: 'Ocean' },
] as const;

export const DEFAULT_PRESET = 'default';

/** Synthetic preset id for a shuffled/generated look (not in THEME_PRESETS). */
export const GENERATED_PRESET = 'custom';

export function isThemePreset(id: string): boolean {
  return THEME_PRESETS.some((preset) => preset.id === id);
}

// ── Catalogs (Appearance pickers) ────────────────────────────────────────────

/** Named accent colours → hue, for the Theme-colour and Chart-colour pickers. */
export const ACCENT_COLORS = [
  { id: 'rose', label: 'Rose', hue: 12 },
  { id: 'orange', label: 'Orange', hue: 50 },
  { id: 'amber', label: 'Amber', hue: 75 },
  { id: 'lime', label: 'Lime', hue: 130 },
  { id: 'emerald', label: 'Emerald', hue: 160 },
  { id: 'teal', label: 'Teal', hue: 190 },
  { id: 'blue', label: 'Blue', hue: 255 },
  { id: 'violet', label: 'Violet', hue: 290 },
  { id: 'pink', label: 'Pink', hue: 350 },
] as const;

const DEFAULT_FONT_STACK = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";

/**
 * Web-safe `--font-sans` / `--font-heading` stacks. The CSP is `font-src 'self'`,
 * so remote fonts can't load — these are families already on common OSes.
 */
export const GENERATED_FONTS: Record<string, { label: string; stack: string }> = {
  inter: { label: 'Inter / system', stack: DEFAULT_FONT_STACK },
  grotesk: {
    label: 'Grotesk',
    stack: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  },
  geometric: { label: 'Geometric', stack: 'Verdana, Geneva, system-ui, sans-serif' },
  humanist: {
    label: 'Humanist',
    stack: "'Gill Sans', 'Gill Sans MT', Calibri, system-ui, sans-serif",
  },
  serif: { label: 'Serif', stack: "Georgia, Cambria, 'Times New Roman', serif" },
  slab: {
    label: 'Old-style serif',
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
  },
  mono: {
    label: 'Monospace',
    stack: "ui-monospace, 'Courier New', SFMono-Regular, monospace",
  },
};

/** Base (lg) corner radius in rem; sm/md/xl derive from it. */
export const GENERATED_RADII: Record<string, { label: string; base: number }> = {
  sharp: { label: 'None', base: 0 },
  default: { label: 'Default', base: 0.5 },
  rounded: { label: 'Rounded', base: 0.75 },
  round: { label: 'Round', base: 1 },
};

/** Neutral tints — applied via `data-base` CSS blocks (mode-correct). */
export const BASE_COLORS = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'stone', label: 'Stone' },
  { id: 'slate', label: 'Slate' },
  { id: 'olive', label: 'Olive' },
  { id: 'zinc', label: 'Zinc' },
  { id: 'warm', label: 'Warm' },
] as const;
export const DEFAULT_BASE = 'neutral';

/** Menu surface styles — applied via `data-menu`. */
export const MENU_STYLES = [
  { id: 'default', label: 'Default' },
  { id: 'translucent', label: 'Translucent' },
  { id: 'glass', label: 'Glass' },
] as const;
export const DEFAULT_MENU = 'default';

/** Icon weight — drives Lucide/Tabler `stroke-width` via the `--icon-stroke` var. */
export const ICON_WEIGHTS = [
  { id: 'thin', label: 'Thin', width: 1.5 },
  { id: 'regular', label: 'Regular', width: 2 },
  { id: 'bold', label: 'Bold', width: 2.5 },
] as const;
export const DEFAULT_ICON_WEIGHT = 'regular';

/** Icon stroke colour — semantic token mapping via `data-icon-color` on `<html>`. */
export const ICON_COLORS = [
  { id: 'default', label: 'Auto' },
  { id: 'foreground', label: 'Text' },
  { id: 'muted', label: 'Muted' },
  { id: 'primary', label: 'Primary' },
  { id: 'accent', label: 'Accent' },
  { id: 'destructive', label: 'Destructive' },
] as const;
export const DEFAULT_ICON_COLOR = 'default';

/** Icon library — Lucide is the default (bundled); the rest lazy-load on select. */
export const ICON_LIBRARIES = [
  { id: 'lucide', label: 'Lucide' },
  { id: 'tabler', label: 'Tabler' },
  { id: 'phosphor', label: 'Phosphor' },
] as const;
export const DEFAULT_ICON_LIBRARY = 'lucide';

const RADIUS_IDS = Object.keys(GENERATED_RADII);
const ICON_WEIGHT_IDS = ICON_WEIGHTS.map((w) => w.id);
const ICON_COLOR_IDS = ICON_COLORS.map((c) => c.id);
const ICON_LIBRARY_IDS = ICON_LIBRARIES.map((l) => l.id);

// ── Experience axes (CSS-var presets) ────────────────────────────────────────
// Each retones the WHOLE app through a runtime CSS variable (verified against the
// compiled output), so changing a value here applies everywhere — no per-axis
// pickers, no new components, zero bundle cost. They ride inside the generated
// look (below), so persistence + re-apply come for free.

/** Spacing density → Tailwind's master `--spacing` unit (default 0.25rem). Every
 *  padding/margin/gap/size utility is `calc(var(--spacing) * n)`, so this one knob
 *  rescales the entire UI at once. Does not change font sizes — see preset-product-design-rules.md */
export const DENSITY_SCALES: Record<string, { label: string; spacing: number }> = {
  compact: { label: 'Compact', spacing: 0.215 },
  cozy: { label: 'Comfortable', spacing: 0.25 },
  relaxed: { label: 'Relaxed', spacing: 0.265 },
  airy: { label: 'Airy', spacing: 0.285 },
};
export const DEFAULT_DENSITY = 'cozy';

/** App main content width — orthogonal to theme; persisted in useThemeStore.
 *  Product rules: docs/reference/preset-product-design-rules.md § Layout */
export const LAYOUT_WIDTHS = [
  {
    id: 'contained',
    label: 'Standard',
    description: 'Centered admin workspace (max 1536px). Default for dashboards.',
  },
  {
    id: 'full',
    label: 'Full width',
    description: 'Edge-to-edge for wide tables and analytics.',
  },
  {
    id: 'reading',
    label: 'Reading',
    description: 'Narrow column (~768px) for focused copy — Claude-style measure.',
  },
] as const;

export type LayoutWidthId = (typeof LAYOUT_WIDTHS)[number]['id'];

export const DEFAULT_LAYOUT_WIDTH: LayoutWidthId = 'contained';

const LAYOUT_WIDTH_IDS = new Set<string>(LAYOUT_WIDTHS.map((w) => w.id));

/** Coerce persisted / env values to a known layout width id. */
export function normalizeLayoutWidthId(id: string | undefined): LayoutWidthId {
  if (id && LAYOUT_WIDTH_IDS.has(id)) return id as LayoutWidthId;
  return DEFAULT_LAYOUT_WIDTH;
}

/** Validate a persisted density id, falling back to the default. */
export function normalizeDensityId(id: string | undefined): string {
  if (id && id in DENSITY_SCALES) return id;
  return DEFAULT_DENSITY;
}

/** Motion personality → the inheriting `--default-transition-*` theme vars that all
 *  `transition` utilities fall back to, so the app's base tempo + easing change at
 *  once (explicit `duration-*`/`ease-*` utilities still win locally). */
export const MOTION_PRESETS: Record<
  string,
  { label: string; duration: string; ease: string }
> = {
  instant: { label: 'Instant', duration: '0ms', ease: 'linear' },
  calm: { label: 'Calm', duration: '300ms', ease: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  smooth: { label: 'Smooth', duration: '150ms', ease: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  snappy: { label: 'Snappy', duration: '80ms', ease: 'cubic-bezier(0.34, 1.1, 0.64, 1)' },
};
export const DEFAULT_MOTION = 'smooth';

/** Surface elevation → applied via `data-elevation`; flat (border-only) … lifted
 *  (deep shadow) on the shadcn `[data-slot]` surfaces. */
export const ELEVATION_LEVELS = [
  { id: 'flat', label: 'Flat' },
  { id: 'soft', label: 'Soft' },
  { id: 'lifted', label: 'Lifted' },
  { id: 'floating', label: 'Floating' },
] as const;
export const DEFAULT_ELEVATION = 'soft';

/** Surface contrast → applied via `data-contrast` (composes with `.dark`): soft
 *  (gentler) or crisp (sharper, higher-contrast). */
export const CONTRAST_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'soft', label: 'Soft' },
  { id: 'crisp', label: 'Crisp' },
  { id: 'dim', label: 'Dim' },
  { id: 'amoled', label: 'AMOLED' },
] as const;
export const DEFAULT_CONTRAST = 'normal';

/** Colour harmony — derives the 5 chart hues from the chart anchor instead of a
 *  fixed spread, so a palette reads as intentional (monochromatic varies lightness
 *  instead of hue). */
export const HARMONY_RULES: Record<
  string,
  { label: string; offsets: readonly number[] }
> = {
  monochromatic: { label: 'Monochromatic', offsets: [0, 0, 0, 0, 0] },
  analogous: { label: 'Analogous', offsets: [-40, -20, 0, 20, 40] },
  complementary: { label: 'Complementary', offsets: [0, 25, 180, 155, 205] },
  split: { label: 'Split', offsets: [0, 30, 150, 180, 210] },
  triadic: { label: 'Triadic', offsets: [0, 120, 240, 60, 180] },
};
export const DEFAULT_HARMONY = 'triadic';

/** Accent intensity — how saturated the brand reads (OKLCH chroma). The readable
 *  foreground is computed per accent (contrast-safe), so any intensity stays legible. */
export const ACCENT_INTENSITIES: Record<string, { label: string; chroma: number }> = {
  subtle: { label: 'Subtle', chroma: 0.06 },
  muted: { label: 'Muted', chroma: 0.1 },
  balanced: { label: 'Balanced', chroma: 0.16 },
  vibrant: { label: 'Vibrant', chroma: 0.22 },
  max: { label: 'Max', chroma: 0.28 },
};
export const DEFAULT_INTENSITY = 'balanced';

/** Surface separation — how cards divide from the page: border (default) or shadow
 *  (the border fades, composing with elevation). */
export const SEPARATION_STRATEGIES = [
  { id: 'border', label: 'Border' },
  { id: 'hairline', label: 'Hairline' },
  { id: 'shadow', label: 'Shadow' },
] as const;
export const DEFAULT_SEPARATION = 'border';

/** Maps retired separation ids (e.g. removed `tint`) to a supported strategy. */
export function normalizeSeparationId(id: string | undefined): string {
  if (id === 'tint') return DEFAULT_SEPARATION;
  if (id && (SEPARATION_IDS as readonly string[]).includes(id)) return id;
  return DEFAULT_SEPARATION;
}

/** Shape language — per-component radius beyond the global radius: uniform, pill
 *  (round buttons/inputs), or sharp (square cards/inputs). */
export const SHAPE_LANGUAGES = [
  { id: 'uniform', label: 'Uniform' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'pill', label: 'Pill' },
  { id: 'sharp', label: 'Sharp' },
] as const;
export const DEFAULT_SHAPE = 'uniform';

/** Modular type scale — ratio between adjacent --text-* sizes (default keeps
 *  Tailwind's stock scale untouched). Product floors: docs/reference/preset-product-design-rules.md § Type scale */
export const TYPE_SCALES: Record<string, { label: string; ratio: number }> = {
  tight: { label: 'Tight', ratio: 1.125 },
  compact: { label: 'Compact', ratio: 1.15 },
  default: { label: 'Default', ratio: 1.2 },
  grand: { label: 'Grand', ratio: 1.333 },
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: 1.414 is the standard augmented-fourth type-scale ratio, not √2
  display: { label: 'Display', ratio: 1.414 },
};
export const DEFAULT_TYPE_SCALE = 'default';

/** Focus-ring personality — ring (stock), glow (soft accent halo), or underline. */
export const FOCUS_RINGS = [
  { id: 'ring', label: 'Ring' },
  { id: 'glow', label: 'Glow' },
  { id: 'offset', label: 'Offset' },
  { id: 'underline', label: 'Underline' },
  { id: 'inset', label: 'Inset' },
] as const;
export const DEFAULT_FOCUS = 'ring';

/** --text-* steps for the modular type scale (anchor = --text-base = 1rem). */
const TEXT_SCALE_STEPS: ReadonlyArray<readonly [string, number]> = [
  ['--text-xs', -2],
  ['--text-sm', -1],
  ['--text-base', 0],
  ['--text-lg', 1],
  ['--text-xl', 2],
  ['--text-2xl', 3],
  ['--text-3xl', 4],
  ['--text-4xl', 5],
];

/** Curated heading↔body font pairings — generation picks one so headings get a
 *  distinct-but-harmonious voice instead of a random clash. */
export const FONT_PAIRINGS: ReadonlyArray<{ body: string; heading: string }> = [
  { body: 'inter', heading: 'inter' },
  { body: 'inter', heading: 'grotesk' },
  { body: 'humanist', heading: 'grotesk' },
  { body: 'geometric', heading: 'geometric' },
  { body: 'serif', heading: 'serif' },
  { body: 'inter', heading: 'serif' },
  { body: 'humanist', heading: 'slab' },
  { body: 'grotesk', heading: 'mono' },
];

const DENSITY_IDS = Object.keys(DENSITY_SCALES);
const MOTION_IDS = Object.keys(MOTION_PRESETS);
const ELEVATION_IDS = ELEVATION_LEVELS.map((e) => e.id);
const CONTRAST_IDS = CONTRAST_MODES.map((c) => c.id);
const HARMONY_IDS = Object.keys(HARMONY_RULES);
const INTENSITY_IDS = Object.keys(ACCENT_INTENSITIES);
const SEPARATION_IDS = SEPARATION_STRATEGIES.map((s) => s.id);
const SHAPE_IDS = SHAPE_LANGUAGES.map((s) => s.id);
const TYPE_SCALE_IDS = Object.keys(TYPE_SCALES);
const FOCUS_IDS = FOCUS_RINGS.map((f) => f.id);

// ── Seeded generation ────────────────────────────────────────────────────────
// The whole look derives from a single 32-bit seed, so it's reproducible and
// shareable (`?theme=<seed>`). Generation draws from `rng`, which is swapped to a
// seeded PRNG for the duration of generateSeededTheme — every other helper keeps
// calling rng() and needs no change.

/** Deterministic PRNG (mulberry32): same seed → same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The source of randomness generation draws from (seeded inside generateSeededTheme). */
let rng: () => number = Math.random;

/** A fresh random 32-bit seed (the only Math.random in the shuffle path). */
export function randomSeed(): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic theme seed, not security
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

// ── Generated look ───────────────────────────────────────────────────────────

/** A full generated look — accent + chart + body/heading font + radius, plus the
 *  experience axes (density / motion / elevation / contrast) that retone the whole
 *  app via CSS-var presets. Every field rides in `customTheme`, so it persists and
 *  re-applies for free — no extra store fields, no extra pickers. */
export interface GeneratedTheme {
  hue: number;
  chartHue: number;
  bodyFontId: string;
  headingFontId: string;
  radiusId: string;
  densityId: string;
  motionId: string;
  elevationId: string;
  contrastId: string;
  harmonyId: string;
  intensityId: string;
  separationId: string;
  shapeId: string;
  typeScaleId: string;
  focusId: string;
}

const DEFAULT_LOOK: GeneratedTheme = {
  hue: 290,
  chartHue: 290,
  bodyFontId: 'inter',
  headingFontId: 'inter',
  radiusId: 'default',
  densityId: DEFAULT_DENSITY,
  motionId: DEFAULT_MOTION,
  elevationId: DEFAULT_ELEVATION,
  contrastId: DEFAULT_CONTRAST,
  harmonyId: DEFAULT_HARMONY,
  intensityId: DEFAULT_INTENSITY,
  separationId: DEFAULT_SEPARATION,
  shapeId: DEFAULT_SHAPE,
  typeScaleId: DEFAULT_TYPE_SCALE,
  focusId: DEFAULT_FOCUS,
};

/** Fill a partial look with defaults (a look may omit any axis). */
export function normalizeLook(look: Partial<GeneratedTheme> | null): GeneratedTheme {
  const l = look ?? {};
  return {
    hue: l.hue ?? DEFAULT_LOOK.hue,
    chartHue: l.chartHue ?? DEFAULT_LOOK.chartHue,
    bodyFontId: l.bodyFontId ?? DEFAULT_LOOK.bodyFontId,
    headingFontId: l.headingFontId ?? DEFAULT_LOOK.headingFontId,
    radiusId: l.radiusId ?? DEFAULT_LOOK.radiusId,
    densityId: normalizeDensityId(l.densityId),
    motionId: l.motionId ?? DEFAULT_LOOK.motionId,
    elevationId: l.elevationId ?? DEFAULT_LOOK.elevationId,
    contrastId: l.contrastId ?? DEFAULT_LOOK.contrastId,
    harmonyId: l.harmonyId ?? DEFAULT_LOOK.harmonyId,
    intensityId: l.intensityId ?? DEFAULT_LOOK.intensityId,
    separationId: normalizeSeparationId(l.separationId),
    shapeId: l.shapeId ?? DEFAULT_LOOK.shapeId,
    typeScaleId: l.typeScaleId ?? DEFAULT_LOOK.typeScaleId,
    focusId: l.focusId ?? DEFAULT_LOOK.focusId,
  };
}

const ACCENT_VARS = [
  '--color-primary',
  '--color-ring',
  '--color-sidebar-primary',
  '--color-sidebar-ring',
] as const;
const ACCENT_FG_VARS = [
  '--color-primary-foreground',
  '--color-sidebar-primary-foreground',
] as const;
const SHAPE_VARS = [
  '--font-sans',
  '--font-heading',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
] as const;
const CHART_VARS = [
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
] as const;

/** Experience-axis vars set inline by the generated look (cleared with it). */
const EXPERIENCE_VARS = [
  '--spacing',
  '--default-transition-duration',
  '--default-transition-timing-function',
  ...TEXT_SCALE_STEPS.map(([v]) => v),
];

/** Remove any inline generated vars (accent/font/radius/chart/experience) and the
 *  generated data-axes. Leaves the orthogonal `data-base` / `data-menu` untouched. */
function clearGeneratedTheme(): void {
  const root = document.documentElement;
  for (const v of [
    ...ACCENT_VARS,
    ...ACCENT_FG_VARS,
    ...SHAPE_VARS,
    ...CHART_VARS,
    ...EXPERIENCE_VARS,
  ]) {
    root.style.removeProperty(v);
  }
  delete root.dataset.elevation;
  delete root.dataset.contrast;
  delete root.dataset.separation;
  delete root.dataset.shape;
  delete root.dataset.focus;
}

/**
 * Apply a named preset via `data-theme` (cleared for the default), clearing any
 * generated accent/font/radius/chart vars first. Unknown ids fall back to the
 * default. Pairs with the `.dark` class; orthogonal to base colour + menu.
 */
export function applyThemePreset(id: string): void {
  clearGeneratedTheme();
  const root = document.documentElement;
  const preset = isThemePreset(id) ? id : DEFAULT_PRESET;
  if (preset === DEFAULT_PRESET) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preset;
  }
}

function norm(hue: number): number {
  return ((Math.round(hue) % 360) + 360) % 360;
}

/** OKLCH → WCAG relative luminance (via linear sRGB), clamped to gamut. */
function oklchLuminance(L: number, C: number, H: number): number {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/**
 * Contrast-safe foreground for an accent — the near-white or near-black with the
 * higher WCAG contrast, so generated accent buttons are never unreadable.
 */
export function accentForeground(L: number, C: number, H: number): string {
  const y = oklchLuminance(L, C, H);
  const withWhite = 1.05 / (y + 0.05);
  const withBlack = (y + 0.05) / 0.05;
  return withWhite >= withBlack ? 'oklch(0.985 0 0)' : 'oklch(0.205 0 0)';
}

/** OKLCH → #rrggbb (gamut-clamped) — for binding a native `<input type="color">`. */
export function oklchToHex(L: number, C: number, H: number): string {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const lc = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  const hex = channels
    .map((u) => {
      const lin = Math.min(1, Math.max(0, u));
      const srgb = lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
  return `#${hex}`;
}

/** #rrggbb → OKLCH hue (0–359), so a picked colour maps into the hue-based look. */
export function hexToHue(hex: string): number {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!digits) return 0;
  const int = Number.parseInt(digits, 16);
  const toLin = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  const r = toLin(((int >> 16) & 255) / 255);
  const g = toLin(((int >> 8) & 255) / 255);
  const b = toLin((int & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.round((Math.atan2(B, A) * 180) / Math.PI) % 360) + 360) % 360;
}

/** A random accent hue (0–359). */
export function randomThemeHue(): number {
  return Math.floor(rng() * 360);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** A fresh random hue at least ~60° from `current`, so each shuffle reads new. */
export function nextRandomHue(current: number | null): number {
  let hue = randomThemeHue();
  for (let i = 0; current != null && hueDistance(hue, current) < 60 && i < 8; i += 1) {
    hue = randomThemeHue();
  }
  return hue;
}

/** Pick a random id, avoiding `exclude` when the pool allows it. */
function pickId(ids: readonly string[], exclude: string | null): string {
  const pool =
    exclude !== null && ids.length > 1 ? ids.filter((id) => id !== exclude) : ids;
  const idx = Math.floor(rng() * pool.length);
  // eslint-disable-next-line security/detect-object-injection -- idx is a bounded random index into a local string[]
  return pool[idx] ?? ids[0] ?? DEFAULT_PRESET;
}

/** Pick a curated heading↔body font pairing, avoiding the current combo. */
function pickPairing(current: GeneratedTheme | null): { body: string; heading: string } {
  const key = current ? `${current.bodyFontId}/${current.headingFontId}` : null;
  const pool =
    key !== null && FONT_PAIRINGS.length > 1
      ? FONT_PAIRINGS.filter((p) => `${p.body}/${p.heading}` !== key)
      : FONT_PAIRINGS;
  const idx = Math.floor(rng() * pool.length);
  // eslint-disable-next-line security/detect-object-injection -- idx is a bounded random index into a local array
  return pool[idx] ?? FONT_PAIRINGS[0] ?? { body: 'inter', heading: 'inter' };
}

/** Build a full look from the current `rng` (uniform across every axis). */
function buildLook(): GeneratedTheme {
  const pairing = pickPairing(null);
  return {
    hue: randomThemeHue(),
    chartHue: randomThemeHue(),
    bodyFontId: pairing.body,
    headingFontId: pairing.heading,
    radiusId: pickId(RADIUS_IDS, null),
    densityId: pickId(DENSITY_IDS, null),
    motionId: pickId(MOTION_IDS, null),
    elevationId: pickId(ELEVATION_IDS, null),
    contrastId: pickId(CONTRAST_IDS, null),
    harmonyId: pickId(HARMONY_IDS, null),
    intensityId: pickId(INTENSITY_IDS, null),
    separationId: pickId(SEPARATION_IDS, null),
    shapeId: pickId(SHAPE_IDS, null),
    typeScaleId: pickId(TYPE_SCALE_IDS, null),
    focusId: pickId(FOCUS_IDS, null),
  };
}

/** Derive the full look from a seed — pure + reproducible (same seed → same look). */
export function generateSeededTheme(seed: number): GeneratedTheme {
  const prev = rng;
  rng = mulberry32(seed >>> 0);
  try {
    return buildLook();
  } finally {
    rng = prev;
  }
}

/**
 * Generate a fresh full look from a new random seed. Seeding (vs ad-hoc
 * Math.random) makes every shuffle reproducible + shareable, while still feeling
 * like a different product each time.
 */
export function generateTheme(_current: GeneratedTheme | null): GeneratedTheme {
  return generateSeededTheme(randomSeed());
}

// ── Per-section rolls ────────────────────────────────────────────────────────
// Re-roll just one card's axes (interactive, not seed-bound) — returned as a
// partial look for updateLook(), which clears the seed since the result no longer
// maps to one.

/** Roll the Colour axes: accent + chart hue, harmony, intensity. */
export function rollColour(): Partial<GeneratedTheme> {
  return {
    hue: randomThemeHue(),
    chartHue: randomThemeHue(),
    harmonyId: pickId(HARMONY_IDS, null),
    intensityId: pickId(INTENSITY_IDS, null),
  };
}

/** Roll the Type & shape axes: font pairing, radius, type scale, shape language. */
export function rollTypography(): Partial<GeneratedTheme> {
  const pairing = pickPairing(null);
  return {
    bodyFontId: pairing.body,
    headingFontId: pairing.heading,
    radiusId: pickId(RADIUS_IDS, null),
    typeScaleId: pickId(TYPE_SCALE_IDS, null),
    shapeId: pickId(SHAPE_IDS, null),
  };
}

/** Roll the Surface & motion axes: density, motion, elevation, separation, contrast, focus. */
export function rollSurface(): Partial<GeneratedTheme> {
  return {
    densityId: pickId(DENSITY_IDS, null),
    motionId: pickId(MOTION_IDS, null),
    elevationId: pickId(ELEVATION_IDS, null),
    separationId: pickId(SEPARATION_IDS, null),
    contrastId: pickId(CONTRAST_IDS, null),
    focusId: pickId(FOCUS_IDS, null),
  };
}

function chance(probability: number): boolean {
  return rng() < probability;
}

/**
 * Roll the orthogonal icon axes during a shuffle: ~50% of the time a fresh
 * weight, ~35% a different library — so a shuffle sometimes restyles the icon
 * weight, sometimes swaps the whole set, sometimes both, sometimes neither.
 */
export function shuffleIcons(current: {
  weight: string;
  library: string;
  color: string;
}): { weight: string; library: string; color: string } {
  return {
    weight: chance(0.5) ? pickId(ICON_WEIGHT_IDS, current.weight) : current.weight,
    library: chance(0.35) ? pickId(ICON_LIBRARY_IDS, current.library) : current.library,
    color: chance(0.3) ? pickId(ICON_COLOR_IDS, current.color) : current.color,
  };
}

/** How many AuthLayout preview designs exist (TEMP — see AuthLayout variants). */
export const AUTH_VARIANT_COUNT = 3;

/**
 * TEMP (auth-layout preview): a different design index in 0..N-1. Remove
 * together with the `authVariant` store field + the AuthLayout variants.
 */
export function nextAuthVariant(current: number): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic layout preview, not security
  const v = Math.floor(Math.random() * AUTH_VARIANT_COUNT);
  return v === current ? (v + 1) % AUTH_VARIANT_COUNT : v;
}

/** How many AppLayout preview shells exist (TEMP — see AppLayout variants). */
export const APP_VARIANT_COUNT = 3;

/**
 * TEMP (app-layout preview): a different shell index in 0..N-1. Remove together
 * with the `appVariant` store field + the AppLayout variants.
 */
export function nextAppVariant(current: number): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic layout preview, not security
  const v = Math.floor(Math.random() * APP_VARIANT_COUNT);
  return v === current ? (v + 1) % APP_VARIANT_COUNT : v;
}

/** How many PublicLayout preview shells exist (TEMP — see PublicLayout variants). */
export const PUBLIC_VARIANT_COUNT = 3;

/**
 * TEMP (public-layout preview): a different shell index in 0..N-1. Remove together
 * with the `publicVariant` store field + the PublicLayout variants.
 */
export function nextPublicVariant(current: number): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic layout preview, not security
  const v = Math.floor(Math.random() * PUBLIC_VARIANT_COUNT);
  return v === current ? (v + 1) % PUBLIC_VARIANT_COUNT : v;
}

/**
 * Dashboard arrangement variants (TEMP preview — see Dashboard variants). The
 * store holds the active index; labels are product nomenclature (untranslated,
 * like the font/width catalogs) for the Appearance picker.
 */
export const DASHBOARD_VARIANTS_CATALOG = [
  { id: 'classic', label: 'Classic', description: 'Onboarding-first single column' },
  {
    id: 'command',
    label: 'Command center',
    description: 'Two columns with a tools rail',
  },
  { id: 'pulse', label: 'Pulse', description: 'Analytics-first with the gauge band' },
  { id: 'bento', label: 'Bento', description: 'Everything at a glance, magazine grid' },
] as const;

/** How many Dashboard arrangement variants exist (TEMP — see Dashboard variants). */
export const DASHBOARD_VARIANT_COUNT = DASHBOARD_VARIANTS_CATALOG.length;

/**
 * TEMP (dashboard preview): a different arrangement index in 0..N-1. Remove
 * together with the `dashboardVariant` store field + the Dashboard variants.
 */
export function nextDashboardVariant(current: number): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic layout preview, not security
  const v = Math.floor(Math.random() * DASHBOARD_VARIANT_COUNT);
  return v === current ? (v + 1) % DASHBOARD_VARIANT_COUNT : v;
}

/**
 * TEMP (toast design preview): the available custom-toast designs. The store
 * holds the active index; `CustomToast` maps it to one of these. Remove together
 * with the `toastVariant` store field + the CustomToast design map.
 */
export const TOAST_VARIANTS = [
  'tint',
  'solid',
  'outline',
  'accent',
  'minimal',
  'glass',
] as const;
export type ToastVariant = (typeof TOAST_VARIANTS)[number];
export const DEFAULT_TOAST_VARIANT = 0;

/** TEMP (toast preview): a different toast-design index than the current one. */
export function nextToastVariant(current: number): number {
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic toast preview, not security
  const v = Math.floor(Math.random() * TOAST_VARIANTS.length);
  return v === current ? (v + 1) % TOAST_VARIANTS.length : v;
}

/**
 * TEMP (toast preview): where toasts appear (a subset of sonner's positions, so
 * people can pick a spot they'll notice). The store holds the active value.
 */
export const TOAST_POSITIONS = [
  'top-right',
  'top-center',
  'top-left',
  'bottom-right',
  'bottom-center',
  'bottom-left',
] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];
export const DEFAULT_TOAST_POSITION: ToastPosition = 'top-right';

/** Human labels for toast position picker (Appearance panel). */
export const TOAST_POSITION_LABELS: Record<ToastPosition, string> = {
  'top-right': 'Top right',
  'top-center': 'Top center',
  'top-left': 'Top left',
  'bottom-right': 'Bottom right',
  'bottom-center': 'Bottom center',
  'bottom-left': 'Bottom left',
};

/** TEMP (toast preview): a different toast position than the current one. */
export function nextToastPosition(current: string): ToastPosition {
  const others = TOAST_POSITIONS.filter((p) => p !== current);
  // eslint-disable-next-line sonarjs/pseudo-random -- cosmetic toast preview, not security
  return others[Math.floor(Math.random() * others.length)] ?? DEFAULT_TOAST_POSITION;
}

/**
 * TEMP shuffle switches — gate which PREVIEW axes `shuffleTheme()` rolls. The core
 * look (accent / chart / fonts / radius / icons) ALWAYS shuffles; these only
 * toggle the temporary previews, and are OFF by default so a normal shuffle stays
 * calm. Flip on/off on request; delete the whole block (+ the gated axes) when the
 * previews are retired.
 */
export const SHUFFLE_TEMP = {
  /** Cycle the AuthLayout (login screen) preview design on shuffle. */
  authLayout: true,
  /**
   * Cycle the AppLayout (app shell) preview design on shuffle.
   *
   * OFF. Every other axis here is cosmetic — colour, type, radius, toast style —
   * and repaints in place. This one is structural: each shell is a different
   * component owning its own `<main>`, so rolling it unmounts the routed island
   * and takes a chart range, a calendar selection and a carousel position with
   * it. A theme shuffle is not a reason to throw away the user's page state
   * (SHELL-5). The shell variants still exist and are still selectable — they
   * are simply no longer part of a cosmetic dice roll.
   */
  appLayout: false,
  /** Cycle the PublicLayout preview design on shuffle. */
  publicLayout: true,
  /** Cycle the Dashboard arrangement preview on shuffle. */
  dashboard: true,
  /** Roll the custom-toast design on shuffle. */
  toastVariant: true,
  /** Roll the toast position on shuffle. */
  toastPosition: true,
};

/**
 * Apply a generated full look (shadcn-create-style): accent colour, chart
 * palette, body + heading fonts, and corner radius — all inline on `<html>` so
 * it overrides the base `@theme` tokens in both light and dark (CSP-safe; no
 * injected `<style>`, no remote fonts). Orthogonal to base colour + menu.
 */
/** Set/remove `data-<name>` for an axis (removed at its default value). */
function applyDataAxis(
  root: HTMLElement,
  name: string,
  value: string,
  fallback: string,
): void {
  if (value && value !== fallback) {
    root.setAttribute(`data-${name}`, value);
  } else {
    root.removeAttribute(`data-${name}`);
  }
}

/** Accent colour + contrast-safe foreground (intensity → OKLCH chroma). */
function applyAccent(root: HTMLElement, theme: GeneratedTheme): void {
  const hue = norm(theme.hue);
  const chroma = ACCENT_INTENSITIES[theme.intensityId]?.chroma ?? 0.16;
  const accent = `oklch(0.58 ${chroma} ${hue})`;
  // Contrast-safe: pick the readable foreground for THIS accent (a11y guardrail).
  const onAccent = accentForeground(0.58, chroma, hue);
  for (const v of ACCENT_VARS) root.style.setProperty(v, accent);
  for (const v of ACCENT_FG_VARS) root.style.setProperty(v, onAccent);
}

/** 5-series chart palette derived from the chart anchor via the harmony rule. */
function applyChartPalette(root: HTMLElement, theme: GeneratedTheme): void {
  const chartBase = norm(theme.chartHue);
  const offsets = HARMONY_RULES[theme.harmonyId]?.offsets ?? [0, 120, 240, 60, 180];
  const monochrome = theme.harmonyId === 'monochromatic';
  offsets.forEach((offset, i) => {
    const lightness = monochrome ? 0.45 + i * 0.1 : 0.64;
    root.style.setProperty(
      `--color-chart-${i + 1}`,
      `oklch(${lightness} 0.17 ${norm(chartBase + offset)})`,
    );
  });
}

/** Modular type scale → recompute --text-* (default keeps Tailwind's stock scale). */
function applyTypeScale(root: HTMLElement, theme: GeneratedTheme): void {
  const ratio = TYPE_SCALES[theme.typeScaleId]?.ratio;
  if (ratio && theme.typeScaleId !== DEFAULT_TYPE_SCALE) {
    for (const [v, step] of TEXT_SCALE_STEPS) {
      root.style.setProperty(v, `${(ratio ** step).toFixed(4)}rem`);
    }
  } else {
    for (const [v] of TEXT_SCALE_STEPS) root.style.removeProperty(v);
  }
}

/**
 * Apply a full generated look as inline CSS vars + data-axes on <html>. Pairs
 * with clearGeneratedTheme (run by applyThemePreset). Orthogonal to base/menu.
 */
export function applyGeneratedTheme(input: GeneratedTheme): void {
  const theme = normalizeLook(input);
  const root = document.documentElement;
  delete root.dataset.theme;

  applyAccent(root, theme);

  root.style.setProperty(
    '--font-sans',
    GENERATED_FONTS[theme.bodyFontId]?.stack ?? DEFAULT_FONT_STACK,
  );
  root.style.setProperty(
    '--font-heading',
    GENERATED_FONTS[theme.headingFontId]?.stack ?? DEFAULT_FONT_STACK,
  );

  const base = GENERATED_RADII[theme.radiusId]?.base ?? 0.5;
  root.style.setProperty('--radius-sm', `${base * 0.5}rem`);
  root.style.setProperty('--radius-md', `${base * 0.75}rem`);
  root.style.setProperty('--radius-lg', `${base}rem`);
  root.style.setProperty('--radius-xl', `${base * 1.5}rem`);

  applyChartPalette(root, theme);

  // Density → master spacing unit (every spacing utility is calc(var(--spacing)*n)).
  const spacing = DENSITY_SCALES[theme.densityId]?.spacing ?? 0.25;
  root.style.setProperty('--spacing', `${spacing}rem`);

  // Motion → base transition tempo + easing (inheriting fallback theme vars).
  // Honour OS reduced-motion without mutating the stored preference.
  const motionId =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : theme.motionId;
  const motion = MOTION_PRESETS[motionId];
  root.style.setProperty('--default-transition-duration', motion?.duration ?? '150ms');
  root.style.setProperty(
    '--default-transition-timing-function',
    motion?.ease ?? 'cubic-bezier(0.4, 0, 0.2, 1)',
  );

  // Elevation / contrast / separation / shape / focus → data attributes
  // (index.css blocks do the rest; omitted at their defaults).
  applyDataAxis(root, 'elevation', theme.elevationId, DEFAULT_ELEVATION);
  applyDataAxis(root, 'contrast', theme.contrastId, DEFAULT_CONTRAST);
  applyDataAxis(root, 'separation', theme.separationId, DEFAULT_SEPARATION);
  applyDataAxis(root, 'shape', theme.shapeId, DEFAULT_SHAPE);
  applyDataAxis(root, 'focus', theme.focusId, DEFAULT_FOCUS);
  applyTypeScale(root, theme);
}

/** Apply a neutral base colour via `data-base` (cleared for `neutral`/unknown). */
export function applyBaseColor(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_BASE || !BASE_COLORS.some((b) => b.id === id)) {
    delete root.dataset.base;
  } else {
    root.dataset.base = id;
  }
}

/** Apply a menu surface style via `data-menu` (cleared for `default`/unknown). */
export function applyMenuStyle(id: string): void {
  const root = document.documentElement;
  if (id === 'translucent' || id === 'glass') {
    root.dataset.menu = id;
  } else {
    delete root.dataset.menu;
  }
}

/** Apply an icon weight via `--icon-stroke` (cleared for the regular default). */
export function applyIconWeight(id: string): void {
  const root = document.documentElement;
  const weight = ICON_WEIGHTS.find((w) => w.id === id);
  if (!weight || weight.id === DEFAULT_ICON_WEIGHT) {
    root.style.removeProperty('--icon-stroke');
  } else {
    root.style.setProperty('--icon-stroke', String(weight.width));
  }
}

/** Apply icon colour via `data-icon-color` (cleared for the default). */
export function applyIconColor(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_ICON_COLOR || !ICON_COLORS.some((c) => c.id === id)) {
    delete root.dataset.iconColor;
  } else {
    root.dataset.iconColor = id;
  }
}
