import { cn } from '@/lib/utils.ts';
import { type LayoutWidthId, normalizeLayoutWidthId } from '@/shared/theme/presets.ts';

/**
 * Effective layout width: deploy env wins when `forced` is set; otherwise user
 * preference from {@link useThemeStore}.
 */
export function resolveEffectiveLayoutWidth(
  forced: LayoutWidthId | null,
  preference: string | undefined,
): LayoutWidthId {
  if (forced !== null) return forced;
  return normalizeLayoutWidthId(preference);
}

/** Tailwind classes for the inner wrapper inside `#main-content`. */
export function layoutMainClassName(width: LayoutWidthId): string {
  return cn(
    'w-full',
    // Keeps growing past `2xl`: capped at 1536px, the column covered well under
    // half of a 3440px ultrawide and no longer lined up with the header above it.
    width === 'contained' &&
      'mx-auto max-w-screen-2xl 3xl:max-w-[112rem] 4xl:max-w-[136rem]',
    width === 'reading' && 'mx-auto max-w-3xl',
  );
}

export type { LayoutWidthId };
