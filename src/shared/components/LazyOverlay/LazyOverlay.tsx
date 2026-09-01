import { type ComponentType, type ReactNode, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { useRetryableLazy } from '@/lib/lazy-module.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { AlertTriangle } from '@/shared/icons/index.ts';

export interface LazyOverlayProps {
  /**
   * Module loader for the overlay's chunk. Wrap it in `onceAsync` so callers
   * share one in-flight promise AND a rejection is not cached.
   */
  load: () => Promise<{ default: ComponentType }>;
  /**
   * What the user sees while the chunk is in flight. Never `null`: an overlay
   * that renders nothing turns the click that opened it into a dead click
   * (SHELL-4).
   */
  pending: ReactNode;
  /** Short label for the failure surface, e.g. "Settings". */
  title: string;
  /** Close the overlay from the failure surface, when the caller can. */
  onDismiss?: () => void;
  testId?: string;
}

function OverlayScrim({ children }: { children: ReactNode }) {
  return (
    <div className="bg-overlay/50 fixed inset-0 z-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}

/**
 * Mounts a code-split overlay with a real loading state, a contained failure
 * surface, and a Retry that actually retries.
 *
 * Three things go wrong with a bare `<Suspense fallback={null}><Lazy/></Suspense>`:
 *
 * 1. **`React.lazy` caches the rejection — permanently.** Its internal status
 *    goes `Rejected` and it rethrows the same error on every later render; the
 *    factory is never called again. So one flaky chunk fetch breaks that
 *    feature for the rest of the session, and a Retry that only resets an error
 *    boundary re-renders straight back into the cached rejection — which is why
 *    the retry buttons did nothing (SHELL-3). Recovering needs a *new* lazy
 *    component, so `attempt` is part of the memo key below.
 * 2. **Nothing contains the throw.** A failed modal chunk propagates to the
 *    route boundary and replaces the whole page (house rule 2).
 * 3. **`fallback={null}` is a dead click.** Pressing ⌘K or opening Settings
 *    renders literally nothing until the chunk lands (SHELL-4).
 */
export function LazyOverlay({
  load,
  pending,
  title,
  onDismiss,
  testId,
}: LazyOverlayProps) {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tLocale } = useTranslation(LOCALE_NS);
  // A fresh `lazy()` per attempt — the only way back out of a cached rejection.
  const { Component: Overlay, retry } = useRetryableLazy(load);

  return (
    <ErrorBoundary
      onReset={retry}
      onError={(error, info) => {
        if (platformConfig.debugLogging) {
          console.error(`[LazyOverlay:${title}]`, error, info);
        }
      }}
      fallbackRender={({ resetErrorBoundary }) => (
        <OverlayScrim>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={t(ERRORS_KEYS.widget.unavailable, { title })}
            data-testid={testId ?? 'lazy-overlay-error'}
            className="bg-background flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border p-6 text-center shadow-lg"
          >
            <AlertTriangle className="text-muted-foreground size-7" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">
                {t(ERRORS_KEYS.widget.unavailable, { title })}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t(ERRORS_KEYS.widget.message)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetErrorBoundary}
                data-testid="lazy-overlay-retry"
              >
                {t(ERRORS_KEYS.widget.retry)}
              </Button>
              {onDismiss ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  data-testid="lazy-overlay-dismiss"
                >
                  {tLocale(LOCALE_KEYS.closeAria)}
                </Button>
              ) : null}
            </div>
          </div>
        </OverlayScrim>
      )}
    >
      <Suspense fallback={pending}>
        <Overlay />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Scrim + a correctly-sized skeleton panel, so an opening overlay looks open. */
export function LazyOverlaySkeleton({
  className,
  testId,
  children,
}: {
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <OverlayScrim>
      <div
        role="status"
        aria-busy="true"
        data-testid={testId ?? 'lazy-overlay-pending'}
        className={`bg-background w-full overflow-hidden rounded-xl border shadow-lg ${className ?? 'max-w-lg'}`}
      >
        <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
        {children}
      </div>
    </OverlayScrim>
  );
}
