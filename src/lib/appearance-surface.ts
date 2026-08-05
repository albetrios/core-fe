import { cn } from '@/lib/utils.ts';

/**
 * Appearance-studio surfaces — always use theme CSS vars (`--radius-*`) so mode
 * tiles, language pickers, and option pills track the active corner-radius axis.
 */

/** Large selectable tile (mode cards, language rows). */
export const appearanceTileClassName =
  'bg-background relative border text-start transition-all outline-none focus-visible:outline-hidden rounded-[var(--radius-lg)]';

export const appearanceTileActiveClassName = 'border-primary ring-primary/20 ring-2';
export const appearanceTileIdleClassName = 'border-border hover:border-primary/50';

/** Compact option pill (presets, formats, axis choices). */
export const appearanceChoiceClassName =
  'border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:outline-hidden rounded-[var(--radius-md)]';

/** Mode card — column layout with padding. */
export const appearanceModeCardClassName = cn(
  appearanceTileClassName,
  'flex flex-col items-start gap-2 p-4',
);

/** Language / compact row tile. */
export const appearanceRowTileClassName = cn(
  appearanceTileClassName,
  'flex items-center justify-between gap-2 px-3 py-2.5 text-sm',
);

/** Preview / icon sample well. */
export const appearancePreviewWellClassName =
  'bg-muted/40 flex items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed px-4 py-3';
