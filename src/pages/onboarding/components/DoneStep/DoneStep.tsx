import { useTranslation } from 'react-i18next';

import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import { ONBOARDING_KEYS, ONBOARDING_NS } from '../../onboarding.constants.ts';
import type { OnboardingStep } from '../../onboarding-flow.ts';

/**
 * Review summary shown before the final "Enter dashboard" action. Only rows
 * this flow actually collected are shown: `organizationName` exists only when
 * the `workspace` step ran (team-only mode) and invites only when the `invite`
 * step ran — rendering them unconditionally showed a dangling "Organization: —"
 * in personal/hybrid flows that never asked for one.
 *
 * `steps` arrives as a prop rather than being re-derived here. This component
 * used to call `deriveOnboardingSteps` a second time off its own `useMeContext`,
 * which meant a missing context would have fallen back to the permissive
 * deployment flags and summarised the WRONG flow — the same latent hazard the
 * page's gate exists to prevent (ONB-9). One derivation, passed down.
 */
export function DoneStep({ steps }: { steps: readonly OnboardingStep[] }) {
  const { t } = useTranslation(ONBOARDING_NS);
  /*
   * Field-level selectors (ONB-13). `useOnboardingStore()` with no selector
   * subscribes to the whole store, so this summary re-rendered on every
   * keystroke anywhere in the wizard.
   */
  const firstName = useOnboardingStore((s) => s.data.firstName);
  const lastName = useOnboardingStore((s) => s.data.lastName);
  const organizationName = useOnboardingStore((s) => s.data.organizationName);
  const inviteCount = useOnboardingStore((s) => s.data.invites.length);
  const empty = t(ONBOARDING_KEYS.done.emptyValue);

  return (
    <dl className="space-y-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t(ONBOARDING_KEYS.done.nameLabel)}</dt>
        <dd className="font-medium">
          {[firstName, lastName].filter(Boolean).join(' ') || empty}
        </dd>
      </div>
      {steps.includes('workspace') ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {t(ONBOARDING_KEYS.done.organizationLabel)}
          </dt>
          <dd className="font-medium">{organizationName || empty}</dd>
        </div>
      ) : null}
      {steps.includes('invite') ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {t(ONBOARDING_KEYS.done.invitesLabel)}
          </dt>
          <dd className="font-medium">
            {t(ONBOARDING_KEYS.done.invitesPending, { count: inviteCount })}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
