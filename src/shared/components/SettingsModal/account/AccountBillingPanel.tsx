import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  readStripeBillingReturnParams,
  stripeReturnCleanupNavigation,
} from '@/lib/billing/stripe-return.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { cn } from '@/lib/utils.ts';
import * as billingApi from '@/shared/api/billing-api.ts';
import type {
  BillingCycle,
  BillingPlan,
  BillingSubscription,
} from '@/shared/api/billing-contracts.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { isStripeEnabled } from '@/shared/billing/stripe-config.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import { BillingCancellationSection } from '@/shared/components/SettingsModal/account/BillingCancellationSection/index.ts';
import { BillingInvoicesTable } from '@/shared/components/SettingsModal/account/BillingInvoicesTable/index.ts';
import { BillingPaymentMethods } from '@/shared/components/SettingsModal/account/BillingPaymentMethods/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { StripePaymentForm } from '@/shared/components/StripePaymentForm/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useCan } from '@/shared/hooks/useCan/index.ts';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import {
  useBillingPlans,
  useSelectBillingPlan,
  useSubscription,
} from '@/shared/hooks/useSubscription/index.ts';
import { notify } from '@/shared/notify/index.ts';

const BILLING_KEYS = SETTINGS_KEYS.panels.billing;

function planPriceLabel(
  plan: BillingPlan,
  billingCycle: BillingCycle,
  formatCurrency: (cents: number, currency: string) => string,
  t: TFunction,
) {
  const yearly = billingCycle === 'yearly';
  const cents = yearly ? plan.priceYearly : plan.priceMonthly;
  // A free plan still gets formatted in the viewer's locale — a hardcoded "$0"
  // was both untranslated and wrong for every non-USD workspace.
  const price = formatCurrency(cents, plan.currency);
  return t(yearly ? BILLING_KEYS.pricePerYear : BILLING_KEYS.pricePerMonth, { price });
}

function planActionLabel(
  name: string,
  hasSubscription: boolean,
  busy: boolean,
  t: TFunction,
) {
  if (busy) return t(BILLING_KEYS.switching);
  return t(hasSubscription ? BILLING_KEYS.switchTo : BILLING_KEYS.choose, { name });
}

function statusBadgeVariant(status: BillingSubscription['status']) {
  if (status === 'active' || status === 'trialing') return 'secondary' as const;
  if (status === 'incomplete' || status === 'past_due' || status === 'unpaid') {
    return 'destructive' as const;
  }
  return 'outline' as const;
}

/**
 * The plan change SUCCEEDED and the payment step did not. Silence here leaves an
 * `incomplete` subscription with no form and no message - the user has no way to
 * know money never moved (SET-13).
 */
function notifyPaymentSetupFailed() {
  notify.error(
    i18n.t(ERRORS_KEYS.frontend.hooks.subscription.paymentSetupFailed, {
      ns: ERRORS_NS,
    }),
    { id: 'billing-payment-setup' },
  );
}

/**
 * The payment step for an `incomplete` subscription. Returns null — after
 * telling the user — when it cannot be started, so no caller can leave the
 * failure silent.
 */
async function loadPaymentSetup(subscriptionId: string): Promise<string | null> {
  try {
    const setup = await billingApi.getSubscriptionPaymentSetup(subscriptionId);
    if (setup.clientSecret) return setup.clientSecret;
  } catch {
    // Same outcome as a missing secret: no form to complete.
  }
  notifyPaymentSetupFailed();
  return null;
}

interface PlanCardProps {
  plan: BillingPlan;
  current: boolean;
  canManage: boolean;
  hasSubscription: boolean;
  billingCycle: BillingCycle;
  /** The plan whose switch is in flight, if any — at most one at a time. */
  pendingPlanId: string | null;
  onSelect: (planId: string) => Promise<void>;
  formatCurrency: (cents: number, currency: string) => string;
}

