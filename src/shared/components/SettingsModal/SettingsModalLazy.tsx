import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import { useAuthenticatedIdleChunkPrefetch } from '@/lib/chunk-prefetch.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import {
  LazyOverlay,
  LazyOverlaySkeleton,
} from '@/shared/components/LazyOverlay/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { isSettingsHash } from './settings-hash-grammar.ts';
import { isSettingsPathAllowed } from './settings-route-policy.ts';

// `onceAsync` so a failed chunk fetch is not cached for the session (SHELL-3).
const loadSettingsModal = onceAsync(() =>
  import('./SettingsModal.tsx').then((m) => ({ default: m.SettingsModal })),
);

/**
 * Dialog-shaped placeholder. This is the chunk that most needs one: the modal
 * statically imports all ten panels, so it is the slowest of the three overlays
 * to arrive and the longest dead click without it (SHELL-4).
 */
function SettingsPending() {
  return (
    <LazyOverlaySkeleton className="max-w-3xl" testId="settings-modal-pending">
      <div className="flex min-h-[26rem]">
        <div className="hidden w-56 shrink-0 space-y-2 border-e p-4 sm:block">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </LazyOverlaySkeleton>
  );
}

/**
 * Hash-listening shell for the global settings modal. The real modal (11
 * panels, forms, react-hook-form) is a separate chunk: mounting THIS on the
 * root route keeps the whole settings tree out of the entry preload graph.
 *
 * Prefetch runs only on authenticated app surfaces (not `/login` etc.) so auth
 * funnels keep first-paint lean. A `#settings/…` deep link imports via Suspense.
 */
export function SettingsModalLazy() {
  const { t } = useTranslation(ERRORS_NS);
  const hash = useRouterState({ select: (s) => s.location.hash });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const hasSettingsHash = isSettingsHash(hash);
  const pathAllowed = isSettingsPathAllowed(pathname);

  useLayoutEffect(() => {
    if (!hasSettingsHash) return;
    if (!pathAllowed) {
      void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true });
      return;
    }
    if (!(isAuthLoading || isAuthenticated)) {
      void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true });
    }
  }, [hasSettingsHash, pathAllowed, isAuthLoading, isAuthenticated, navigate]);

  const prefetchEnabled =
    isAuthenticated && !isAuthLoading && pathAllowed && !hasSettingsHash;
  useAuthenticatedIdleChunkPrefetch(() => import('./SettingsModal.tsx'), prefetchEnabled);

  if (!(hasSettingsHash && pathAllowed) || isAuthLoading || !isAuthenticated) {
    return null;
  }

  return (
    <LazyOverlay
      load={loadSettingsModal}
      pending={<SettingsPending />}
      title={t(ERRORS_KEYS.widget.settings)}
      onDismiss={() => {
        void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true });
      }}
      testId="settings-modal-error"
    />
  );
}
