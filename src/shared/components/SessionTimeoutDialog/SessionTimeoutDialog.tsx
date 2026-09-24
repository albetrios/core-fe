import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import { type IdleTimeoutHandle, startIdleTimeout } from '@/shared/auth/idle-timeout.ts';
import { forceLogout, logout, type SessionEndReason } from '@/shared/auth/service.ts';
import { startSessionLifetimeWatch } from '@/shared/auth/session-lifetime.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

/** Warn after 5 minutes idle, auto-logout after grace (90 s) */
const WARN_AFTER_MS = 5 * 60 * 1000;
const GRACE_MS = 90 * 1000;
const LOGOUT_AFTER_MS = WARN_AFTER_MS + GRACE_MS;

/**
 * Last-activity timestamp shared by every tab (a number, never a token). The
 * session is one per browser but this dialog mounts once per tab: unshared, a
 * tab left in the background counts itself idle and signs the user out of the
 * tab they are working in. Derived from `PRODUCT_NAMESPACE`, like the other
 * auth storage keys.
 */
const IDLE_ACTIVITY_STORAGE_KEY = `${PRODUCT_NAMESPACE}:last-activity`;

/**
 * - `idle` — nothing to show.
 * - `warning` — the dialog is up and the user owes it an explicit answer.
 * - `signing-out` — an answer was given (or the deadline passed) and the revoke
 *   is in flight. The dialog STAYS, so the app behind it cannot be used with a
 *   session that is being torn down, and both buttons are dead.
 */
type Phase = 'idle' | 'warning' | 'signing-out';

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function secondsUntil(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * The session timer sits outside the app-shell boundary (it must survive a
 * crash in the shell), so it needs one of its own: a throw in here would
 * otherwise escalate to the route boundary and replace the whole authenticated
 * application. `inline` because this renders as a sibling in the layout's flex
 * row, where a 120px card would push the app sideways.
 */
export function SessionTimeoutDialog() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <SectionErrorBoundary
      variant="inline"
      title={t(ERRORS_KEYS.widget.sessionTimeout)}
      testId="session-timeout-error"
    >
      <SessionTimeoutDialogBody />
    </SectionErrorBoundary>
  );
}

function SessionTimeoutDialogBody() {
  const { t } = useTranslation(LAYOUT_NS);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(Math.round(GRACE_MS / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleRef = useRef<IdleTimeoutHandle | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  /**
   * Synchronous single-flight latch (agent-os/rules/fe-resilient-interactions.mdc
   * section 1). `phase` only disables the buttons a render later, and the
   * deadline can fire in the same frame as a press on "Sign out" — without this
   * both would start a sign-out. `logout()` is single-flight underneath too;
   * this keeps the second caller from even relabelling the analytics reason.
   */
  const signingOutRef = useRef(false);
  const keys = LAYOUT_KEYS.app.sessionTimeout;

  const stopCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (logoutAt: number) => {
      // A second warn must never stack a second interval: the ref would be
      // overwritten, the first timer would keep ticking for the tab's lifetime,
      // and the two together would count down at double speed (SET-16).
      stopCountdown();
      // Anchored to the idle timer's own DEADLINE, not to a tick count and not
      // to a second `Date.now() + grace` taken here. A background tab's interval
      // is throttled to roughly once a minute, so "subtract one per tick" drifts
      // away from the moment logout actually fires — the number on screen has to
      // mean the same thing the idle timer means.
      setCountdown(secondsUntil(logoutAt));
      intervalRef.current = setInterval(() => {
        const remaining = secondsUntil(logoutAt);
        setCountdown(remaining);
        if (remaining === 0) stopCountdown();
      }, 1000);
    },
    [stopCountdown],
  );

  /**
   * End the session for real: revoke it server-side, THEN clear local state.
   *
   * This used to call `forceLogout()`, which only clears this tab. The HttpOnly
   * refresh cookie stayed valid, so `/login` booted, silently refreshed, and the
   * guest-only guard sent the user straight back to the dashboard — neither the
   * button nor the deadline could actually sign anyone out.
   */
  const signOut = useCallback(
    (reason: Exclude<SessionEndReason, 'force_logout' | 'cross_tab'>) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      stopCountdown();
      idleRef.current?.stop();
      setPhase('signing-out');
      logout({ reason }).catch((error: unknown) => {
        // `logout()` clears local state in a `finally`, so this is the path
        // where even that threw. Never strand the user behind a dialog whose
        // buttons are disabled: report it and leave by the local-only route.
        reportError(error, { scope: 'session-timeout-sign-out', reason });
        forceLogout({ reason });
      });
    },
    [stopCountdown],
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const idle = startIdleTimeout({
      warnAfterMs: WARN_AFTER_MS,
      logoutAfterMs: LOGOUT_AFTER_MS,
      storageKey: IDLE_ACTIVITY_STORAGE_KEY,
      onWarn: ({ logoutAt }) => {
        setPhase('warning');
        startCountdown(logoutAt);
      },
      onLogout: () => signOut('idle_timeout'),
      // Fired only for activity in ANOTHER tab — the user is demonstrably here.
      onActive: () => {
        stopCountdown();
        setPhase('idle');
      },
    });
    idleRef.current = idle;

    const stopLifetimeWatch = startSessionLifetimeWatch(() => signOut('session_expired'));

    return () => {
      idle.stop();
      idleRef.current = null;
      stopLifetimeWatch();
      stopCountdown();
    };
  }, [isAuthenticated, signOut, startCountdown, stopCountdown]);

  const handleStaySignedIn = () => {
    if (signingOutRef.current) return;
    stopCountdown();
    // Explicit, because nothing else restarts the clock any more: activity in
    // this tab is deliberately ignored while the warning is up.
    idleRef.current?.extend();
    setPhase('idle');
  };

  const signingOut = phase === 'signing-out';

  return (
    <AlertDialog open={phase !== 'idle'}>
      <AlertDialogContent
        data-testid="session-timeout-dialog"
        aria-busy={signingOut}
        // Radix focuses the FIRST tabbable element when there is no Cancel, and
        // that is "Sign out": someone who comes back to the keyboard and presses
        // Space or Enter to wake the screen would sign themselves out. The safe
        // default for an unattended prompt is the option that loses nothing.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          stayRef.current?.focus({ preventScroll: true });
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t(keys.title)}</AlertDialogTitle>
          <AlertDialogDescription>
            {signingOut
              ? t(keys.signingOutDescription)
              : t(keys.description, { countdown: formatCountdown(countdown) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => signOut('logout')}
            isLoading={signingOut}
            data-testid="session-signout"
          >
            {signingOut ? t(keys.signingOut) : t(keys.signOut)}
          </Button>
          <AlertDialogAction
            ref={stayRef}
            onClick={handleStaySignedIn}
            disabled={signingOut}
            data-testid="session-stay"
          >
            {t(keys.staySignedIn)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
