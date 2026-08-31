import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { organizationDashboard } from '@/lib/routes/index.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { acceptInvitation } from '@/shared/api/organization-api.ts';
import { silentRefresh } from '@/shared/auth/service.ts';
import { getAccessToken } from '@/shared/auth/token.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { HttpError } from '@/shared/errors/HttpError.ts';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { useConsumedSearchToken } from '@/shared/hooks/useConsumedSearchToken/index.ts';
import { CheckCircle2, Loader2, XCircle } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { switchToOrganization } from '@/shared/tenancy/switch.ts';

import {
  ACCEPT_INVITE_REDIRECT_MS,
  ACCEPT_INVITE_TEST_IDS,
  AUTH_KEYS,
  AUTH_NS,
} from './accept-invite.constants.ts';

/**
 * `partial` is the membership-created-but-workspace-not-opened state: the
 * invitation was accepted server-side, so the user IS a member, but the
 * follow-up org switch / token refresh failed. It is a success with a caveat —
 * never an error, and never a reason to send the user back to sign-in.
 */
type Status = 'accepting' | 'success' | 'partial' | 'error';

interface InviteStatusCardProps {
  status: Status;
  error: string | null;
  canRetry: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

function InviteStatusCard({
  status,
  error,
  canRetry,
  isRetrying,
  onRetry,
}: Readonly<InviteStatusCardProps>) {
  const { t } = useTranslation(AUTH_NS);

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>
          {status === 'error'
            ? t(AUTH_KEYS.acceptInvite.problemTitle)
            : t(AUTH_KEYS.acceptInvite.joiningTitle)}
        </CardTitle>
        <CardDescription>
          {status === 'accepting' && t(AUTH_KEYS.acceptInvite.accepting)}
          {status === 'success' && t(AUTH_KEYS.acceptInvite.success)}
          {status === 'partial' && t(AUTH_KEYS.acceptInvite.switchFailed)}
          {status === 'error' && error}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {status === 'accepting' && (
          <Loader2
            className="text-muted-foreground h-10 w-10 animate-spin"
            data-testid={ACCEPT_INVITE_TEST_IDS.loading}
          />
        )}
        {(status === 'success' || status === 'partial') && (
          <CheckCircle2
            className="text-success h-10 w-10"
            data-testid={ACCEPT_INVITE_TEST_IDS.success}
          />
        )}
        {status === 'error' && (
          <>
            <XCircle
              className="text-destructive h-10 w-10"
              data-testid={ACCEPT_INVITE_TEST_IDS.error}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {canRetry && (
                <Button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  data-testid={ACCEPT_INVITE_TEST_IDS.retry}
                >
                  {t(AUTH_KEYS.common.tryAgain)}
                </Button>
              )}
              <Button
                asChild
                variant={canRetry ? 'outline' : 'default'}
                data-testid={ACCEPT_INVITE_TEST_IDS.login}
              >
                <Link to="/login">{t(AUTH_KEYS.common.goToSignIn)}</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Landing page for `/accept-invite/$invitationId?token=…`. Accepts the invitation
 * on mount, then opens the organization the user just joined.
 *
 * Two things it deliberately does NOT do:
 *
 * - **It never reports success and then drops the user at sign-in.** Accepting and
 *   opening the workspace are separate steps. When the accept succeeds but the
 *   switch/refresh behind it fails, the membership is real, so the user stays
 *   signed in: the failure is reported, a warning toast explains it, and the
 *   redirect goes to `/` (the resolver picks the right landing surface). The old
 *   `catch` swallowed that error, claimed success, and sent them to `/login` — a
 *   green check followed by the sign-in page with no explanation (INV-1).
 * - **It never fires two accepts for one gesture.** `acceptInvitation` is a write;
 *   the in-flight ref below is the single-flight guard, flipped synchronously so a
 *   double-click on Try again cannot get past it (`disabled` only lands a render
 *   later). See `agent-os/rules/resilient-interactions.mdc` section 1.
 */
export function AcceptInvitePage() {
  const { t } = useTranslation(AUTH_NS);
  const { invitationId } = useParams({ strict: false });
  const invitationToken = useConsumedSearchToken();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('accepting');
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const startedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const redirectAfterDelay = useCallback((run: () => void) => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(run, ACCEPT_INVITE_REDIRECT_MS);
  }, []);

  const acceptInvite = useCallback(async () => {
    if (!invitationId) return;
    const loginRecovery = {
      to: '/login' as const,
      search: {
        redirect: `/accept-invite/${invitationId}?token=${encodeURIComponent(invitationToken)}`,
      },
      replace: true,
    };

    try {
      if (!invitationToken) {
        setError(t(AUTH_KEYS.acceptInvite.errors.invalidOrExpired));
        setStatus('error');
        return;
      }
      // Accepting requires a signed-in session whose email matches the
      // invite — and the email recipient is usually NOT signed in yet. Send
      // them to login first, carrying this page (token included) as the
      // post-login redirect, instead of firing a doomed accept that renders
      // an "Invitation problem: Unauthorized" card for the happy path.
      if (!getAccessToken()) {
        void navigate(loginRecovery);
        return;
      }
      const accepted = await acceptInvitation(invitationId, invitationToken);

      // The membership exists from here on, whatever the switch does next.
      captureAnalyticsEvent(ANALYTICS_EVENTS.inviteAccepted, {
        invitation_id: invitationId,
        organization_id: accepted.organizationId,
      });

      let slug = accepted.organizationSlug;
      try {
        const ctx = await switchToOrganization(accepted.organizationId);
        await silentRefresh();
        slug = ctx?.activeOrganization?.slug ?? accepted.organizationSlug;
      } catch (switchError) {
        // Joined, but this tab could not be moved into the new org. Report it,
        // say so, and hand off to the index resolver — signing the user out of
        // their own successful join would be the worst possible recovery.
        reportError(switchError, {
          scope: 'accept-invite.switch',
          invitation_id: invitationId,
          organization_id: accepted.organizationId,
        });
        notify.warning(t(AUTH_KEYS.acceptInvite.switchFailedToast));
        setStatus('partial');
        redirectAfterDelay(() => void navigate({ to: '/', replace: true }));
        return;
      }

      setStatus('success');
      redirectAfterDelay(() => {
        if (slug) {
          void navigate({ ...organizationDashboard(slug), replace: true });
        } else {
          void navigate({ to: '/', replace: true });
        }
      });
    } catch (err) {
      // A 401 here means the session died between boot and accept — the
      // invitation itself is fine, so recover through login, not the card.
      if (err instanceof HttpError && err.status === 401) {
        void navigate(loginRecovery);
        return;
      }
      setError(mapFrontendError(err));
      setStatus('error');
    }
  }, [invitationId, invitationToken, navigate, redirectAfterDelay, t]);

  /**
   * Single-flight: a second call while the first accept is still running joins
   * that promise instead of POSTing again. The ref flips inside the call, so it
   * closes the double-click window a `disabled` prop cannot.
   */
  const runAccept = useCallback((): Promise<void> => {
    const inFlight = inFlightRef.current;
    if (inFlight) return inFlight;

    const promise = acceptInvite().finally(() => {
      inFlightRef.current = null;
      setIsRetrying(false);
    });
    inFlightRef.current = promise;
    return promise;
  }, [acceptInvite]);

  const handleRetry = useCallback(() => {
    if (inFlightRef.current) return;
    setIsRetrying(true);
    setError(null);
    setStatus('accepting');
    void runAccept();
  }, [runAccept]);

  useEffect(() => {
    if (!invitationId) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void runAccept();
  }, [invitationId, runAccept]);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  if (!invitationId) {
    return null;
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      data-testid={ACCEPT_INVITE_TEST_IDS.page}
    >
      {/* Contained here, a throw inside the status card leaves the public shell
          and its branding standing with a retry in place, instead of escalating
          to the route boundary and replacing the whole screen. */}
      <SectionErrorBoundary
        title={t(AUTH_KEYS.acceptInvite.joiningTitle)}
        testId={ACCEPT_INVITE_TEST_IDS.cardError}
      >
        <InviteStatusCard
          status={status}
          error={error}
          canRetry={Boolean(invitationToken)}
          isRetrying={isRetrying}
          onRetry={handleRetry}
        />
      </SectionErrorBoundary>
    </div>
  );
}
