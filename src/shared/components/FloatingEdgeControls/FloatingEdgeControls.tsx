import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { FloatingSettingsButton } from '@/shared/components/FloatingSettingsButton/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

/**
 * Inline-end Appearance handle (mirrors under RTL). Language / region / timezone /
 * money prefs live inside the Appearance panel. Hidden while Appearance is open.
 */
function FloatingEdgeControlsInner() {
  const appearanceOpen = useUIStore((s) => s.appearanceOpen);

  if (appearanceOpen) return null;
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

/**
 * Contained mount for the edge handle (house rule 2).
 *
 * This is mounted on the ROOT route, so there is nothing between it and the
 * app-level boundary: a throw in a decorative handle took the entire
 * application with it. Its failure mode is deliberately "no handle" rather than
 * an error card — a fixed-position decoration has no sensible place to render
 * one at the document root, and losing the handle costs the user nothing they
 * cannot reach elsewhere. Contained, never silent: the throw is still reported.
 *
 * That shape is now the shared boundary's `silent` variant, so this uses it
 * rather than hand-rolling a second copy of the same decision.
 */
export function FloatingEdgeControls() {
  const { t } = useTranslation(ERRORS_NS);

  return (
    <SectionErrorBoundary
      title={t(ERRORS_KEYS.widget.appearanceControls)}
      variant="silent"
    >
      <FloatingEdgeControlsInner />
    </SectionErrorBoundary>
  );
}
