import {
  type ComponentType,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useId,
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
import { PlaceholderPrecededContext } from '@/shared/components/LazyOverlay/lazy-surface-context.ts';
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
  /**
   * Draw the viewport-pinned close control on the PENDING surface. Default true.
   *
   * Set false when the loaded overlay has no close control of its own — the
   * command palette dismisses by Escape or a click on its scrim, so a ✕ that
   * appears in the screen corner only while the chunk loads and then vanishes is
   * a control the finished UI never had. Escape is unaffected either way: it is
   * wired independently of this button, and a caller that turns the button off
   * should give its skeleton a click-to-dismiss scrim so pointer users keep a
   * route out of a slow chunk.
   */
  pendingDismissControl?: boolean;
  testId?: string;
}

/**
 * Shared by both viewport-covering surfaces so the failure card and the skeleton
 * sit at the same depth and tint. Named once because both paint it — the failure
 * card and the skeleton each wrap themselves in the same plain div.
 */
const SCRIM_CLASS =
  'bg-overlay/50 fixed inset-0 z-50 flex items-center justify-center p-4';

function OverlayScrim({ children }: { children: ReactNode }) {
  return <div className={SCRIM_CLASS}>{children}</div>;
}

/**
 * What the Tab trap cycles through. Deliberately the same shape as the command
 * palette's SHELL-7 trap: a flat `querySelectorAll` over the card, in DOM order,
 * so "first" and "last" mean what the browser's own tab order means.
 */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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

/**
 * The failure card, and the modal behaviour it claims.
 *
 * **Hand-rolled, not `Dialog` from `radix-ui`.** Radix would give the same
 * behaviour for free, but this component sits on the FIRST-PAINT path — every
 * lazy overlay in the shell renders through it — so importing Radix's Dialog
 * pulled its focus scope, dismissable layer, presence and scroll-lock into the
 * entry chunk and pushed initial JS 8.5 kB over budget. The budget is a ratchet,
 * not a dial, so the weight goes instead of the accessibility: focus move, Tab
 * trap, Escape and focus-restore are ~40 lines here, and the house already runs
 * exactly that pattern in the command palette (SHELL-7).
 */
