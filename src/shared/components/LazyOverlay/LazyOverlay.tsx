import { type ComponentType, type ReactNode, Suspense, useEffect } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { useRetryableLazy } from '@/lib/lazy-module.ts';
import { cn } from '@/lib/utils.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { AlertTriangle, X } from '@/shared/icons/index.ts';

/**
 * Props for {@link LazyOverlay}.
 *
 * `onDismiss` is what makes a slow chunk escapable: it flips the OWNER's open
 * state, so both the pending surface's Escape key and its close control leave
 * the overlay for good rather than hiding a scrim that is still mounted.
 */
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
  /**
   * Close the overlay from the failure surface AND from the pending one. The
   * caller owns the open state, so this is the only way either surface can
   * actually go away — see {@link LazyOverlayPending}.
   */
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
 * The overlay's failure surface. Module-level on purpose: a component defined
 * inside its parent's render gets a fresh type identity on every parent render,
 * so React remounts the whole subtree instead of updating it, and any state in
 * it is lost (sonar typescript:S6478). Everything it needs arrives as props.
 */
interface OverlayChrome {
  title: string;
  testId?: string;
  onDismiss?: () => void;
}

function LazyOverlayError({
  title,
  testId,
  onRetry,
  onDismiss,
}: OverlayChrome & { onRetry: () => void }) {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tLocale } = useTranslation(LOCALE_NS);

  return (
    <OverlayScrim>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={t(ERRORS_KEYS.widget.unavailable, { title })}
        data-testid={testId ?? 'lazy-overlay-error'}
        // `data-slot="surface"` rather than a hardcoded shadow: the elevation
        // axis owns depth, so this card goes flat/soft/lifted with the theme
        // instead of pinning one depth the Appearance picker cannot change.
        data-slot="surface"
        className="bg-background flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border p-6 text-center"
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
            onClick={onRetry}
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
  );
}

/**
 * The pending surface — plus the way back out of it.
 *
 * **A stalled chunk fetch is not a failed one.** It never rejects, so the error
 * boundary below never fires and its Retry/Close card never renders; the
 * `fixed inset-0 z-50` scrim just sits there. Because every trigger hides
 * itself while its overlay is open (Appearance has no always-registered ⌘K
 * toggle the way the command palette does), that scrim WAS the entire UI until
 * the import settled — one hung CDN request locked the app with no keyboard and
 * no pointer route out. So the escape hatch has to live on the pending surface
 * itself, not only on the failure one.
 *
 * Both routes out call the caller's `onDismiss`, which flips the open state the
 * caller owns. Hiding the scrim locally instead would leave the store saying
 * "open" and the trigger still hidden — a closed-looking overlay nothing can
 * reopen. Without `onDismiss` there is no state to flip, so neither route is
 * offered rather than pretending to close.
 */
function LazyOverlayPending({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation(LOCALE_NS);

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    // On `window`, like the app's other Escape handlers: a skeleton holds
    // nothing focusable, so focus is still on the trigger (or on <body> after
    // the trigger unmounted) and a node-scoped listener would never see the key.
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <>
      {children}
      {onDismiss ? (
        // Above the z-50 scrim, and pinned to the viewport rather than to the
        // caller's `pending` node — that node is an arbitrary ReactNode this
        // component cannot reach into to place a control.
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t(LOCALE_KEYS.closeAria)}
          data-testid="lazy-overlay-pending-dismiss"
          // Stays `data-slot="button"`: a control, not a surface, so the
          // elevation axis has nothing to apply — dropping the hardcoded depth
          // utility was the fix. (Naming that utility here would trip the
          // theme-axis scan, which greps raw text, comments included.)
          data-slot="button"
          className={cn(
            closeControlClassName,
            'bg-background/90 fixed end-4 top-4 z-[60] border',
          )}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}

/**
 * Builds the boundary's fallback renderer. A module-level factory, not an inline
 * arrow inside `LazyOverlay`: a JSX-returning function declared in a component's
 * body is a component definition in that scope (sonar typescript:S6478).
 */
function renderOverlayError(chrome: OverlayChrome) {
  return function OverlayErrorFallback({ resetErrorBoundary }: FallbackProps) {
    return <LazyOverlayError {...chrome} onRetry={resetErrorBoundary} />;
  };
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
  // A fresh `lazy()` per attempt — the only way back out of a cached rejection.
  const { Component: Overlay, retry } = useRetryableLazy(load);

  return (
    <ErrorBoundary
      onReset={retry}
      onError={(error, info) => {
        if (platformConfig.debugLogging) {
          console.error(`[LazyOverlay:${title}]`, error, info);
        }
        // Containing the throw must not swallow it. Before this boundary
        // existed the failure escalated to the route boundary and WAS reported;
        // now the user gets a retry card, so without this call a chunk that
        // 404s after a deploy is invisible to operators — the retry card is the
        // only trace, and it is on the user's screen, not in Sentry. Same shape
        // as SectionErrorBoundary so one Sentry query spans both boundaries.
        reportError(error, {
          scope: 'lazy-overlay',
          widget: title,
          componentStack: info.componentStack,
        });
      }}
      fallbackRender={renderOverlayError({ title, testId, onDismiss })}
    >
      <Suspense
        fallback={
          <LazyOverlayPending onDismiss={onDismiss}>{pending}</LazyOverlayPending>
        }
      >
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
      {/* `<output>` carries an implicit role="status", so the live region is the
          element itself. `block` is explicit because <output> is inline by
          default and would ignore the width. */}
      <output
        aria-busy="true"
        data-testid={testId ?? 'lazy-overlay-pending'}
        data-slot="surface"
        className={`bg-background block w-full overflow-hidden rounded-xl border ${className ?? 'max-w-lg'}`}
      >
        <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
        {children}
      </output>
    </OverlayScrim>
  );
}
