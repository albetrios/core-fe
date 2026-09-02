import { useTranslation } from 'react-i18next';

import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { AuthForm } from '@/shared/forms/AuthForm/index.ts';

import { LOGIN_TEST_IDS } from './login.constants.ts';

/**
 * Top-level UI for the unified auth route (`/login`). One screen for sign-in
 * and sign-up — continue with Google, GitHub, passkey, or email OTP.
 *
 * The form is wrapped in a section boundary: without one, a throw anywhere in the
 * auth methods escalates to the route boundary and replaces the whole auth screen
 * (layout included) with a generic error page. Contained here, the branding and
 * layout survive and the user gets a retry in place.
 */
export function LoginPage() {
  const { t } = useTranslation(AUTH_NS);

  return (
    <div data-testid={LOGIN_TEST_IDS.page}>
      <SectionErrorBoundary
        title={t(AUTH_KEYS.auth.heading)}
        testId={LOGIN_TEST_IDS.formError}
      >
        <AuthForm />
      </SectionErrorBoundary>
    </div>
  );
}
