import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import {
  isAuthenticatedAppSurface,
  useAuthenticatedIdleChunkPrefetch,
} from '@/lib/chunk-prefetch.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import {
  LazyOverlay,
  LazyOverlaySkeleton,
} from '@/shared/components/LazyOverlay/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

// `onceAsync` so a failed chunk fetch is not cached for the session (SHELL-3).
const loadAppearanceDialog = onceAsync(() =>
  import('./AppearanceDialog.tsx').then((m) => ({ default: m.AppearanceDialog })),
);

/** Panel-shaped placeholder so the click registers immediately (SHELL-4). */
function AppearancePending() {
  return (
    <LazyOverlaySkeleton className="max-w-md" testId="appearance-dialog-pending">
      <div className="flex items-center justify-between border-b p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-4 p-4">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-24 w-full" />
      </div>
    </LazyOverlaySkeleton>
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
