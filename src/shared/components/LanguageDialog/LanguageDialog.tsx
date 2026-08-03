import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { X } from '@/shared/icons/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { LanguagePanel } from './LanguagePanel.tsx';

/**
 * Dedicated Language & region popup — a NON-MODAL side panel pinned to the right
 * edge, mirroring the Appearance dialog. No scrim, no focus trap, no scroll lock:
 * the page behind stays fully visible + interactive while you tweak language and
 * regional formatting. Mounted at the route root so it works on every layout. Open
 * state lives in useUIStore; Esc, the close button, or a click outside dismisses it.
 */
export function LanguageDialog() {
  const { t } = useTranslation(LOCALE_NS);
  const open = useUIStore((s) => s.languageOpen);
  const setOpen = useUIStore((s) => s.setLanguageOpen);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Click-outside dismiss. Clicks inside portaled overlays (the selects,
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

  if (!open) return null;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="language-popover-title"
      data-testid="language-dialog"
      data-slot="popover-content"
      className="bg-popover text-popover-foreground border-border animate-in slide-in-from-right-2 fade-in pointer-events-auto fixed top-3 right-3 z-[80] flex max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,480px)] flex-col overflow-hidden rounded-md border transition"
    >
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="space-y-0.5">
          <h2 id="language-popover-title" className="text-sm font-semibold">
            {t(LOCALE_KEYS.title)}
          </h2>
          <p className="text-muted-foreground text-xs">
            Saved on this device — changes apply live.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          data-testid="language-close"
          data-slot="button"
          className={cn(closeControlClassName, '-mr-1')}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <LanguagePanel />
      </div>
    </aside>
  );
}
