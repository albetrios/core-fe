import { platformConfig } from '@/core/config/env.ts';
import { FloatingSettingsButton } from '@/shared/components/FloatingSettingsButton/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

/**
 * Inline-end Appearance handle (mirrors under RTL). Language / region / timezone
 * live inside the Appearance panel — no separate language handle. Hidden while
 * Appearance (or the Language dialog, if opened elsewhere) is open.
 */
export function FloatingEdgeControls() {
  const appearanceOpen = useUIStore((s) => s.appearanceOpen);
  const languageOpen = useUIStore((s) => s.languageOpen);

  if (appearanceOpen || languageOpen) return null;
  if (platformConfig.themeLock) return null;

  return (
    <div
      className="pointer-events-none fixed end-0 top-1/2 z-[70] hidden -translate-y-1/2 flex-col gap-2 sm:flex"
      data-testid="floating-edge-controls"
    >
      <FloatingSettingsButton />
    </div>
  );
}
