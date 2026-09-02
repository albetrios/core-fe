import { useTranslation } from 'react-i18next';

import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';

import { MfaForm } from './forms/MfaForm/index.ts';
import { AUTH_KEYS, AUTH_NS, MFA_TEST_IDS } from './mfa.constants.ts';

/**
 * Top-level UI for the `/mfa` route. Thin wrapper that mounts the
 * {@link MfaForm} inside the page boundary and exposes the page-level
 * `data-testid` for E2E selection.
 *
 * The form sits behind a section boundary (house rule 2): a throw inside the code
 * entry — a bad `location.state` shape, a locale miss, a third-party autofill
 * extension — otherwise escalates to the route boundary and replaces the whole
 * screen, layout and branding included, mid-login. Contained here, the user keeps
 * the auth shell and gets a retry in place instead of a dead end halfway through
 * a sign-in they cannot restart without new credentials.
 */
export function MfaPage() {
  const { t } = useTranslation(AUTH_NS);

  return (
    <div data-testid={MFA_TEST_IDS.page}>
      <SectionErrorBoundary
        title={t(AUTH_KEYS.mfa.heading)}
        testId={MFA_TEST_IDS.boundaryError}
      >
        <MfaForm />
      </SectionErrorBoundary>
    </div>
  );
}
