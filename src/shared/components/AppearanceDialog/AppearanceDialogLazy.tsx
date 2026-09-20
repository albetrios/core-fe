import { useRouterState } from '@tanstack/react-router';

import {
  isAuthenticatedAppSurface,
  useAuthenticatedIdleChunkPrefetch,
} from '@/lib/chunk-prefetch.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { loadAppearancePanel } from './appearance-panel-loader.ts';
import { AppearanceDialog } from './AppearanceDialog.tsx';

/** Eager controls; only the theme studio body needs a deferred chunk. */
export function AppearanceDialogLazy() {
  const open = useUIStore((s) => s.appearanceOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);

  useAuthenticatedIdleChunkPrefetch(
    loadAppearancePanel,
    !open && isAuthenticatedAppSurface(pathname, isAuthenticated, isAuthLoading),
  );

  return <AppearanceDialog />;
}
