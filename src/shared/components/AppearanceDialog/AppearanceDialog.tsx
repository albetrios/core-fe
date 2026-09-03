import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { useEnterAnimationProps } from '@/shared/components/LazyOverlay/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Sparkles, X } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { AppearancePanel } from './AppearancePanel.tsx';

/**
 * Dedicated Appearance popup — a NON-MODAL side panel pinned to the right edge.
 * No scrim, no focus trap, no scroll lock: the page behind stays fully visible +
 * interactive while you tweak the theme. Sits above modals and any other layer
 * (z-80, pointer-events re-enabled), and is mounted at the route root, so it works
 * on every layout — auth, public, and app. Open state lives in useUIStore; Esc,
 * the close button, or a click outside dismisses it.
 */
export function AppearanceDialog() {
  const { t } = useTranslation(LOCALE_NS);
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const open = useUIStore((s) => s.appearanceOpen);
  const setOpen = useUIStore((s) => s.setAppearanceOpen);
  const shuffleTheme = useThemeStore((s) => s.shuffleTheme);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Click-outside dismiss. Clicks inside portaled overlays (the font selects,
    // popovers, toasts) count as "inside" so they don't close the popup.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        !target ||
        panelRef.current?.contains(target) ||
        target.closest(
          '[data-slot="select-content"],[data-slot="popover-content"],[data-slot="dropdown-menu-content"],[data-sonner-toaster]',
        )
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, setOpen]);

  const enterProps = useEnterAnimationProps();

  const handleShuffle = () => {
    shuffleTheme();
    notify.info('Theme shuffled', { description: 'A fresh look across every axis.' });
  };

  if (!open) return null;

  return (
    <aside
      // Suppressed when a placeholder already painted this panel — replaying the
      // slide-in there makes it blink out and slide back in from the edge.
      {...enterProps}
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="appearance-popover-title"
      data-testid="appearance-dialog"
      data-slot="popover-content"
      className="bg-popover text-popover-foreground border-border animate-in slide-in-from-end-2 fade-in rtl:slide-in-from-start-2 pointer-events-auto fixed end-3 top-3 z-[80] flex max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,480px)] flex-col overflow-hidden rounded-md border transition"
    >
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="space-y-0.5">
          <h2 id="appearance-popover-title" className="text-sm font-semibold">
            {tSettings(SETTINGS_KEYS.panels.appearance.title)}
          </h2>
          <p className="text-muted-foreground text-xs">
            {tSettings(SETTINGS_KEYS.panels.appearance.description)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleShuffle}
            data-testid="theme-shuffle"
          >
            <Sparkles className="me-1.5 size-3.5" aria-hidden="true" />
            {tSettings(SETTINGS_KEYS.panels.appearance.shuffle)}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t(LOCALE_KEYS.closeAria)}
            data-testid="appearance-close"
            data-slot="button"
            className={cn(closeControlClassName, '-me-1')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <AppearancePanel />
      </div>
    </aside>
  );
}
