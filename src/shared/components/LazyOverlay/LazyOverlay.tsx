import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type ComponentType,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
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
   * actually go away — see {@link LazyOverlayPending}. Both surfaces offer the
   * same two routes out, Escape and a close control, and neither offers any
   * when this is omitted: there would be no state to flip.
   */
  onDismiss?: () => void;
  testId?: string;
}

/**
 * Shared by both viewport-covering surfaces so the failure card and the skeleton
 * sit at the same depth and tint. Named once because the failure surface paints
 * it through Radix's `Dialog.Overlay` and the skeleton through a plain div.
 */
const SCRIM_CLASS =
  'bg-overlay/50 fixed inset-0 z-50 flex items-center justify-center p-4';

function OverlayScrim({ children }: { children: ReactNode }) {
  return <div className={SCRIM_CLASS}>{children}</div>;
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

  /**
   * Whatever held focus when the chunk failed. A lazy state initializer, not an
   * effect: this has to read `document.activeElement` during the FIRST render,
   * because Radix moves focus into the card on commit — an effect would capture
   * the Retry button and "restoring" it would be a no-op (same reasoning as the
   * command palette's SHELL-7 fix).
   */
  const [previousFocus] = useState<HTMLElement | null>(
    () => document.activeElement as HTMLElement | null,
  );

  /**
   * Retry is not a close. It swaps this card for the overlay that is finally
   * loading, and that overlay moves focus itself — while Radix runs its unmount
   * focus handler on a macrotask, i.e. potentially AFTER the new overlay has
   * arrived. Handing focus back on that path would yank it off the thing the
   * user just asked for, so only a real dismiss arms the restore.
   */
  const restoreFocus = useRef(false);
  const dismiss = onDismiss
    ? () => {
        restoreFocus.current = true;
        onDismiss();
      }
    : undefined;

  return (
    <DialogPrimitive.Root
      open
      // `open` is a constant: this surface exists only while the boundary is in
      // its fallback, so what makes it go away is the OWNER's state, never
      // Radix's. Escape and the close control both route through `onDismiss` —
      // and without one there is nothing to flip, so they do nothing rather
      // than pretending to close (same contract as the pending surface).
      onOpenChange={(next) => {
        if (!next) dismiss?.();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM_CLASS}>
          <DialogPrimitive.Content
            // Radix's Content is a plain `role="dialog"` and sets no
            // `aria-modal`; both are spread-after-defaults, so these keep the
            // semantics this card always claimed. The difference is that they
            // are now TRUE: Radix's FocusScope moves focus to Retry on mount and
            // traps Tab, and its DismissableLayer handles Escape. Dropping the
            // attributes was the other honest answer, but this card sits on a
            // `fixed inset-0` scrim that blocks every pointer route to the page
            // behind it — so a screen-reader user must not be able to browse out
            // to content nobody else can reach. It IS a modal (unlike
            // AppearanceDialog, which has no scrim and says `aria-modal="false"`
            // for exactly that reason), so the claim is made true, not dropped.
            role="alertdialog"
            aria-modal="true"
            data-testid={testId ?? 'lazy-overlay-error'}
            // `data-slot="surface"` rather than a hardcoded shadow: the elevation
            // axis owns depth, so this card goes flat/soft/lifted with the theme
            // instead of pinning one depth the Appearance picker cannot change.
            data-slot="surface"
            className="bg-background flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border p-6 text-center outline-none"
            // A failed chunk is a decision — Retry or Close. A stray click on
            // the scrim must not answer it, which is also how this card behaved
            // before it became a real dialog.
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            // Radix's modal default hands focus back to a `Dialog.Trigger`;
            // there is none here, so it would drop focus on <body>. Moving focus
            // in without ever handing it back is its own keyboard trap.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (restoreFocus.current && previousFocus?.isConnected) {
                previousFocus.focus();
              }
            }}
          >
            <AlertTriangle className="text-muted-foreground size-7" aria-hidden="true" />
            <div>
              {/* Title/Description rather than an `aria-label`: Radix names the
                  dialog from them, so the accessible name is the same string as
                  before, and the message becomes the description instead of
                  unannounced body text. */}
              <DialogPrimitive.Title className="text-sm font-medium">
                {t(ERRORS_KEYS.widget.unavailable, { title })}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-xs">
                {t(ERRORS_KEYS.widget.message)}
              </DialogPrimitive.Description>
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
                  onClick={dismiss}
                  data-testid="lazy-overlay-dismiss"
                >
                  {tLocale(LOCALE_KEYS.closeAria)}
                </Button>
              ) : null}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