function LazyOverlayError({
  title,
  testId,
  onRetry,
  onDismiss,
}: OverlayChrome & { onRetry: () => void }) {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tLocale } = useTranslation(LOCALE_NS);

  const cardRef = useRef<HTMLDivElement>(null);
  // Radix named the dialog from its Title/Description subcomponents; without it
  // the wiring is explicit, so the accessible name is still the heading string
  // and the message is still the description rather than unannounced body text.
  const titleId = useId();
  const descriptionId = useId();

  /**
   * Whatever held focus when the chunk failed. A lazy state initializer, not an
   * effect: this has to read `document.activeElement` during the FIRST render,
   * before the mount effect below moves focus into the card — an effect would
   * capture the Retry button and "restoring" it would be a no-op (same reasoning
   * as the command palette's SHELL-7 fix).
   */
  const [previousFocus] = useState<HTMLElement | null>(
    () => document.activeElement as HTMLElement | null,
  );

  /**
   * Retry is not a close. It swaps this card for the overlay that is finally
   * loading, and that overlay moves focus itself. Handing focus back on that
   * path would yank it off the thing the user just asked for, so only a real
   * dismiss arms the restore.
   *
   * It doubles as the StrictMode guard the palette needed a store read for: a
   * development mount -> cleanup -> mount cycle runs the cleanup below with the
   * flag still `false`, so it cannot steal focus from the card 2 ms after it
   * opened.
   */
  const restoreFocus = useRef(false);
  const dismiss = useCallback(() => {
    if (!onDismiss) return;
    restoreFocus.current = true;
    onDismiss();
  }, [onDismiss]);

  /** Move focus in on mount — the first control in the card is Retry. */
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }, []);

  /**
   * Hand focus back when the card goes away.
   *
   * The restore lives in the CLEANUP, like the palette's: there is never a
   * render of this component with "dismissed" state to react to — the owner
   * unmounts the whole overlay the instant `onDismiss` flips it, and unmount
   * cleanup is the one thing React guarantees. Moving focus into a card and then
   * dropping it on `<body>` is its own keyboard trap.
   */
  useEffect(
    () => () => {
      // Only if it is still in the document: focusing a detached node just
      // drops focus again.
      if (restoreFocus.current && previousFocus?.isConnected) previousFocus.focus();
    },
    [previousFocus],
  );

  /**
   * Escape out, and Tab round.
   *
   * On `document` rather than the card, so Escape works even if something moved
   * focus back out — the same reason the pending surface listens on `window`.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;

      if (event.key === 'Escape') {
        dismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Focus escaped the card entirely (or never got in) — the scrim blocks
      // every pointer route to the page behind, so Tab must not be a way there.
      if (!(active instanceof HTMLElement && card.contains(active))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      // Wrap at the ends. In between, the browser's own tab order is already
      // correct and inside the card, so leave it alone.
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismiss]);

  return (
    <OverlayScrim>
      <div
        ref={cardRef}
        // The semantics this card always claimed — and they are now TRUE: the
        // effects above move focus to Retry on mount, trap Tab, and handle
        // Escape. Dropping the attributes was the other honest answer, but this
        // card sits on a `fixed inset-0` scrim that blocks every pointer route
        // to the page behind it — so a screen-reader user must not be able to
        // browse out to content nobody else can reach. It IS a modal (unlike
        // AppearanceDialog, which has no scrim and says `aria-modal="false"` for
        // exactly that reason), so the claim is made true, not dropped.
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid={testId ?? 'lazy-overlay-error'}
        // `data-slot="surface"` rather than a hardcoded depth utility: the
        // elevation axis owns depth, so this card goes flat/soft/lifted with the
        // theme instead of pinning one depth the Appearance picker cannot change.
        data-slot="surface"
        className="bg-background flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border p-6 text-center outline-none"
      >
        {/* A failed chunk is a decision — Retry or Close. Nothing here answers it
            on a stray scrim click, which is also how this card behaved before it
            became a real dialog: there is no outside-click dismissal to opt out
            of once Radix's dismissable layer is gone. */}
        <AlertTriangle className="text-muted-foreground size-7" aria-hidden="true" />
        <div>
          <h2 id={titleId} className="text-sm font-medium">
            {t(ERRORS_KEYS.widget.unavailable, { title })}
          </h2>
          <p id={descriptionId} className="text-muted-foreground mt-1 text-xs">
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
              onClick={dismiss}
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
  control = true,
  onShown,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  control?: boolean;
  onShown?: () => void;
}) {
  const { t } = useTranslation(LOCALE_NS);

  useEffect(() => {
    onShown?.();
  }, [onShown]);

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
      {onDismiss && control ? (
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
  pendingDismissControl = true,
  testId,
}: LazyOverlayProps) {
  // A fresh `lazy()` per attempt — the only way back out of a cached rejection.
  const { Component: Overlay, retry } = useRetryableLazy(load);
  // State, not a ref. The provider's value is captured during THIS component's
  // render, and resolving the lazy child re-renders the Suspense subtree without
  // necessarily re-rendering this parent — so a ref written by the fallback was
  // still read as `false` when the overlay arrived, and the entrance replayed
  // anyway. A state flip re-renders the provider while the fallback is still up.
  const [placeholderShown, setPlaceholderShown] = useState(false);
  const markPlaceholderShown = useCallback(() => setPlaceholderShown(true), []);

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
          <LazyOverlayPending
            onDismiss={onDismiss}
            control={pendingDismissControl}
            onShown={markPlaceholderShown}
          >
            {pending}
          </LazyOverlayPending>
        }
      >
        <PlaceholderPrecededContext.Provider value={placeholderShown}>
          <Overlay />
        </PlaceholderPrecededContext.Provider>
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
