import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { CaptchaSlot } from '@/shared/auth/captcha/CaptchaSlot.tsx';
import { logout } from '@/shared/auth/service.ts';
import { Button } from '@/shared/components/ui/button.tsx';

export function Component() {
  const { t } = useTranslation(ERRORS_NS);
  const [signingOut, setSigningOut] = useState(false);
  // `logout()` is single-flight underneath, but the button still owes the user
  // an answer: without this it looks inert on a slow revoke and invites the
  // second click (agent-os/rules/fe-resilient-interactions.mdc section 1).
  const signOutRef = useRef(false);

  const handleSignOut = () => {
    if (signOutRef.current) return;
    signOutRef.current = true;
    setSigningOut(true);
    void logout().finally(() => {
      signOutRef.current = false;
      setSigningOut(false);
    });
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center sm:p-8"
      data-testid="unauthorized-page"
    >
      <h1 className="text-foreground text-3xl font-bold sm:text-4xl">403</h1>
      <p className="text-muted-foreground max-w-md text-base sm:text-lg">
        {t(ERRORS_KEYS.route.forbidden)}
      </p>
      {/* Two escapes so this page is never a dead-end: "Go Home" for the common
          case, and a guaranteed "Sign out" for when the resolved home would loop
          straight back here (e.g. a session whose active org denies its own
          landing surface). */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link to="/">{t(ERRORS_KEYS.route.goHome)}</Link>
        </Button>
        <Button
          variant="outline"
          onClick={handleSignOut}
          disabled={signingOut}
          isLoading={signingOut}
          data-testid="unauthorized-sign-out"
        >
          {t(signingOut ? ERRORS_KEYS.route.signingOut : ERRORS_KEYS.route.signOut)}
        </Button>
      </div>

      {/* An escalated background Turnstile challenge renders here, below the actions,
          instead of floating anywhere on its own. */}
      <CaptchaSlot testId="unauthorized-captcha-slot" />
    </div>
  );
}
