import { type ChangeEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  UPLOAD_IMAGE_CONTENT_TYPES,
  UPLOAD_MAX_BYTES,
  type UploadImageContentType,
} from '@/shared/api/uploads-api.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { useRegisterSettingsDirty } from '@/shared/components/SettingsModal/settings-dirty.tsx';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useCan } from '@/shared/hooks/useCan/index.ts';
import {
  useRemoveOrganizationLogo,
  useUploadOrganizationLogo,
} from '@/shared/hooks/useOrganizationLogo/index.ts';
import { useUpdateOrganization } from '@/shared/hooks/useUpdateOrganization/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { listMyOrganizations } from '@/shared/tenancy/my-organizations.ts';

/** Matches core-be's `organization-logo` ceiling; a larger file is refused at presign. */
const MAX_LOGO_BYTES = UPLOAD_MAX_BYTES['organization-logo'];

type UpdateMutation = ReturnType<typeof useUpdateOrganization>;

/**
 * Organization logo (FE-33) — preview + upload/remove, through core-be's real storage flow
 * (presign → storage → confirm → attach). Gated on `organization:update`; rejects the content
 * types and sizes core-be would refuse before spending a round trip on them.
 */
function OrgLogoCard({
  logoUrl,
  name,
  canManage,
}: {
  logoUrl: string | null;
  name: string;
  canManage: boolean;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const general = SETTINGS_KEYS.panels.general;
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (name || '?').charAt(0).toUpperCase();
  /**
   * The whole upload — presign, storage write, confirm, attach — is one mutation, so
   * `isPending` covers the entire window the user is waiting on. The old flow read the file
   * in the browser first, outside any mutation, and that stretch looked like nothing had
   * looked like it had done nothing (SET-27).
   */
  const uploadLogo = useUploadOrganizationLogo();
  const removeLogo = useRemoveOrganizationLogo();
  const busy = uploadLogo.isPending || removeLogo.isPending;

  function onLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after a failure
    if (!file) return;
    // core-be rejects anything outside this set — SVG included — so refuse it here rather
    // than spending a presign round trip to be told no.
    if (!UPLOAD_IMAGE_CONTENT_TYPES.includes(file.type as UploadImageContentType)) {
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.organization.logoInvalidType, { ns: ERRORS_NS }),
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.organization.logoTooLarge, { ns: ERRORS_NS }),
      );
      return;
    }
    uploadLogo.mutate(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(general.logoTitle)}</CardTitle>
        <CardDescription>{t(general.logoDescription)}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div
          data-slot="icon-chip"
          className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden"
          data-testid="org-logo-preview"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={name ? t(general.logoAlt, { name }) : t(general.logoAltFallback)}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-muted-foreground text-xl font-semibold">{initial}</span>
          )}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={UPLOAD_IMAGE_CONTENT_TYPES.join(',')}
              className="hidden"
              onChange={onLogoFile}
              data-testid="org-logo-input"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              isLoading={busy}
              data-testid="org-logo-upload"
            >
              {busy ? t(general.uploading) : t(general.uploadLogo)}
            </Button>
            {logoUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeLogo.mutate()}
                disabled={busy}
                data-testid="org-logo-remove"
              >
                {t(general.removeLogo)}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t(general.logoReadOnly)}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Organization general settings — rename the active org (name-only; the slug
 * drives URLs and is read-only here) and manage its logo (FE-33). Gated on the
 * organization:update permission (team orgs only). The
 * editable name is derived as a local draft over the server value (no
 * prop→state effect); saving updates via {@link useUpdateOrganization}.
 */
export function OrganizationGeneralPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const organizationId = useOrganizationStore((s) => s.organizationId);
  const organizationSlug = useOrganizationStore((s) => s.organizationSlug);
  // `PATCH /tenancy/organization` (rename) and `PUT`/`DELETE .../logo` all enforce
  // `organization:update` on core-be — not `membership:manage`, which guards the membership
  // routes instead. The two coincide on the seeded Admin role, which is what hid this.
  const canManage = useCan({
    permission: 'organization:update',
    teamOrganizationOnly: true,
  });
  const update = useUpdateOrganization();

  const orgsQuery = useAppQuery({
    queryKey: ['organizations'],
    queryFn: listMyOrganizations,
    // The panel wraps this in a QueryBoundary.
    notifyOnError: false,
  });

  return (
    <div className="space-y-6" data-testid="settings-section-org-general">
      <SectionHeader
        title={t(SETTINGS_KEYS.panels.general.title)}
        description={t(SETTINGS_KEYS.panels.general.description)}
      />
      <QueryBoundary
        query={orgsQuery}
        errorMessage={t(SETTINGS_KEYS.panels.general.loadFailed)}
      >
        {(orgs) => (
          <OrganizationGeneralForm
            orgs={orgs}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            canManage={canManage}
            update={update}
          />
        )}
      </QueryBoundary>
    </div>
  );
}

function OrganizationGeneralForm({
  orgs,
  organizationId,
  organizationSlug,
  canManage,
  update,
}: {
  orgs: Awaited<ReturnType<typeof listMyOrganizations>>;
  organizationId: string | null;
  organizationSlug: string | null;
  canManage: boolean;
  update: UpdateMutation;
}) {
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const general = SETTINGS_KEYS.panels.general;
  const activeOrg = orgs.find((o) => o.id === organizationId);

  const serverName = activeOrg?.name ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? serverName;
  const trimmed = name.trim();
  const dirty = trimmed !== serverName && trimmed.length > 0;
  useRegisterSettingsDirty('org-general-name', dirty);

  function save() {
    if (!dirty) return;
    update.mutate({ name: trimmed }, { onSuccess: () => setDraft(null) });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tSettings(general.basicsTitle)}</CardTitle>
          <CardDescription>{tSettings(general.basicsDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">{tSettings(general.nameLabel)}</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={tSettings(general.namePlaceholder)}
              disabled={!canManage}
              data-testid="org-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">{tSettings(general.slugLabel)}</Label>
            <Input
              id="org-slug"
              value={activeOrg?.slug ?? organizationSlug ?? ''}
              readOnly
              disabled
              data-testid="org-slug"
            />
            <p className="text-muted-foreground text-xs">{tSettings(general.slugHint)}</p>
          </div>
          {canManage ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || update.isPending}
                data-testid="org-general-save"
              >
                {tSettings(general.save)}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <OrgLogoCard
        logoUrl={activeOrg?.logoUrl ?? null}
        name={activeOrg?.name ?? ''}
        canManage={canManage}
      />
    </>
  );
}
