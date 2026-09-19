import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { organizationNameFromEmail } from '@/lib/onboarding-defaults.ts';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import { deriveOrganizationSlug } from '@/shared/tenancy/my-organizations.ts';

import {
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from '../../onboarding.constants.ts';
import { isValidWorkspaceSlug } from '../../onboarding-flow.ts';

/** Names the organization that the final step will create. */
export function WorkspaceStep() {
  const { t } = useTranslation(ONBOARDING_NS);
  /*
   * Field-level selectors (ONB-13). `useOnboardingStore()` with no selector
   * subscribes to the whole store, and `patch` replaces the entire `data`
   * object, so this component re-rendered on every keystroke anywhere in the
   * wizard. `patch` is a stable store closure.
   */
  const organizationName = useOnboardingStore((s) => s.data.organizationName);
  const organizationSlug = useOnboardingStore((s) => s.data.organizationSlug);
  const patch = useOnboardingStore((s) => s.patch);
  const email = useAuthStore((s) => s.user?.email);

  useEffect(() => {
    const store = useOnboardingStore.getState();
    if (store.data.organizationName) return;
    const suggested = email ? organizationNameFromEmail(email) : null;
    if (suggested) store.patch({ organizationName: suggested });
  }, [email]);

  /*
   * Shown where the value is typed. Gating Continue without saying why leaves
   * the user staring at a dead button; saying nothing at all let an uppercase
   * or spaced slug through to Finish, two steps away, where it surfaced as a
   * generic error (ONB-6).
   */
  const slugInvalid = !isValidWorkspaceSlug(organizationSlug);

  const previewSlug =
    organizationSlug.trim() ||
    deriveOrganizationSlug(organizationName) ||
    t(ONBOARDING_KEYS.workspace.slugFallback);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ob-org">
          {t(ONBOARDING_KEYS.workspace.organizationNameLabel)}
        </Label>
        <Input
          id="ob-org"
          value={organizationName}
          onChange={(e) => patch({ organizationName: e.target.value })}
          placeholder={t(ONBOARDING_KEYS.workspace.organizationNamePlaceholder)}
          data-testid={ONBOARDING_TEST_IDS.organizationName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob-slug">{t(ONBOARDING_KEYS.workspace.slugLabel)}</Label>
        <Input
          id="ob-slug"
          value={organizationSlug}
          onChange={(e) => patch({ organizationSlug: e.target.value })}
          placeholder={t(ONBOARDING_KEYS.workspace.slugPlaceholder)}
          aria-invalid={slugInvalid}
          aria-describedby={slugInvalid ? 'ob-slug-error' : undefined}
          data-testid={ONBOARDING_TEST_IDS.organizationSlug}
        />
        {slugInvalid ? (
          <p
            id="ob-slug-error"
            role="alert"
            className="text-destructive text-xs"
            data-testid={ONBOARDING_TEST_IDS.slugError}
          >
            {t(ONBOARDING_KEYS.workspace.slugInvalid)}
          </p>
        ) : null}
        <p
          className="text-muted-foreground text-xs"
          data-testid={ONBOARDING_TEST_IDS.urlPreview}
        >
          <Trans
            ns={ONBOARDING_NS}
            i18nKey={ONBOARDING_KEYS.workspace.urlPreview}
            values={{ slug: previewSlug }}
            components={{
              1: <span className="text-foreground font-medium" />,
            }}
          />
        </p>
      </div>
    </div>
  );
}
