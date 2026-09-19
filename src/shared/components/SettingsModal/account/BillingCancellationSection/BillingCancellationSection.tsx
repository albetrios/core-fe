import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { BillingSubscription } from '@/shared/api/billing-contracts.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import {
  useCancelSubscription,
  useResumeSubscription,
} from '@/shared/hooks/useSubscription/index.ts';

interface BillingCancellationSectionProps {
  subscription: BillingSubscription;
  canManage: boolean;
}

/** Cancel or resume subscription — shown last on the billing panel. */
export function BillingCancellationSection({
  subscription,
  canManage,
}: BillingCancellationSectionProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const keys = SETTINGS_KEYS.panels.billing.cancellation;
  const { formatDate } = useLocaleFormat();
  const cancelSubscription = useCancelSubscription();
  const resumeSubscription = useResumeSubscription();
  // Controlled, because the confirm has to outlive the click that fired it.
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canManage) return null;

  const periodEnd = formatDate(subscription.currentPeriodEnd);

  return (
    <Card data-testid="billing-cancellation-card">
      <CardHeader>
        <CardTitle className="text-base">{t(keys.title)}</CardTitle>
        <CardDescription>
          {t(subscription.cancelAtPeriodEnd ? keys.endsOn : keys.cancelAnytime, {
            date: periodEnd,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {subscription.cancelAtPeriodEnd ? (
          <Button
            size="sm"
            variant="outline"
            isLoading={resumeSubscription.isPending}
            onClick={() => resumeSubscription.mutate(subscription.id)}
            data-testid="billing-resume"
          >
            {resumeSubscription.isPending ? t(keys.resuming) : t(keys.resume)}
          </Button>
        ) : (
          <AlertDialog
            open={confirmOpen}
            // Esc or an overlay click must not abandon a cancellation that is
            // already running.
            onOpenChange={(open) => {
              if (!cancelSubscription.isPending) setConfirmOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  cancelSubscription.isPending || subscription.status === 'incomplete'
                }
                data-testid="billing-cancel"
              >
                {t(keys.cancelAction)}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="billing-cancel-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>{t(keys.confirmTitle)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(keys.confirmDescription, { date: periodEnd })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cancelSubscription.isPending}>
                  {t(keys.keep)}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    // Radix closes on click. Hold the dialog open until the
                    // request resolves, so a failure lands on the confirm that
                    // caused it instead of an empty screen — and so the button
                    // cannot be pressed twice on the way out (SET-14).
                    event.preventDefault();
                    cancelSubscription.mutate(subscription.id, {
                      onSuccess: () => setConfirmOpen(false),
                    });
                  }}
                  isLoading={cancelSubscription.isPending}
                  data-testid="billing-cancel-confirm"
                >
                  {cancelSubscription.isPending ? t(keys.cancelling) : t(keys.confirm)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
