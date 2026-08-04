import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { floatingEdgeButtonClassName } from '@/shared/components/FloatingEdgeControls/floating-edge-button.ts';
import { Palette } from '@/shared/icons/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

/**
 * A handle pinned to the right edge that opens the non-modal Appearance popup —
 * so the theme is one click away on EVERY layout (auth, public, app). Sits above
 * modals (z-70, pointer-events re-enabled), so it stays reachable even over an
 * open dialog. Rendered inside {@link FloatingEdgeControls}; positioning is on
 * the parent stack.
 */
export function FloatingSettingsButton() {
  const { t } = useTranslation(LOCALE_NS);
  const setAppearanceOpen = useUIStore((s) => s.setAppearanceOpen);

  return (
    <button
      type="button"
      onClick={() => setAppearanceOpen(true)}
      aria-label={t(LOCALE_KEYS.openAppearance)}
      title="Appearance"
      data-testid="floating-settings"
      data-slot="floating-edge"
      className={floatingEdgeButtonClassName}
    >
      <Palette className={cn('size-5', iconOnPrimarySurface)} aria-hidden="true" />
    </button>
  );
}
