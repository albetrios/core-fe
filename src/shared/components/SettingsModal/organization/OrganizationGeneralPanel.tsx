import { type ChangeEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
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
import { useUpdateOrganization } from '@/shared/hooks/useUpdateOrganization/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { listMyOrganizations } from '@/shared/tenancy/my-organizations.ts';

/** Max logo size accepted by the uploader — keeps the data URL sane until CDN upload lands. */
const MAX_LOGO_BYTES = 1024 * 1024;

type UpdateMutation = ReturnType<typeof useUpdateOrganization>;

/**
 * Organization logo (FE-33) — preview + upload/remove. Client preview uses a data
 * URL until the live API accepts a CDN `logo_url`. Gated on the manage permission;
 * permission; rejects non-images and oversized files before reading.
 */
function OrgLogoCard({
  logoUrl,
  name,
  canManage,
  update,
}: {
  logoUrl: string | null;
  name: string;
  canManage: boolean;
  update: UpdateMutation;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (name || '?').charAt(0).toUpperCase();
  /**
   * Reading the file is part of the upload as far as the user is concerned. A
   * multi-megabyte logo spends that whole window in `FileReader`, before the
   * mutation exists — so `update.isPending` covered none of it and the click
   * looked like it had done nothing (SET-27).
   */
  const [isReading, setIsReading] = useState(false);
  const busy = isReading || update.isPending;

  function onLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after a failure
    if (!file) return;
    if (!file.type.startsWith('image/')) {
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
    const reader = new FileReader();
    setIsReading(true);
    reader.onload = () => {
      setIsReading(false);
      if (typeof reader.result === 'string') update.mutate({ logoUrl: reader.result });
    };
    reader.onerror = () => {
      setIsReading(false);
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.organization.logoReadFailed, { ns: ERRORS_NS }),
      );
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
        <CardDescription>
          Shown in the org switcher and on invites. Square images look best.
        </CardDescription>
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
              alt={`${name || 'Organization'} logo`}
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
              accept="image/*"
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
              {busy ? 'Uploading…' : 'Upload logo'}
            </Button>
            {logoUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => update.mutate({ logoUrl: null })}
                disabled={busy}
                data-testid="org-logo-remove"
              >
                Remove
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Only organization admins can change the logo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Organization general settings — rename the active org (name-only; the slug
 * drives URLs and is read-only here) and manage its logo (FE-33). Gated on the
 * membership:manage permission (team orgs only). The
 * editable name is derived as a local draft over the server value (no
 * prop→state effect); saving updates via {@link useUpdateOrganization}.
 */
export function OrganizationGeneralPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const organizationId = useOrganizationStore((s) => s.organizationId);
  const organizationSlug = useOrganizationStore((s) => s.organizationSlug);
  const canManage = useCan({
    permission: 'membership:manage',
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
          <CardTitle className="text-base">Basics</CardTitle>
          <CardDescription>
            These appear in the org switcher, invites, and email receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={tSettings(SETTINGS_KEYS.panels.general.namePlaceholder)}
              disabled={!canManage}
              data-testid="org-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={activeOrg?.slug ?? organizationSlug ?? ''}
              readOnly
              disabled
              data-testid="org-slug"
            />
            <p className="text-muted-foreground text-xs">
              Used in URLs and API paths. Contact support to change it.
            </p>
          </div>
          {canManage ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || update.isPending}
                data-testid="org-general-save"
              >
                Save changes
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <OrgLogoCard
        logoUrl={activeOrg?.logoUrl ?? null}
        name={activeOrg?.name ?? ''}
        canManage={canManage}
        update={update}
      />
    </>
  );
}
