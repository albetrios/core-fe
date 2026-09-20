import { useTranslation } from 'react-i18next';

import { Rocket } from '@/shared/icons/index.ts';

import { ONBOARDING_KEYS, ONBOARDING_NS } from '../../onboarding.constants.ts';

interface WelcomeStepProps {
  /** Whether this flow's derived steps include creating an org + inviting. */
  teamSetupIncluded?: boolean;
}

/**
 * First onboarding step — short pitch for the setup flow. The pitch must match
 * the steps that actually follow: only team-setup flows may promise "create
 * your first organization, and invite your team" — hybrid/personal flows have
 * no such steps, so they get the profile-focused copy instead.
 */
export function WelcomeStep({ teamSetupIncluded = false }: WelcomeStepProps) {
  const { t } = useTranslation(ONBOARDING_NS);
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div
        data-slot="pill"
        className="bg-primary/10 flex h-14 w-14 items-center justify-center rounded-full"
      >
        <Rocket className="text-primary h-7 w-7" />
      </div>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t(
          teamSetupIncluded
            ? ONBOARDING_KEYS.welcome.body
            : ONBOARDING_KEYS.welcome.bodyPersonal,
        )}
      </p>
    </div>
  );
}
