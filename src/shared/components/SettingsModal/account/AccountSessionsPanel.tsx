import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { Session } from '@/shared/api/session-contracts.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { FormattedDate } from '@/shared/components/FormattedDate/index.ts';
import { PanelSkeleton } from '@/shared/components/PanelSkeleton/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { useStepUpGuard } from '@/shared/components/StepUpDialog/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card } from '@/shared/components/ui/card.tsx';
import { useRevokeSession, useSessions } from '@/shared/hooks/useSessions/index.ts';
import { Laptop, LogOut } from '@/shared/icons/index.ts';

import { SETTINGS_KEYS, SETTINGS_NS } from '../settings.constants.ts';

/**
 * The browser / IP half of a session row is pure data — device strings joined
 * by a separator, no grammar — so it is assembled here and handed to the
 * sentence as one value. The sentence itself lives in the locale bundle.
 *
 * Both halves can be absent: core-be returns a null `browser` for any agent its
 * heuristic does not recognise. Joining the parts that exist keeps the line free
 * of a dangling separator, and `unknownLabel` keeps it from collapsing to the
 * empty string, which would render as a bare "· active 5 minutes ago".
 */
function sessionDetails(session: Session, unknownLabel: string): string {
  const parts = [session.browser, session.ipAddress].filter((part): part is string =>
    Boolean(part),
  );
  return parts.length > 0 ? parts.join(' · ') : unknownLabel;
}

/**
 * Sessions panel — devices currently signed in. The current session is badged
 * and can't be revoked; any other session can be signed out (confirmed via the
 * shared destructive-action dialog). Covers loading / error states.
 *
 * @remarks
 * Revoking is gated on a STRONG recent step-up in core-be, so the confirm runs
 * through {@link useStepUpGuard} rather than calling the mutation directly.
 * Skipping that guard does not surface an error: `useAppMutation` suppresses the
 * toast for a step-up 403 precisely because the caller is expected to open the
 * dialog, and it rolls the optimistic removal back — so the row returns looking
 * untouched and nothing explains why.
 */
export function AccountSessionsPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.sessions;
  const { data: sessions, isLoading, isError, isFetching, refetch } = useSessions();
  const revoke = useRevokeSession();
  const [toRevoke, setToRevoke] = useState<Session | null>(null);
  const { guard, isSteppingUp, stepUpDialog } = useStepUpGuard();

  return (
    <section className="space-y-6" data-testid="settings-account-sessions">
      <SectionHeader title={t(panels.title)} description={t(panels.description)} />

      {isLoading ? <PanelSkeleton testId="sessions-loading" /> : null}

      {isError ? (
        // A dead end used to be the whole story here: a sentence, and the only
        // way to try again was to close Settings and reopen it (SET-20).
        <div data-testid="sessions-error">
          <RetryError
            message={t(panels.loadFailed)}
            onRetry={() => {
              void refetch();
            }}
            isRetrying={isFetching}
          />
        </div>
      ) : null}

      {!(isLoading || isError) && sessions?.length === 0 ? (
        // The skeleton used to hand over to nothing at all — a blank panel that
        // reads as a still-loading screen (SET-21).
        <EmptyState
          icon={<Laptop />}
          title={t(panels.emptyTitle)}
          description={t(panels.emptyDescription)}
        />
      ) : null}

      {sessions && sessions.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-border divide-y" data-testid="sessions-list">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 p-3">
                <Laptop className="text-muted-foreground size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {session.device ?? t(panels.deviceFallback)}
                    </p>
                    {session.current ? (
                      <Badge variant="secondary">{t(panels.currentBadge)}</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {/* The relative time is a component (locale + timezone aware),
                        so the sentence around it is a <Trans> slot rather than a
                        plain `t()` — translators keep control of word order. */}
                    <Trans
                      ns={SETTINGS_NS}
                      i18nKey={panels.lastActive}
                      values={{
                        details: sessionDetails(session, t(panels.deviceFallback)),
                      }}
                      components={{
                        1: <FormattedDate value={session.lastActiveAt} relative />,
                      }}
                    />
                  </p>
                </div>
                {session.current ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToRevoke(session)}
                    disabled={isSteppingUp}
                    data-testid={`session-revoke-${session.id}`}
                  >
                    <LogOut className="me-1.5 size-4" aria-hidden />
                    {t(panels.signOut)}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null);
        }}
        title={t(panels.revokeTitle)}
        description={t(panels.revokeDescription, {
          device: toRevoke?.device ?? t(panels.deviceFallback),
        })}
        confirmLabel={t(panels.revokeConfirm)}
        destructive
        onConfirm={() => {
          if (!toRevoke) return;
          // Captured now, not read later: confirming closes this dialog, which
          // clears `toRevoke` — and when step-up is required the action re-runs
          // AFTER that, once the user has re-authenticated.
          const { id } = toRevoke;
          // core-be gates DELETE /auth/me/sessions/:session_id behind a STRONG
          // recent step-up (sec-A7: a stolen bearer must not be able to sign the
          // real user out of their own browser), so the bootstrap email code is
          // never accepted here. RETURNED, so ConfirmDialog stays busy until the
          // round-trip settles.
          return guard(() => revoke.mutateAsync(id), { allowEmailCode: false });
        }}
      />

      {stepUpDialog}
    </section>
  );
}
