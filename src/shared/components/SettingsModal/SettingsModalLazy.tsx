import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { holdAppSplash } from '@/lib/app-splash.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { ensureNamespace } from '@/lib/i18n/load-namespace.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import {
  LazyOverlay,
  LazyOverlaySkeleton,
} from '@/shared/components/LazyOverlay/index.ts';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

import { isSettingsHash } from './settings-hash-grammar.ts';
import { isSettingsPathAllowed } from './settings-route-policy.ts';

const loadSettingsSurface = onceAsync(async () => {
  const [, , module] = await Promise.all([
    ensureNamespace(useLocaleStore.getState().locale, I18N_NAMESPACES.auth),
    ensureNamespace(useLocaleStore.getState().locale, I18N_NAMESPACES.settings),
    import('./SettingsModal.tsx'),
  ]);
  return { default: module.SettingsModal };
});

/** Load settings with the authenticated outlet, before its controls become interactive. */
export function SettingsModalLazy() {
  const { t } = useTranslation(ERRORS_NS);
  const hash = useRouterState({ select: (s) => s.location.hash });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const hasSettingsHash = isSettingsHash(hash);
  const pathAllowed = isSettingsPathAllowed(pathname);
  const enabled = pathAllowed && !isAuthLoading && isAuthenticated;

  useLayoutEffect(() => {
    if (!enabled) return;
    // Warm alongside route chunks while the bounded startup splash is still up.
    // The outlet is never inside this optional feature's loading/error boundary.
    const release = holdAppSplash();
    void loadSettingsSurface().then(release, (error: unknown) => {
      reportError(error, { scope: 'settings-preload' });
      release();
    });
    return release;
  }, [enabled]);

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

  return (
    <>
      <Outlet />
      {enabled && hasSettingsHash ? (
        <LazyOverlay
          load={loadSettingsSurface}
          title={t(ERRORS_KEYS.widget.settings)}
          testId="settings-modal-load-error"
          onDismiss={() =>
            void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true })
          }
          pending={
            <LazyOverlaySkeleton className="max-w-md p-6">
              <h2 className="text-lg font-semibold">{t(ERRORS_KEYS.widget.settings)}</h2>
            </LazyOverlaySkeleton>
          }
        />
      ) : null}
    </>
  );
}
