import {
  ACCENT_COLORS,
  GENERATED_FONTS,
  GENERATED_RADII,
  type GeneratedTheme,
} from '@/shared/theme/index.ts';

/** The accent catalog id whose hue matches, or `null` for a custom hue. */
export function accentIdForHue(hue: number): string | null {
  return ACCENT_COLORS.find((c) => c.hue === hue)?.id ?? null;
}

/** Human summary of a custom look ("Inter · Rounded"); empty parts dropped. */
export function customLookLabel(bodyFontId: string, radiusId: string): string {
  return [GENERATED_FONTS[bodyFontId]?.label, GENERATED_RADII[radiusId]?.label]
    .filter(Boolean)
    .join(' · ');
}

/** Derive the selected picker ids + a summary label from the current look. */
export function lookFields(look: GeneratedTheme | null) {
  const bodyFontId = look?.bodyFontId ?? 'inter';
  const radiusId = look?.radiusId ?? 'default';
  return {
    accentId: look ? accentIdForHue(look.hue) : null,
    chartId: look ? accentIdForHue(look.chartHue) : null,
    bodyFontId,
    headingFontId: look?.headingFontId ?? 'inter',
    radiusId,
    customLook: look ? customLookLabel(bodyFontId, radiusId) : '',
  };
}
