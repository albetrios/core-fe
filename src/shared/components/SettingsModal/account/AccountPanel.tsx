import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { forceLogout } from '@/shared/auth/service.ts';
import { getAccessToken } from '@/shared/auth/token.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog.tsx';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { Copy, ShieldCheck, Trash, TriangleAlert } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * Account section — read-only account metadata plus a destructive "danger
 * zone" gated behind a confirm dialog.
 *
 * **Delete** is wired to core-be `DELETE /users/me`, then tears down the local
 * session. (A "Deactivate" button was removed: core-be has no deactivate
 * endpoint, so it only ever fired a no-op success toast — delete is the real,
 * working destructive action.)
 */
export function AccountPanel() {
  const { t: tCommon } = useTranslation(LOCALE_NS);
  const { t } = useTranslation(SETTINGS_NS);
  const accountPanels = SETTINGS_KEYS.panels.account;
  const user = useAuthStore((s) => s.user);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const userId = user?.id ?? '—';
  const email = user?.email ?? '—';
  const role = user?.role ?? 'user';

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      notify.success(i18n.t(ERRORS_KEYS.frontend.account.copySuccess, { ns: ERRORS_NS }));
    } catch {
      notify.error(i18n.t(ERRORS_KEYS.frontend.account.copyFailed, { ns: ERRORS_NS }));
    }
  };

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await authApi.deleteAccount(token);
    },
    onSuccess: () => {
      setConfirmDelete(false);
      notify.success(
        i18n.t(ERRORS_KEYS.frontend.account.accountDeletionPending, { ns: ERRORS_NS }),
      );
      // The account (and its session) no longer exists — tear down the local
      // session and route to /login. `logout` reason keeps it non-forced.
      forceLogout({ reason: 'logout' });
    },
    onError: (error) => {
      notify.error(mapFrontendError(error));
    },
  });

  return (
    <div className="space-y-6" data-testid="settings-section-account">
      <SectionHeader
        title={t(accountPanels.title)}
        description={t(accountPanels.description)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(accountPanels.infoTitle)}</CardTitle>
          <CardDescription>{t(accountPanels.infoDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <InfoRow label={t(accountPanels.accountIdLabel)}>
            <span className="flex items-center gap-2">
              <code className="bg-muted rounded-sm px-1.5 py-0.5 text-xs">{userId}</code>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon(LOCALE_KEYS.copyAccountId)}
                onClick={() => void copyId()}
                data-testid="account-copy-id"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
          </InfoRow>
          <InfoRow label={t(accountPanels.emailLabel)}>{email}</InfoRow>
          <InfoRow label={t(accountPanels.roleLabel)}>
            <Badge variant="secondary" className="capitalize">
              {role}
            </Badge>
          </InfoRow>
          <InfoRow label={t(accountPanels.emailVerifiedLabel)}>
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" /> {t(accountPanels.verified)}
            </Badge>
          </InfoRow>
        </CardContent>
      </Card>

      <Card className="border-destructive/40" data-testid="danger-zone">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <TriangleAlert className="h-4 w-4" /> {t(accountPanels.dangerZone)}
          </CardTitle>
          <CardDescription>{t(accountPanels.dangerZoneDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{t(accountPanels.deleteHeading)}</p>
              <p className="text-muted-foreground text-sm">
                {t(accountPanels.deleteBody)}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              data-testid="account-delete"
            >
              <Trash className="me-2 h-4 w-4" /> {t(accountPanels.deleteAction)}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(accountPanels.deleteTitle)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(accountPanels.deleteDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="account-delete-cancel">
              {t(accountPanels.deleteCancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => {
                // Keep the dialog open until the request resolves (success routes
                // away; error stays so the user can retry).
                e.preventDefault();
                deleteAccount.mutate();
              }}
              isLoading={deleteAccount.isPending}
              data-testid="account-delete-confirm"
            >
              {t(accountPanels.deleteConfirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
