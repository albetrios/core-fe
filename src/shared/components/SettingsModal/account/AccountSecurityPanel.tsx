import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { copySensitiveText } from '@/lib/sensitive-clipboard.ts';
import type { MfaEnrollment } from '@/shared/api/mfa-api.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { QrCode } from '@/shared/components/QrCode/index.ts';
import { RecoveryCodesPanel } from '@/shared/components/RecoveryCodesPanel/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import { SecurityOverviewCard } from '@/shared/components/SecurityOverviewCard/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { useStepUpGuard } from '@/shared/components/StepUpDialog/index.ts';
import { TotpCodeInput } from '@/shared/components/TotpCodeInput/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import {
  useBeginMfaEnrollment,
  useConfirmMfaEnrollment,
  useDisableMfa,
  useMfaStatus,
} from '@/shared/hooks/useMfa/index.ts';
import {
  usePasskeys,
  useRegisterPasskey,
  useRemovePasskey,
} from '@/shared/hooks/usePasskeys/index.ts';
import { Copy, Fingerprint, ShieldCheck, Trash } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';

/** Two-factor card: QR enroll → 6-digit OTP → recovery codes + disable. */
function MfaCard() {
  const { t } = useTranslation(SETTINGS_NS);
  // The WHOLE query, not just `data`: `?? false` is indistinguishable from a
  // real "2FA is off", so the card used to open claiming Disabled with a Set-up
  // button while the status was still loading — and said the same thing forever
  // when the read failed. A security state has to be known before it is stated.
  const mfaStatus = useMfaStatus();
  const mfaEnabled = mfaStatus.data ?? false;
  const begin = useBeginMfaEnrollment();
  const confirm = useConfirmMfaEnrollment();
  const disable = useDisableMfa();
  const { guard, isGuarding, stepUpDialog } = useStepUpGuard();

  const [setupOpen, setSetupOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  function closeSetup() {
    setSetupOpen(false);
    setEnrollment(null);
    setCode('');
    setRecoveryCodes(null);
    setConfirmError(null);
    setSecretCopied(false);
  }

  function handleStartSetup() {
    setCode('');
    setConfirmError(null);
    setRecoveryCodes(null);
    setSecretCopied(false);
    // Enrollment is step-up gated; the bootstrap email-code factor is allowed
    // here (it exists exactly so a passwordless account can enroll its first
    // second factor).
    void guard(
      () =>
        begin.mutateAsync().then((result) => {
          setEnrollment(result);
          setSetupOpen(true);
        }),
      {
        onError: () => notify.error(t(SETTINGS_KEYS.security.mfa.errors.setupFailed)),
      },
    );
  }

  function handleSubmitCode(nextCode = code) {
    if (nextCode.length < 6) return;
    setConfirmError(null);
    confirm
      .mutateAsync(nextCode)
      .then((result) => setRecoveryCodes(result.recoveryCodes))
      .catch(() => setConfirmError(t(SETTINGS_KEYS.security.mfa.errors.invalidCode)));
  }

  async function handleCopySecret() {
    if (!enrollment?.secret) return;
    const ok = await copySensitiveText(enrollment.secret);
    if (ok) {
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2000);
      notify.info(t(SETTINGS_KEYS.security.recoveryCodes.clipboardNotice));
    } else {
      notify.error(t(SETTINGS_KEYS.security.mfa.errors.setupFailed));
    }
  }

  // Only rendered once the status is KNOWN — see mfaStatus above.
  const mfaAction = mfaEnabled ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setDisableOpen(true)}
      disabled={isGuarding}
      data-testid="mfa-disable"
    >
      {t(SETTINGS_KEYS.security.mfa.disable)}
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={handleStartSetup}
      disabled={begin.isPending || isGuarding}
      data-testid="mfa-setup"
    >
      <ShieldCheck data-icon="inline-start" />
      {t(SETTINGS_KEYS.security.mfa.setup)}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {t(SETTINGS_KEYS.security.mfa.title)}
            </CardTitle>
            <CardDescription>{t(SETTINGS_KEYS.security.mfa.description)}</CardDescription>
          </div>
          {mfaStatus.isSuccess ? (
            <Badge
              variant={mfaEnabled ? 'success' : 'secondary'}
              data-testid="mfa-status"
            >
              {mfaEnabled
                ? t(SETTINGS_KEYS.security.mfa.enabled)
                : t(SETTINGS_KEYS.security.mfa.disabled)}
            </Badge>
          ) : null}
          {mfaStatus.isPending ? (
            <Skeleton
              className="h-5 w-16 rounded-full"
              data-testid="mfa-status-loading"
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {mfaStatus.isPending ? (
          <Skeleton className="h-8 w-28" data-testid="mfa-loading" />
        ) : null}
        {mfaStatus.isError ? (
          <div data-testid="mfa-error">
            <RetryError
              message={t(SETTINGS_KEYS.security.loadFailed)}
              onRetry={mfaStatus.refetch}
              isRetrying={mfaStatus.isFetching}
            />
          </div>
        ) : null}
        {mfaStatus.isSuccess ? mfaAction : null}
      </CardContent>

      <Dialog
        open={setupOpen}
        onOpenChange={(open) => {
          if (!open) closeSetup();
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="mfa-setup-dialog">
          {recoveryCodes ? (
            <>
              <DialogHeader>
                <DialogTitle>{t(SETTINGS_KEYS.security.mfa.recoveryTitle)}</DialogTitle>
                <DialogDescription>
                  {t(SETTINGS_KEYS.security.mfa.recoveryDescription)}
                </DialogDescription>
              </DialogHeader>
              <RecoveryCodesPanel codes={recoveryCodes} onDone={closeSetup} />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t(SETTINGS_KEYS.security.mfa.setupTitle)}</DialogTitle>
                <DialogDescription>
                  {t(SETTINGS_KEYS.security.mfa.setupDescription)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <MfaEnrollmentSecret
                  enrollment={enrollment}
                  secretCopied={secretCopied}
                  onCopy={() => void handleCopySecret()}
                />

                <div className="flex flex-col gap-2">
                  <Label htmlFor="mfa-code">
                    {t(SETTINGS_KEYS.security.mfa.codeLabel)}
                  </Label>
                  <TotpCodeInput
                    id="mfa-code"
                    value={code}
                    onChange={setCode}
                    onComplete={handleSubmitCode}
                    invalid={!!confirmError}
                    testId="mfa-code"
                    aria-label={t(SETTINGS_KEYS.security.mfa.codeAria)}
                  />
                  {confirmError ? (
                    <p className="text-destructive text-xs" role="alert">
                      {confirmError}
                    </p>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeSetup}>
                  {t(SETTINGS_KEYS.security.mfa.cancel)}
                </Button>
                <Button
                  onClick={() => handleSubmitCode()}
                  disabled={code.length < 6 || confirm.isPending}
                  data-testid="mfa-verify"
                >
                  {t(SETTINGS_KEYS.security.mfa.verifyEnable)}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <MfaDisableConfirm
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onConfirm={() =>
          // Destructive — needs a STRONG step-up window (TOTP for MFA accounts;
          // the bootstrap email code is never accepted here). RETURNED, so the
          // dialog stays open and busy until the round-trip settles.
          guard(() => disable.mutateAsync(), { allowEmailCode: false })
        }
      />

      {stepUpDialog}
    </Card>
  );
}

/** QR + copyable secret for the staged enrollment (scan or manual entry). */
function MfaEnrollmentSecret({
  enrollment,
  secretCopied,
  onCopy,
}: {
  enrollment: MfaEnrollment | null;
  secretCopied: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  return (
    <>
      {enrollment?.otpauthUri ? (
        <div className="flex flex-col items-center gap-2">
          <Card className="gap-0 py-0" data-testid="mfa-qr">
            <CardContent className="flex size-44 items-center justify-center p-3">
              <QrCode data={enrollment.otpauthUri} />
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-center text-xs">
            {t(SETTINGS_KEYS.security.mfa.scanHint)}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mfa-secret">{t(SETTINGS_KEYS.security.mfa.secretLabel)}</Label>
        <div className="flex gap-2">
          <div
            id="mfa-secret"
            className="bg-muted flex-1 rounded-md p-3 font-mono text-sm break-all"
            data-testid="mfa-secret"
          >
            {enrollment?.secret}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t(SETTINGS_KEYS.security.mfa.copySecret)}
            onClick={onCopy}
            data-testid="mfa-copy-secret"
          >
            <Copy data-icon="inline-start" />
          </Button>
        </div>
        {secretCopied ? (
          <p className="text-success text-xs">
            {t(SETTINGS_KEYS.security.mfa.copiedSecret)}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Disable-2FA confirmation, extracted to keep {@link MfaCard} readable. */
function MfaDisableConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Awaited by ConfirmDialog — return the promise so it can hold its busy state. */
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(SETTINGS_KEYS.security.mfa.disableTitle)}
      description={t(SETTINGS_KEYS.security.mfa.disableDescription)}
      confirmLabel={t(SETTINGS_KEYS.security.mfa.disableConfirm)}
      destructive
      onConfirm={onConfirm}
    />
  );
}

/** Passkeys card: list + named registration + revoke (FE-32). */
/**
 * One saved credential, and its own removal.
 *
 * The mutation lives HERE, not on the card: `useRemovePasskey().isPending` is
 * one flag per instance, so a card-level instance greyed out every row's button
 * while any one of them was going (SET-24). A per-row instance also gives each
 * row its own single-flight guard, so "leave the other rows enabled" cannot
 * become "the second click is silently joined to the first" (rule 1).
 */
function PasskeyRow({
  passkey,
  guard,
  isSteppingUp,
}: {
  passkey: { id: string; name: string };
  guard: ReturnType<typeof useStepUpGuard>['guard'];
  /** A re-authentication dialog is open — no row may start another. */
  isSteppingUp: boolean;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const remove = useRemovePasskey();

  return (
    <div
      className="flex items-center justify-between rounded-md border px-3 py-2"
      data-testid="passkey-row"
    >
      <div className="flex items-center gap-2 text-sm">
        <Fingerprint className="text-muted-foreground" aria-hidden />
        {passkey.name}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t(SETTINGS_KEYS.security.passkeys.removeAria, { name: passkey.name })}
        onClick={() =>
          // Destructive — STRONG step-up only (never the email code).
          void guard(() => remove.mutateAsync(passkey.id), { allowEmailCode: false })
        }
        isLoading={remove.isPending}
        // Shared only for the ceremony: while a step-up dialog is open no row
        // may start another. A removal that is simply in flight belongs to its
        // own row and leaves the rest of the list alone.
        disabled={isSteppingUp}
        data-testid="passkey-remove"
        data-passkey-id={passkey.id}
      >
        {remove.isPending ? null : <Trash />}
      </Button>
    </div>
  );
}

function PasskeysCard() {
  const { t } = useTranslation(SETTINGS_NS);
  // Same reasoning as MfaCard: an empty list is a claim ("you have no
  // passkeys"), not a neutral placeholder for one that failed to load.
  const passkeysQuery = usePasskeys();
  const passkeys = passkeysQuery.data ?? [];
  const register = useRegisterPasskey();
  const { guard, isGuarding, isSteppingUp, stepUpDialog } = useStepUpGuard();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');

  function closeAdd() {
    setAddOpen(false);
    setName('');
  }

  function submitAdd() {
    // Registration is step-up gated; bootstrap email-code is allowed (first factor).
    void guard(() => register.mutateAsync(name.trim() || 'New passkey').then(closeAdd));
  }

  // Only rendered once the list is KNOWN — see passkeysQuery above.
  const passkeysBody =
    passkeys.length === 0 ? (
      <p className="text-muted-foreground text-sm" data-testid="passkeys-empty">
        {t(SETTINGS_KEYS.security.passkeys.empty)}
      </p>
    ) : (
      passkeys.map((passkey) => (
        <PasskeyRow
          key={passkey.id}
          passkey={passkey}
          guard={guard}
          isSteppingUp={isSteppingUp}
        />
      ))
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {t(SETTINGS_KEYS.security.passkeys.title)}
            </CardTitle>
            <CardDescription>
              {t(SETTINGS_KEYS.security.passkeys.description)}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            data-testid="add-passkey"
          >
            <Fingerprint data-icon="inline-start" />
            {t(SETTINGS_KEYS.security.passkeys.add)}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {passkeysQuery.isPending ? (
          <div className="flex flex-col gap-2" data-testid="passkeys-loading">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : null}
        {passkeysQuery.isError ? (
          <div data-testid="passkeys-error">
            <RetryError
              message={t(SETTINGS_KEYS.security.loadFailed)}
              onRetry={passkeysQuery.refetch}
              isRetrying={passkeysQuery.isFetching}
            />
          </div>
        ) : null}
        {passkeysQuery.isSuccess ? passkeysBody : null}
      </CardContent>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) closeAdd();
        }}
      >
        <DialogContent data-testid="passkey-add-dialog">
          <DialogHeader>
            <DialogTitle>{t(SETTINGS_KEYS.security.passkeys.addTitle)}</DialogTitle>
            <DialogDescription>
              {t(SETTINGS_KEYS.security.passkeys.addDescription)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passkey-name">
              {t(SETTINGS_KEYS.security.passkeys.nameLabel)}
            </Label>
            <Input
              id="passkey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(SETTINGS_KEYS.security.passkeys.namePlaceholder)}
              data-testid="passkey-name"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAdd}>
              {t(SETTINGS_KEYS.security.passkeys.cancel)}
            </Button>
            <Button
              onClick={submitAdd}
              disabled={register.isPending || isGuarding}
              data-testid="passkey-add-submit"
            >
              {t(SETTINGS_KEYS.security.passkeys.submit)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stepUpDialog}
    </Card>
  );
}

/**
 * Security section — two-factor authentication (real setup/disable flow, FE-32)
 * and passkeys (list / register / revoke, FE-32). Active sessions live in their
 * own panel (FE-31), so they are no longer duplicated here.
 */
export function AccountSecurityPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const mfaStatus = useMfaStatus();
  const passkeysQuery = usePasskeys();
  // The score is a claim about the account's posture. Built from `?? false` /
  // `?? []` it reads "1 of 3 protections active" while both reads are still in
  // flight, then jumps — and stays wrong if either read failed. Show it only
  // once both are known; the cards below carry the error and the retry.
  const overviewReady = mfaStatus.isSuccess && passkeysQuery.isSuccess;
  const overviewFailed = mfaStatus.isError || passkeysQuery.isError;

  return (
    <div className="flex flex-col gap-6" data-testid="settings-section-security">
      <SectionHeader
        title={t(SETTINGS_KEYS.security.heading)}
        description={t(SETTINGS_KEYS.security.description)}
      />

      {overviewReady ? (
        <SecurityOverviewCard
          mfaEnabled={mfaStatus.data}
          passkeyCount={passkeysQuery.data.length}
        />
      ) : null}
      {overviewReady || overviewFailed ? null : (
        <Card data-testid="security-overview-loading" aria-busy="true">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t(SETTINGS_KEYS.security.overview.title)}
            </CardTitle>
            <CardDescription>
              {t(SETTINGS_KEYS.security.overview.description)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
        </Card>
      )}

      {/* Two independent credential features in one panel: a throw in the
          passkey list must not take two-factor management with it, and the
          reverse. */}
      <SectionErrorBoundary
        title={t(SETTINGS_KEYS.security.mfa.title)}
        testId="mfa-card-error"
      >
        <MfaCard />
      </SectionErrorBoundary>

      <SectionErrorBoundary
        title={t(SETTINGS_KEYS.security.passkeys.title)}
        testId="passkeys-card-error"
      >
        <PasskeysCard />
      </SectionErrorBoundary>
    </div>
  );
}
