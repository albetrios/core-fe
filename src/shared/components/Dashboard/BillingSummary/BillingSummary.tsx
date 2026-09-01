import { useTranslation } from 'react-i18next';

import { useAnimeCountUp } from '@/lib/animations/useAnimeCountUp.ts';
import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DASHBOARD_BILLING_SAMPLE,
  resolveDashboardEvents,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { CreditCard } from '@/shared/icons/index.ts';

/**
 * "Billing summary" — plan, next invoice (the schedule's invoice-due date, so
 * both cards agree), and payment method, with a counted-up amount. Placeholder
 * until billing endpoints land, so the card carries the sample badge.
 */
export function BillingSummary() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate, formatNumber } = useLocaleFormat();
  const invoiceDue = resolveDashboardEvents().find((event) => event.id === 'evt_4');
  const formatAmount = (value: number) =>
    formatNumber(Math.round(value), {
      style: 'currency',
      currency: DASHBOARD_BILLING_SAMPLE.currency,
      maximumFractionDigits: 0,
    });
  const amountRef = useAnimeCountUp<HTMLParagraphElement>(
    DASHBOARD_BILLING_SAMPLE.amount,
    formatAmount,
    720,
  );

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
              {/* No billing endpoints yet — fabricated numbers stay marked. */}
              <Badge variant="outline" data-testid="dashboard-billing-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.billingCard.description)}</CardDescription>
          </div>
          <p
            ref={amountRef}
            className="text-foreground text-2xl font-semibold tracking-tight tabular-nums"
            data-testid="dashboard-billing-amount"
          >
            {formatAmount(DASHBOARD_BILLING_SAMPLE.amount)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.plan)}
          </span>
          <span className="text-foreground font-medium">
            {t(DASHBOARD_KEYS.stats.billingManaged)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.nextInvoice)}
          </span>
          <span className="text-foreground font-medium tabular-nums">
            {invoiceDue
              ? formatDate(invoiceDue.date, { month: 'short', day: 'numeric' })
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(DASHBOARD_KEYS.billingCard.payment)}
          </span>
          <span className="text-foreground inline-flex items-center gap-1.5 font-medium tabular-nums">
            <CreditCard className="text-muted-foreground size-3.5" aria-hidden="true" />
            •••• {DASHBOARD_BILLING_SAMPLE.cardLast4}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