/** One plan in the comparison grid, with its own busy state. */
function PlanCard({
  plan,
  current,
  canManage,
  hasSubscription,
  billingCycle,
  pendingPlanId,
  onSelect,
  formatCurrency,
}: PlanCardProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const busy = pendingPlanId === plan.id;
  let action: ReactNode = null;
  if (current) {
    action = <Badge variant="secondary">{t(BILLING_KEYS.currentPlan)}</Badge>;
  } else if (canManage) {
    action = (
      <Button
        size="sm"
        className="w-full"
        // Only the pressed plan spins; the rest are merely disabled, because
        // one of them is already being switched to (SET-13).
        isLoading={busy}
        disabled={pendingPlanId !== null}
        onClick={() => void onSelect(plan.id)}
        data-testid={`plan-${plan.id}`}
      >
        {planActionLabel(plan.name, hasSubscription, busy, t)}
      </Button>
    );
  }

  return (
    <Card className={cn(current && 'border-primary ring-primary/20 ring-2')}>
      <CardHeader>
        <CardTitle className="text-base">{plan.name}</CardTitle>
        <CardDescription>
          {planPriceLabel(plan, billingCycle, formatCurrency, t)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {plan.description ?? t(BILLING_KEYS.planFallbackDescription)}
        </p>
        {action}
      </CardContent>
    </Card>
  );
}

interface BillingContentProps {
  sub: BillingSubscription | null;
  plans: BillingPlan[];
}

function BillingContent({ sub, plans }: BillingContentProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatCurrency, formatDate } = useLocaleFormat();
  const canManage = useCan({
    permission: 'subscription:manage',
    teamOrganizationOnly: true,
  });
  const selectPlan = useSelectBillingPlan();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    sub?.billingCycle ?? 'monthly',
  );
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  /**
   * Which plan button the user actually pressed. `selectPlan.isPending` is one
   * flag for the whole grid, so every plan greyed out together and none of them
   * showed a spinner - the click read as "the page froze" (SET-13).
   */
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const currentPlan = sub?.planId
    ? plans.find((plan) => plan.id === sub.planId)
    : undefined;

  const stripeEnabled = isStripeEnabled();
  const showBillingExtras = stripeEnabled && Boolean(sub);

  async function refreshBilling() {
    await queryClient.invalidateQueries({ queryKey: billingQueryKeys.all });
  }

  /**
   * Clear Stripe's return params through the router (not a raw `replaceState`), so
   * its cached location stays in sync and a later navigation cannot bring them back
   * — and KEEP the settings hash while doing it (see `stripeReturnCleanupNavigation`).
   */
  function stripStripeReturnParams() {
    void navigate(stripeReturnCleanupNavigation());
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time Stripe redirect-return read on mount; navigate is a stable router handle and refreshBilling only wraps queryClient
  useEffect(() => {
    const { paymentIntentClientSecret, redirectStatus } = readStripeBillingReturnParams();
    if (redirectStatus === 'succeeded') {
      stripStripeReturnParams();
      void refreshBilling();
      return;
    }
    if (paymentIntentClientSecret) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from Stripe redirect params
      setPaymentClientSecret(paymentIntentClientSecret);
    }
    // navigate is a stable router handle; this is a one-time redirect-return read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      sub?.status !== 'incomplete' ||
      !stripeEnabled ||
      !canManage ||
      paymentClientSecret
    ) {
      return;
    }
    // Was a silent catch: an incomplete subscription with no form, no message.
    void loadPaymentSetup(sub.id).then((clientSecret) => {
      if (clientSecret) setPaymentClientSecret(clientSecret);
    });
  }, [sub, stripeEnabled, canManage, paymentClientSecret]);

  /**
   * Never rejects. It is called from an `onClick`, where a rejection is an
   * unhandled promise and nothing else — no toast, no rollback, no clue.
   */
  async function handlePlanSelect(planId: string) {
    // A second plan cannot be chosen while the first switch is still running;
    // the ref-based guard in `useAppMutation` would silently join it to the
    // first, charging for a plan the user did not press.
    if (pendingPlanId !== null) return;
    setPendingPlanId(planId);
    try {
      const updated = await selectPlan.mutateAsync({ planId, billingCycle });
      if (updated.status !== 'incomplete' || !stripeEnabled) return;
      // The plan change itself went through — a payment step that will not
      // start is a separate failure, and needs to say so.
      const clientSecret = await loadPaymentSetup(updated.id);
      if (clientSecret) setPaymentClientSecret(clientSecret);
    } catch {
      // `useAppMutation` already toasted the mapped error; swallow so the click
      // handler cannot leave an unhandled rejection behind.
    } finally {
      setPendingPlanId(null);
    }
  }

  const summaryDescription = sub
    ? t(BILLING_KEYS.summary, {
        used: sub.seatsUsed,
        total: sub.seatsTotal ?? '∞',
        date: formatDate(sub.currentPeriodEnd),
      })
    : t(BILLING_KEYS.noSubscription);

  return (
    <div className="space-y-6">
      <Card data-testid="billing-summary">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">
              {currentPlan
                ? t(BILLING_KEYS.planHeading, { name: currentPlan.name })
                : t(BILLING_KEYS.noPlan)}
            </CardTitle>
            {sub ? (
              <Badge variant={statusBadgeVariant(sub.status)}>
                {sub.status.replace('_', ' ')}
              </Badge>
            ) : null}
          </div>
          <CardDescription>{summaryDescription}</CardDescription>
          {sub ? (
            <p className="text-muted-foreground text-sm">
              {t(
                sub.billingCycle === 'yearly'
                  ? BILLING_KEYS.billedYearly
                  : BILLING_KEYS.billedMonthly,
              )}
            </p>
          ) : null}
        </CardHeader>
      </Card>

      {paymentClientSecret ? (
        <Card data-testid="billing-payment-card">
          <CardHeader>
            <CardTitle className="text-base">
              {t(BILLING_KEYS.completePaymentTitle)}
            </CardTitle>
            <CardDescription>
              {t(BILLING_KEYS.completePaymentDescription)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Stripe Elements is third-party and mounts an iframe: a throw in
                there must cost the payment card, not the billing panel. */}
            <SectionErrorBoundary
              title={i18n.t(ERRORS_KEYS.widget.payment, { ns: ERRORS_NS })}
              testId="billing-payment-form-error"
            >
              <StripePaymentForm
                clientSecret={paymentClientSecret}
                intent="payment"
                onCancel={() => setPaymentClientSecret(null)}
                onComplete={() => {
                  setPaymentClientSecret(null);
                  stripStripeReturnParams();
                  void refreshBilling();
                }}
              />
            </SectionErrorBoundary>
          </CardContent>
        </Card>
      ) : null}

      <BillingPaymentMethods enabled={showBillingExtras} canManage={canManage} />

      <BillingInvoicesTable enabled={showBillingExtras} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">{t(BILLING_KEYS.changePlanTitle)}</h3>
            <p className="text-muted-foreground text-sm">
              {t(BILLING_KEYS.changePlanDescription)}
            </p>
          </div>
          {canManage ? (
            <fieldset
              className="inline-flex rounded-md border p-0.5"
              data-testid="billing-cycle-toggle"
            >
              <legend className="sr-only">{t(BILLING_KEYS.cycleLegend)}</legend>
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <Button
                  key={cycle}
                  type="button"
                  size="sm"
                  variant={billingCycle === cycle ? 'secondary' : 'ghost'}
                  className="h-8"
                  onClick={() => setBillingCycle(cycle)}
                  data-testid={`billing-cycle-${cycle}`}
                >
                  {t(cycle === 'monthly' ? BILLING_KEYS.monthly : BILLING_KEYS.yearly)}
                </Button>
              ))}
            </fieldset>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3" data-testid="plan-options">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={sub?.planId === plan.id}
              canManage={canManage}
              // `Boolean`, not `!== null`: this was the one check in the file
              // that told `undefined` apart from `null`, and it decides whether
              // the buttons read "Choose Free" or "Switch to Free". An
              // `undefined` here therefore put "Switch to …" on every card of a
              // workspace whose own summary says "No active subscription yet.
              // Choose a plan below." — the card telling the user they are on a
              // plan while the heading above it says they are not. Every other
              // read of `sub` in this component (`sub ?`, `!sub`,
              // `Boolean(sub)`) already treats the two alike.
              hasSubscription={Boolean(sub)}
              billingCycle={billingCycle}
              pendingPlanId={pendingPlanId}
              onSelect={handlePlanSelect}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      </div>

      {sub ? (
        // Ending a subscription is its own failure domain: a throw here must not
        // take the plan grid and the invoice history with it.
        <SectionErrorBoundary
          title={i18n.t(ERRORS_KEYS.widget.cancellation, { ns: ERRORS_NS })}
          testId="billing-cancellation-error"
        >
          <BillingCancellationSection subscription={sub} canManage={canManage} />
        </SectionErrorBoundary>
      ) : null}
    </div>
  );
}

