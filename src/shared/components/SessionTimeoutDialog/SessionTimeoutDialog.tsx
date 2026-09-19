import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { startIdleTimeout } from '@/shared/auth/idle-timeout.ts';
import { forceLogout } from '@/shared/auth/service.ts';
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
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

/** Warn after 5 minutes idle, auto-logout after grace (90 s) */
const WARN_AFTER_MS = 5 * 60 * 1000;
const GRACE_MS = 90 * 1000;
const LOGOUT_AFTER_MS = WARN_AFTER_MS + GRACE_MS;
const GRACE_SECONDS = Math.round(GRACE_MS / 1000);

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState(GRACE_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keys = LAYOUT_KEYS.app.sessionTimeout;

  const stopCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    // A second warn must never stack a second interval: the ref would be
    // overwritten, the first timer would keep ticking for the tab's lifetime,
    // and the two together would count down at double speed (SET-16).
    stopCountdown();
    // Anchored to a DEADLINE, not to a tick count. A background tab's interval
    // is throttled to roughly once a minute, so "subtract one per tick" drifts
    // away from the moment logout actually fires — the number on screen has to
    // mean the same thing the idle timer means.
    const deadline = Date.now() + GRACE_MS;
    setCountdown(GRACE_SECONDS);
    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) stopCountdown();
    }, 1000);
  }, [stopCountdown]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const cleanup = startIdleTimeout({
      warnAfterMs: WARN_AFTER_MS,
      logoutAfterMs: LOGOUT_AFTER_MS,
      onWarn: () => {
        setOpen(true);
        startCountdown();
      },
      onLogout: () => {
        stopCountdown();
        setOpen(false);
        forceLogout();
      },
      onActive: () => {
        stopCountdown();
        setOpen(false);
      },
    });

    const stopLifetimeWatch = startSessionLifetimeWatch(() => {
      stopCountdown();
      setOpen(false);
      forceLogout();
    });

    return () => {
      cleanup();
      stopLifetimeWatch();
      stopCountdown();
    };
  }, [isAuthenticated, startCountdown, stopCountdown]);

  const handleStaySignedIn = () => {
    stopCountdown();
    setOpen(false);
  };

  const handleSignOut = () => {
    stopCountdown();
    setOpen(false);
    forceLogout();
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent data-testid="session-timeout-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(keys.title)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(keys.description, { countdown: formatCountdown(countdown) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleSignOut} data-testid="session-signout">
            {t(keys.signOut)}
          </Button>
          <AlertDialogAction onClick={handleStaySignedIn} data-testid="session-stay">
            {t(keys.staySignedIn)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
