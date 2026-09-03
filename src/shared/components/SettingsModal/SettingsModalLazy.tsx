import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import { useAuthenticatedIdleChunkPrefetch } from '@/lib/chunk-prefetch.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import { LazyOverlay } from '@/shared/components/LazyOverlay/index.ts';
import { X } from '@/shared/icons/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { isSettingsHash } from './settings-hash-grammar.ts';
import { isSettingsPathAllowed } from './settings-route-policy.ts';

// `onceAsync` so a failed chunk fetch is not cached for the session (SHELL-3).
const loadSettingsModal = onceAsync(() =>
  import('./SettingsModal.tsx').then((m) => ({ default: m.SettingsModal })),
);

/** Nav rail groups — the same 6 + 2 rhythm SettingsNavSkeleton holds. */
const PENDING_NAV_GROUPS = [
  { key: 'account', items: ['a', 'b', 'c', 'd', 'e', 'f'] },
  { key: 'organization', items: ['a', 'b'] },
] as const;

/**
 * Dialog-shaped placeholder. This is the chunk that most needs one: the modal
 * statically imports all ten panels, so it is the slowest of the three overlays
 * to arrive and the longest dead click without it (SHELL-4).
 *
 * Geometry is the real dialog's, not a generic card. `SettingsModal` renders a
 * `DialogContent` carrying `SETTINGS_DIALOG_CLASS` — 960x640 on desktop, square
 * corners, no padding, with a `[240px_1fr]` grid inside and a close control at
 * `top-4 right-4`. This used to borrow `LazyOverlaySkeleton`, a centred
 * `max-w-3xl` card with `min-h-[26rem]`: 768x416 against 960x640, so the modal
 * jumped nearly 200px in both axes on load. The markup below mirrors the real
 * loading state (`settings-content-loading` + `SettingsNavSkeleton`) so the swap
 * is invisible.
 *
 * Not imported from the modal's own files on purpose: those live in the deferred
 * settings chunk, and a static import here would drag it onto the entry preload
 * path — the exact cost this lazy shell exists to avoid.
 */
function SettingsPending({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" aria-busy="true">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <output
        data-testid="settings-modal-pending"
        data-slot="surface"
        className="bg-background fixed top-[50%] left-[50%] z-50 grid h-dvh max-h-dvh w-full max-w-full translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border p-0 outline-none sm:h-[640px] sm:max-h-[85vh] sm:max-w-[960px]"
      >
        <div className="grid h-full min-h-0 grid-cols-1 sm:grid-cols-[240px_1fr]">
          {/* Mirrors SettingsNavSkeleton: tinted rail, search box, 6 + 2 rows. */}
          <aside className="bg-muted/30 hidden h-full flex-col border-e sm:flex">
            <div className="p-3">
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="flex-1 space-y-4 px-3 pb-3">
              {PENDING_NAV_GROUPS.map((group) => (
                <div key={group.key}>
                  <Skeleton className="ms-2 mb-1.5 h-3 w-20" />
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <Skeleton key={item} className="h-9 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
          {/* Mirrors the real `settings-content-loading` block exactly. */}
          <div className="min-h-0 flex-1 space-y-4 px-4 pt-6 pb-6 sm:px-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        {/* DialogContent draws its own close at this exact offset; matching it
            here is why LazyOverlay's viewport-corner control is switched off. */}
        <button
          type="button"
          onClick={onClose}
          data-slot="button"
          className={`${closeControlClassName} absolute top-4 right-4`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </output>
    </div>
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

  const closeSettings = () => {
    void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true });
  };

  return (
    <LazyOverlay
      load={loadSettingsModal}
      pending={<SettingsPending onClose={closeSettings} />}
      title={t(ERRORS_KEYS.widget.settings)}
      onDismiss={closeSettings}
      // The skeleton draws the dialog's own close at top-4 right-4, so the
      // viewport-corner one would be a second ✕ in a place the modal never has.
      pendingDismissControl={false}
      testId="settings-modal-error"
    />
  );
}
