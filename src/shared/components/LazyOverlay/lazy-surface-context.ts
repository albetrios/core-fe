import { createContext, useContext } from 'react';

/**
 * True inside an overlay that REPLACED a pending placeholder.
 *
 * The placeholder already painted this exact surface, so the arriving component
 * must not replay its entrance: `zoom-in-95` / `fade-in` / `slide-in` restart it
 * from transparent at 95% scale, which reads as the panel blinking out and
 * popping back in at a different size. Measured on the settings modal as three
 * consecutive frames — skeleton `op=1.00 960x640` → gone → real `op=0.00
 * 912x608` → real `op=1.00 960x640`.
 *
 * False when the chunk was already in memory and no placeholder was shown: there
 * the overlay genuinely IS appearing, and its entrance animation is correct.
 *
 * Lives in its own module so `LazyOverlay.tsx` keeps exporting only components
 * (react-refresh/only-export-components).
 */
export const PlaceholderPrecededContext = createContext(false);

/** Whether a pending placeholder preceded this overlay. */
export function useSkipEnterAnimation(): boolean {
  return useContext(PlaceholderPrecededContext);
}

/**
 * Spread onto the surface that owns the entrance animation. An inline style
 * rather than a class: the entrance comes from several utilities across three
 * different components (`data-[state=open]:animate-in`, `animate-in slide-in-*`),
 * and `animation: none` cancels every one of them without class-merge roulette.
 */
export function useEnterAnimationProps(): { style?: { animation: 'none' } } {
  return useSkipEnterAnimation() ? { style: { animation: 'none' } } : {};
}
