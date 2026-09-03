import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import {
  isAuthenticatedAppSurface,
  useAuthenticatedIdleChunkPrefetch,
} from '@/lib/chunk-prefetch.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import { LazyOverlay } from '@/shared/components/LazyOverlay/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

// `onceAsync` so a failed chunk fetch is not cached for the session (SHELL-3).
const loadAppearanceDialog = onceAsync(() =>
  import('./AppearanceDialog.tsx').then((m) => ({ default: m.AppearanceDialog })),
);

/** Named rather than indexed so the row keys are stable identifiers, not positions. */
const PENDING_CARD_ROWS = ['swatches', 'options'] as const;

/** One Card-shaped block in the body stack — the panel is a column of Cards. */
function PendingCard({ rows = 2 }: { rows?: 1 | 2 }) {
  return (
    <div className="border-border space-y-3 rounded-xl border p-4">
      <Skeleton className="h-3.5 w-28" />
      {PENDING_CARD_ROWS.slice(0, rows).map((row) => (
        <div key={row} className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Popover-shaped placeholder so the click registers immediately (SHELL-4) and
 * nothing moves when the chunk lands.
 *
 * The geometry is copied from `AppearanceDialog`'s own `<aside>`: same top-end
 * dock, same width, same max height, same radius, same header rhythm — and no
 * scrim, because the real panel is a non-modal popover (`aria-modal="false"`).
 * This used to borrow `LazyOverlaySkeleton`, which paints a scrim behind a
 * CENTRED `max-w-md` card: opening Appearance dimmed the page, flashed a short
 * centred modal, and then jumped to a tall panel in the corner — three
 * mismatches (position, size, tint) in one transition.
 *
 * Sits below `z-60` on purpose: `LazyOverlay` pins its own dismiss control there,
 * and a higher panel would swallow the only way out of a slow chunk.
 */
function AppearancePending() {
  const { t } = useTranslation(LOCALE_NS);

  return (
    <aside
      aria-busy="true"
      data-testid="appearance-dialog-pending"
      data-slot="surface"
      className="bg-popover text-popover-foreground border-border animate-in slide-in-from-end-2 fade-in rtl:slide-in-from-start-2 pointer-events-auto fixed end-3 top-3 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,480px)] flex-col overflow-hidden rounded-md border"
    >
      <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
      {/* Mirrors the real header: title + description on the start side, the
          Shuffle button and close control on the end side. */}
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-52" />
        </div>
        {/* Only the Shuffle button is drawn: LazyOverlay pins a REAL close
            control at this corner, so a placeholder for it would sit under the
            live one and read as two buttons. */}
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      {/* Mirrors the real body: `flex flex-col gap-4` of Cards, clipped by the
          same scroll container so the stack ends where the panel ends. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
        {/* The real panel stacks ~10 Cards, so it always overflows and settles at
            its max height. Enough blocks here to do the same, clipped by the same
            `overflow-hidden` — a short stack left the placeholder 279px shorter
            than the panel that replaced it. */}
        <PendingCard rows={1} />
        <PendingCard />
        <PendingCard rows={1} />
        <PendingCard />
        <PendingCard rows={1} />
        <PendingCard />
        <PendingCard rows={1} />
        <PendingCard />
      </div>
    </aside>
  );
}

/**
 * Lazy shell for the Appearance dialog — keeps the theme-studio chunk (every
 * picker + the colour maths) out of the entry preload graph. Mounts the dialog
 * only once opened; prefetched at idle on authenticated app routes.
 */
export function AppearanceDialogLazy() {
  const { t } = useTranslation(ERRORS_NS);
  const open = useUIStore((s) => s.appearanceOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const prefetchEnabled =
    !open && isAuthenticatedAppSurface(pathname, isAuthenticated, isAuthLoading);

  useAuthenticatedIdleChunkPrefetch(
    () => import('./AppearanceDialog.tsx'),
    prefetchEnabled,
  );

  if (!open) return null;

  return (
    <LazyOverlay
      load={loadAppearanceDialog}
      pending={<AppearancePending />}
      title={t(ERRORS_KEYS.widget.appearance)}
      onDismiss={() => useUIStore.getState().setAppearanceOpen(false)}
      testId="appearance-dialog-error"
    />
  );
}
