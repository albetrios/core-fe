import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import {
  LazyOverlay,
  LazyOverlaySkeleton,
} from '@/shared/components/LazyOverlay/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

// `onceAsync`, not a bare `import()`: every caller shares one in-flight promise
// and — the point here — a REJECTION is not cached, so a retry refetches
// instead of replaying the failure for the rest of the session (SHELL-3).
const loadCommandPalette = onceAsync(() =>
  import('./CommandPalette.tsx').then((m) => ({ default: m.CommandPalette })),
);

/** Dialog-shaped placeholder so ⌘K registers the instant it is pressed. */
function CommandPalettePending() {
  return (
    <LazyOverlaySkeleton className="max-w-xl" testId="command-palette-pending">
      <div className="border-b p-4">
        <Skeleton className="h-6 w-2/3" />
      </div>
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-5/6" />
      </div>
    </LazyOverlaySkeleton>
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
      testId="command-palette-error"
    />
  );
}