/**
 * Account billing — current plan, payment methods, invoices, plan changes, cancellation.
 * Plan changes are gated on subscription:manage for team organizations.
 */
export function AccountBillingPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const subscriptionQuery = useSubscription();
  const plansQuery = useBillingPlans();

  return (
    <section className="space-y-6" data-testid="settings-account-billing">
      <SectionHeader
        title={t(BILLING_KEYS.title)}
        description={t(BILLING_KEYS.description)}
      />
      {/*
        Plans on the OUTSIDE, subscription within — and the subscription boundary
        carries an `idle` fallback.

        Billing is an ACCOUNT section, so a personal workspace reaches it; but
        `subscription:read` is granted to TEAM owners only
        (core-be `ownerPermissionCodesForOrganizationType`). `useSubscription` is
        gated on that permission, so in a personal workspace the query never runs
        and sits at pending + idle forever. With the subscription boundary on the
        outside and no `idle` branch, that rendered NOTHING — the plans list
        included, which needs no permission at all and was fetching fine.

        `null` is the honest value for "no subscription we may read", and it is
        the same value `getActiveSubscription` already returns when the API
        answers 403. `BillingContent` has always handled it.
      */}
      <QueryBoundary query={plansQuery} errorMessage={t(BILLING_KEYS.plansLoadFailed)}>
        {(plans) => {
          const activePlans = plans.filter((plan) => plan.isActive);
          return (
            <QueryBoundary
              query={subscriptionQuery}
              errorMessage={t(BILLING_KEYS.loadFailed)}
              idle={<BillingContent sub={null} plans={activePlans} />}
            >
              {(sub) => <BillingContent sub={sub} plans={activePlans} />}
            </QueryBoundary>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
