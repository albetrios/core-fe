import { useTranslation } from 'react-i18next';

import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import { CaptchaSlot } from '@/shared/auth/captcha/CaptchaSlot.tsx';
import { Fingerprint } from '@/shared/icons/index.ts';

import { AUTH_FORM_TEST_IDS } from '../../auth-form.constants.ts';
import type { AuthContinuePending } from '../../auth-form-pending.ts';
import { AuthMethodButton } from '../AuthMethodButton/index.ts';
import { ProviderIcon } from './ProviderIcon.tsx';

interface AuthSocialMethodsProps {
  providers: string[];
  showPasskey: boolean;
  pending: AuthContinuePending | null;
  /** Which control an escalated captcha challenge currently belongs to. */
  challengeFor: string | null;
  /** Key identifying a provider's button as a challenge target. */
  providerChallengeKey: (provider: string) => string;
  onProvider: (provider: string) => void;
  onPasskey: () => void;
  /** E2E ids stay owned by the form itself — see AuthForm. */
  providerTestId: (provider: string) => string;
  passkeyTestId: string;
}

/**
 * The social half of the auth screen — one button per configured OAuth provider,
 * plus passkey when it is available. Presentational: every guard (single-flight,
 * captcha gating) lives in the parent, which owns `pending`.
 */
export function AuthSocialMethods({
  providers,
  showPasskey,
  pending,
  challengeFor,
  providerChallengeKey,
  onProvider,
  onPasskey,
  providerTestId,
  passkeyTestId,
}: AuthSocialMethodsProps) {
  const { t } = useTranslation(AUTH_NS);

  return (
    <div className="flex flex-col gap-3" data-testid={AUTH_FORM_TEST_IDS.socialMethods}>
      {providers.map((provider) => (
        // The provider button and its own challenge anchor travel together: a
        // challenge raised here renders BELOW this button, so the button the user
        // pressed never moves out from under them and the challenge is
        // unmistakably about the method they chose.
        <div key={provider} className="flex flex-col gap-3">
          <AuthMethodButton
            target={{ method: 'oauth', provider }}
            pending={pending}
            icon={<ProviderIcon provider={provider} />}
            label={t(AUTH_KEYS.auth.continueWithProvider, {
              provider: t(AUTH_KEYS.login.oauth.providerKey(provider)),
            })}
            onClick={() => onProvider(provider)}
            testId={providerTestId(provider)}
          />
          <CaptchaSlot
            active={challengeFor === providerChallengeKey(provider)}
            testId={AUTH_FORM_TEST_IDS.captchaSlot}
          />
        </div>
      ))}

      {showPasskey ? (
        <AuthMethodButton
          target={{ method: 'passkey' }}
          pending={pending}
          icon={<Fingerprint className="size-4" data-icon="" />}
          label={t(AUTH_KEYS.auth.continueWithPasskey)}
          onClick={onPasskey}
          testId={passkeyTestId}
        />
      ) : null}
    </div>
  );
}
