import { useTranslation } from 'react-i18next';

import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import { BrandLoader } from '@/shared/components/BrandLoader/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { AUTH_FORM_TEST_IDS } from '@/shared/forms/AuthForm/auth-form.constants.ts';

type AuthAutoGooglePendingProps = {
  /** Cancels the armed auto sign-in and drops back to the method picker. */
  onSkip: () => void;
};

/**
 * The "signing you in with Google" screen, shown from the first commit whenever
 * auto Google sign-in is armed.
 *
 * The loader is the app's own branded one, but rendered **in flow** via
 * {@link BrandLoader}. `FullPageSpinner` wraps that same visual in a `fixed inset-0`
 * opaque overlay, so as a sibling of the cancel button it painted straight over it:
 * the button was on screen, but hit-testing returned the overlay and the click never
 * reached it, leaving the user no way out of this state (LOGIN-1).
 */
export function AuthAutoGooglePending({ onSkip }: AuthAutoGooglePendingProps) {
  const { t } = useTranslation(AUTH_NS);
  const signingIn = t(AUTH_KEYS.auth.autoGoogleSigningIn);

  return (
    <div
      className="flex flex-col items-center gap-4 py-8"
      data-testid={AUTH_FORM_TEST_IDS.autoGooglePending}
    >
      <output className="flex flex-col items-center gap-4" aria-label={signingIn}>
        {/* The same branded loader the app boots with — in-flow, so the copy and
            the cancel button below it stay visible and clickable. */}
        <BrandLoader />
        <p className="text-muted-foreground text-center text-sm">{signingIn}</p>
      </output>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={onSkip}
        data-testid={AUTH_FORM_TEST_IDS.skipAutoGoogle}
      >
        {t(AUTH_KEYS.auth.useEmailInstead)}
      </Button>
    </div>
  );
}
