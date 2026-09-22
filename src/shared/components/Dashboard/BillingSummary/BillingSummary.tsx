import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useAnimeCountUp } from '@/lib/animations/useAnimeCountUp.ts';
import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { isStripeEnabled } from '@/shared/billing/stripe-config.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { settingsHash } from '@/shared/components/SettingsModal/settings-hash-grammar.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useBillingPaymentMethods } from '@/shared/hooks/useBillingPaymentMethods/index.ts';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { useCurrentPlan } from '@/shared/hooks/useSubscription/index.ts';
import { CreditCard } from '@/shared/icons/index.ts';

/** Placeholder for a value that is not known yet, or does not exist. */
const NOT_SET = '\u2014';

/** Masked digits standing in for the card number a default payment method hides. */
const CARD_MASK = '\u2022\u2022\u2022\u2022';

/**
 * "Billing summary" — the workspace's real plan, its real renewal date and its
 * real default card.
 *
 * @remarks
 * This card used to be sample data: a fabricated amount, a hardcoded "Managed"
 * plan and a `**** 4242` that belonged to nobody, behind a "Sample data" badge.
 * The badge was not enough. A team workspace with no subscription read
 * "Managed / Team plan / $49" here and "No plan — no active subscription yet"
 * in Settings -> Billing, one click away (QA-V3-3). It now reads the same
 * {@link useCurrentPlan} the settings panel does, so the two cannot disagree,
 * and shows {@link NOT_SET} rather than inventing anything it does not know.
 *
 * The payment row is only fetched once a subscription exists — a workspace
 * without one has no card to show, so there is nothing to ask for.
 */
export function BillingSummary() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate, formatCurrency } = useLocaleFormat();
  const { subscription, plan, priceCents, currency, isPending } = useCurrentPlan();
  const paymentMethods = useBillingPaymentMethods(
    isStripeEnabled() && subscription !== null,
  );
  const defaultCard =
    paymentMethods.data?.find((method) => method.isDefault) ?? paymentMethods.data?.[0];

  const formatAmount = (cents: number) => formatCurrency(cents, currency ?? 'usd');
  // `null`, not `0`, when there is no price — that is the hook's own signal for
  // "non-numeric content, do not animate", and it is what keeps the tween from
  // overwriting the em dash below with a formatted zero.
  const amountRef = useAnimeCountUp<HTMLParagraphElement>(priceCents, formatAmount, 720);

  const planLabel =
    plan?.name ?? (isPending ? NOT_SET : t(DASHBOARD_KEYS.billingCard.noPlan));
  const manageHash = settingsHash('account', 'billing');

  return (
    <Card
      data-testid="dashboard-billing-summary"
      className="from-chart-2/10 via-card to-card relative gap-0 overflow-hidden bg-gradient-to-br py-0"
    >
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <CreditCard className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.billingCard.heading)}
              </CardTitle>
              {subscription ? (
                <Badge variant="outline" data-testid="dashboard-billing-status">
                  {subscription.status.replace('_', ' ')}
                </Badge>
              ) : null}
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.billingCard.description)}</CardDescription>
          </div>
          <p
            ref={amountRef}
            className="text-foreground text-2xl font-semibold tracking-tight tabular-nums"
            data-testid="dashboard-billing-amount"
          >
            {priceCents === null ? NOT_SET : formatAmount(priceCents)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.plan)}
          </span>
          <span
            className="text-foreground font-medium"
            data-testid="dashboard-billing-plan"
          >
            {planLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.nextInvoice)}
          </span>
          <span className="text-foreground font-medium tabular-nums">
            {subscription
              ? formatDate(subscription.currentPeriodEnd, {
                  month: 'short',
                  day: 'numeric',
                })
              : NOT_SET}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.payment)}
          </span>
          <span className="text-foreground inline-flex items-center gap-1.5 font-medium tabular-nums">
            {defaultCard ? (
              <>
                <CreditCard
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
                {CARD_MASK} {defaultCard.last4}
              </>
            ) : (
              NOT_SET
            )}
          </span>
        </div>
        {/* The card names a plan; the one thing the reader will want next is the
            screen that can change it. A hash link, so Settings opens over the
            dashboard rather than replacing it. */}
        <Link
          to="."
          hash={manageHash}
          className="text-primary inline-block pt-1 text-sm font-medium hover:underline"
          data-testid="dashboard-billing-manage"
        >
          {t(
            subscription
              ? DASHBOARD_KEYS.billingCard.manage
              : DASHBOARD_KEYS.billingCard.choosePlan,
          )}
        </Link>
      </CardContent>
    </Card>
  );
}
