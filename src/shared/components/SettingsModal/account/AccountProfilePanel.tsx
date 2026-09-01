import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatSettingsBreadcrumb,
  SETTINGS_GROUP_LABEL_KEYS,
  SETTINGS_KEYS,
  SETTINGS_NS,
  SETTINGS_SECTION_LABEL_KEYS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import {
  computeProfileCompleteness,
  type ProfileInput,
} from '@/shared/forms/ProfileForm/contracts.ts';
import { ProfileForm } from '@/shared/forms/ProfileForm/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

/**
 * Profile section — name and job title (the fields core-be persists).
 * Reuses {@link ProfileForm} so there's one source of truth.
 */
export function AccountProfilePanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const user = useAuthStore((s) => s.user);
  /**
   * What the store currently says the profile is. Derived, never snapshotted:
   * the session can write a fuller user AFTER this panel mounted (a proactive
   * refresh re-reads me/context), and a `useState` initializer only ever sees
   * the first one — leaving an empty form and a 0% meter for a profile that is
   * demonstrably filled in (SET-18).
   */
  const seeded = useMemo<ProfileInput>(
    () => ({ name: user?.name ?? '', jobTitle: user?.jobTitle ?? '' }),
    [user?.name, user?.jobTitle],
  );
  /** What the user has typed, if anything — it outranks the store. */
  const [edited, setEdited] = useState<ProfileInput | null>(null);
  const values = edited ?? seeded;
  const completeness = useMemo(() => computeProfileCompleteness(values), [values]);

  const panels = SETTINGS_KEYS.panels.profile;
  const breadcrumb = formatSettingsBreadcrumb(
    t(SETTINGS_GROUP_LABEL_KEYS.account),
    t(SETTINGS_SECTION_LABEL_KEYS.profile),
  );

  return (
    <div className="space-y-6" data-testid="settings-section-profile">
      <SectionHeader
        breadcrumb={breadcrumb}
        title={t(panels.title)}
        description={t(panels.description)}
        meta={t(panels.completeness, { percent: completeness })}
      />
      <ProfileForm
        email={user?.email ?? ''}
        defaultValues={seeded}
        onValuesChange={setEdited}
      />
    </div>
  );
}
