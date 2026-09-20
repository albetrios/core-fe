/**
 * Doc-sync assertions for theme catalogs — built from the same constants as
 * Appearance / Shuffle (`presets.ts`). `pnpm validate:theme-catalog` reads this.
 */
import {
  ACCENT_COLORS,
  ACCENT_INTENSITIES,
  BASE_COLORS,
  CONTRAST_MODES,
  DENSITY_SCALES,
  ELEVATION_LEVELS,
  FOCUS_RINGS,
  GENERATED_FONTS,
  GENERATED_RADII,
  HARMONY_RULES,
  ICON_COLORS,
  ICON_LIBRARIES,
  ICON_WEIGHTS,
  MENU_STYLES,
  MOTION_PRESETS,
  SEPARATION_STRATEGIES,
  SHAPE_LANGUAGES,
  THEME_PRESETS,
  TOAST_POSITIONS,
  TOAST_VARIANTS,
  TYPE_SCALES,
} from './presets.ts';

interface DocAssertion {
  label: string;
  mustInclude: readonly string[];
  mustExclude?: readonly string[];
}

function ids<const T extends readonly { id: string }[]>(items: T): string[] {
  return items.map((item) => item.id);
}

function recordKeys(rec: Record<string, { label: string }>): string[] {
  return Object.keys(rec);
}

/** Canonical option ids per axis — single source for doc validation. */
export const CATALOG_OPTION_IDS = {
  namedPresets: ids(THEME_PRESETS),
  accentColors: ids(ACCENT_COLORS),
  baseColors: ids(BASE_COLORS),
  menuStyles: ids(MENU_STYLES),
  iconWeights: ids(ICON_WEIGHTS),
  iconColors: ids(ICON_COLORS),
  iconLibraries: ids(ICON_LIBRARIES),
  radii: recordKeys(GENERATED_RADII),
  fonts: recordKeys(GENERATED_FONTS),
  density: recordKeys(DENSITY_SCALES),
  motion: recordKeys(MOTION_PRESETS),
  elevation: ids(ELEVATION_LEVELS),
  contrast: ids(CONTRAST_MODES),
  harmony: recordKeys(HARMONY_RULES),
  intensity: recordKeys(ACCENT_INTENSITIES),
  separation: ids(SEPARATION_STRATEGIES),
  shape: ids(SHAPE_LANGUAGES),
  typeScale: recordKeys(TYPE_SCALES),
  focus: ids(FOCUS_RINGS),
  toastVariants: [...TOAST_VARIANTS],
  toastPositions: [...TOAST_POSITIONS],
} as const;

/** @public Loaded by tooling/validate/theme-catalog.mjs through a computed import. */
export const THEME_DOC_ASSERTIONS: Record<string, DocAssertion[]> = {
  'docs/reference/theming.md': [
    {
      label: 'base colours',
      mustInclude: CATALOG_OPTION_IDS.baseColors,
    },
    {
      label: 'menu styles',
      mustInclude: CATALOG_OPTION_IDS.menuStyles,
    },
    {
      label: 'elevation',
      mustInclude: CATALOG_OPTION_IDS.elevation,
    },
    {
      label: 'contrast',
      mustInclude: CATALOG_OPTION_IDS.contrast,
      mustExclude: ['default, high'],
    },
    {
      label: 'separation',
      mustInclude: CATALOG_OPTION_IDS.separation,
    },
    {
      label: 'shape',
      mustInclude: CATALOG_OPTION_IDS.shape,
    },
    {
      label: 'density',
      mustInclude: CATALOG_OPTION_IDS.density,
      mustExclude: ['compact, default, airy'],
    },
    {
      label: 'motion',
      mustInclude: CATALOG_OPTION_IDS.motion,
      mustExclude: ['default, fluid'],
    },
    {
      label: 'type scale',
      mustInclude: CATALOG_OPTION_IDS.typeScale,
    },
    {
      label: 'focus ring',
      mustInclude: CATALOG_OPTION_IDS.focus,
    },
    {
      label: 'toast variants',
      mustInclude: CATALOG_OPTION_IDS.toastVariants,
    },
    {
      label: 'harmony',
      mustInclude: CATALOG_OPTION_IDS.harmony,
    },
    {
      label: 'accent intensity',
      mustInclude: CATALOG_OPTION_IDS.intensity,
    },
    {
      label: 'icon colour',
      mustInclude: CATALOG_OPTION_IDS.iconColors,
    },
  ],
  'docs/reference/design.md': [
    {
      label: 'accent catalog',
      mustInclude: CATALOG_OPTION_IDS.accentColors,
    },
    {
      label: 'base tint',
      mustInclude: ['neutral', 'stone', 'slate', 'zinc', 'warm', 'olive'],
    },
    {
      label: 'menu styles',
      mustInclude: ['translucent', 'glass'],
    },
    {
      label: 'appearance axes',
      mustInclude: ['density', 'motion', 'elevation', 'harmony', 'intensity'],
    },
    {
      label: 'catalog source of truth',
      mustInclude: ['presets.ts', 'theme-axis-audit-playbook.md'],
    },
  ],
  'docs/reference/theme-axis-audit-playbook.md': [
    {
      label: 'base colours',
      mustInclude: CATALOG_OPTION_IDS.baseColors,
    },
    {
      label: 'elevation',
      mustInclude: CATALOG_OPTION_IDS.elevation,
    },
    {
      label: 'contrast',
      mustInclude: CATALOG_OPTION_IDS.contrast,
    },
  ],
};
