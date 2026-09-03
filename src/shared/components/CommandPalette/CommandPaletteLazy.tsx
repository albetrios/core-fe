import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import { LazyOverlay } from '@/shared/components/LazyOverlay/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

// `onceAsync`, not a bare `import()`: every caller shares one in-flight promise
// and — the point here — a REJECTION is not cached, so a retry refetches
// instead of replaying the failure for the rest of the session (SHELL-3).
const loadCommandPalette = onceAsync(() =>
  import('./CommandPalette.tsx').then((m) => ({ default: m.CommandPalette })),
);

/**
 * Palette-shaped placeholder so ⌘K registers the instant it is pressed — and so
 * nothing moves when the chunk lands.
 *
 * Geometry is copied from CommandPalette itself: the same scrim, the same
 * `top-[20%] left-1/2 max-w-lg -translate-x-1/2` panel, the same `bg-popover`
 * and radius, an input row at the real input's `h-12`, and a list block inside
 * the real `p-2`. It used to borrow LazyOverlaySkeleton, which centres a
 * `max-w-xl` card: 576px instead of 512px, sitting vertically centred instead of
 * a fifth down the screen, so the palette visibly jumped on load.
 *
 * The scrim dismisses on click, exactly like the real palette's — that is the
 * pointer route out of a slow chunk, which is why this opts out of LazyOverlay's
 * corner-pinned ✕ (a control the finished palette does not have).
 */
function CommandPalettePending() {
  const { t } = useTranslation(LOCALE_NS);

  return (
    <div className="fixed inset-0 z-50" aria-busy="true">
      <div
        className="bg-overlay/50 fixed inset-0 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => useUIStore.getState().setCommandPaletteOpen(false)}
      />
      <div className="fixed top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2">
        <output
          data-testid="command-palette-pending"
          data-slot="surface"
          className="bg-popover block overflow-hidden rounded-md border"
        >
          <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
          {/* Mirrors the real input row: h-12, bordered below, px-3. */}
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <Skeleton className="h-4 w-48" />
          </div>
          {/* Mirrors Command.List: p-2, grouped rows. */}
          <div className="space-y-1.5 p-2">
            {/* Two groups — Navigation (2 commands) then Settings (4) — which is
                what the palette lists on first open before any filtering. */}
            <Skeleton className="ms-2 h-3.5 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="ms-2 h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </output>
      </div>
    </div>
  );
}

/**
 * Lazy-loaded Command Palette — loads cmdk and palette UI only when first opened.
 * Keyboard listener is lightweight and always active.
 *
 * Uses store.getState() to avoid stale closure over `open` — the listener
 * is registered once and always reads the latest value.
 */
export function CommandPaletteLazy() {
  const { t } = useTranslation(ERRORS_NS);
  const open = useUIStore((s) => s.commandPaletteOpen);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <LazyOverlay
      load={loadCommandPalette}
      pending={<CommandPalettePending />}
      title={t(ERRORS_KEYS.widget.commandPalette)}
      onDismiss={() => useUIStore.getState().setCommandPaletteOpen(false)}
      // The finished palette has no ✕; its skeleton's scrim dismisses instead.
      pendingDismissControl={false}
      testId="command-palette-error"
    />
  );
}
