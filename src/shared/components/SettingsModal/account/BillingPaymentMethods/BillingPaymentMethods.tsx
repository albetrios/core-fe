import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import {
  omitStripeReturnParams,
  readStripeBillingReturnParams,
} from '@/lib/billing/stripe-return.ts';
import * as billingApi from '@/shared/api/billing-api.ts';
import type { BillingPaymentMethod } from '@/shared/api/billing-contracts.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { isStripeEnabled } from '@/shared/billing/stripe-config.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
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
import { useBillingPaymentMethods } from '@/shared/hooks/useBillingPaymentMethods/index.ts';
import { CreditCard } from '@/shared/icons/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

function formatCardLabel(method: BillingPaymentMethod) {
  const brand = method.brand ? method.brand.toUpperCase() : 'Card';
  return `${brand} ···· ${method.last4}`;
}

function PaymentMethodRow({ method }: { method: BillingPaymentMethod }) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      data-testid={`billing-payment-method-${method.id}`}
    >
      <div className="flex items-center gap-2">
        <CreditCard className="text-muted-foreground size-4" data-icon />
        <div>
          <p className="text-sm font-medium">{formatCardLabel(method)}</p>
          <p className="text-muted-foreground text-xs">
            Expires {method.expMonth}/{method.expYear}
          </p>
        </div>
      </div>
      {method.isDefault ? <Badge variant="secondary">Default</Badge> : null}
    </li>
  );
}

interface BillingPaymentMethodsProps {
  enabled?: boolean;
  canManage?: boolean;
}

/** Saved cards for the workspace billing customer. */
export function BillingPaymentMethods({
  enabled = true,
  canManage = false,
}: BillingPaymentMethodsProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const orgId = useOrganizationStore((s) => s.organizationId);
  const query = useBillingPaymentMethods(enabled && isStripeEnabled());
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Synchronous twin of `isAdding` — see handleAddPaymentMethod.
  const isAddingRef = useRef(false);

  useEffect(() => {
    const { setupIntentClientSecret, redirectStatus } = readStripeBillingReturnParams();
    if (setupIntentClientSecret && redirectStatus === 'succeeded') {
      // Clear the return params through the router so its cached location stays
      // in sync (a raw replaceState would desync it).
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) =>
          omitStripeReturnParams(prev)) as never,
        replace: true,
      });
      queryClient
        .invalidateQueries({ queryKey: billingQueryKeys.paymentMethods(orgId) })
        .catch(() => {
          /* best effort — list refetches on next focus */
        });
    } else if (setupIntentClientSecret) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from Stripe redirect params
      setSetupSecret(setupIntentClientSecret);
    }
  }, [queryClient, navigate, orgId]);

  async function handleAddPaymentMethod() {
    // `isAdding` only disables the button after React re-renders, so a second
    // click in the same frame would open a second Stripe setup intent. This ref
    // flips synchronously, so the duplicate is dropped before the request.
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    setIsAdding(true);
    try {
      const setup = await billingApi.createPaymentMethodSetup();
      if (setup.clientSecret) {
        setSetupSecret(setup.clientSecret);
      }
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  }

  async function refreshPaymentMethods() {
    setSetupSecret(null);
    await queryClient.invalidateQueries({
      queryKey: billingQueryKeys.paymentMethods(orgId),
    });
  }

  // Hide entirely when disabled (no subscription) or Stripe is off. The query
  // is gated the same way, so a disabled query's `isPending` would otherwise
  // leave the card stuck on a loading skeleton forever.
  if (!enabled || !isStripeEnabled()) {
    return null;
  }

  return (
    <Card data-testid="billing-payment-methods-card">
      <CardHeader>
        <CardTitle className="text-base">Payment methods</CardTitle>
        <CardDescription>
          Cards used for subscription renewals. Managed securely in-app via Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {setupSecret ? (
          <StripePaymentForm
            clientSecret={setupSecret}
            intent="setup"
            onCancel={() => setSetupSecret(null)}
            onComplete={() => void refreshPaymentMethods()}
          />
        ) : (
          <>
            <QueryBoundary
              query={query}
              errorMessage="Couldn't load payment methods. Please try again."
            >
              {(methods) =>
                methods.length > 0 ? (
                  <ul className="space-y-2" data-testid="billing-payment-methods-list">
                    {methods.map((method) => (
                      <PaymentMethodRow key={method.id} method={method} />
                    ))}
                  </ul>
                ) : (
                  <p
                    className="text-muted-foreground text-sm"
                    data-testid="billing-payment-methods-empty"
                  >
                    No payment methods on file yet.
                  </p>
                )
              }
            </QueryBoundary>
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAdding}
                onClick={() => void handleAddPaymentMethod()}
                data-testid="billing-add-payment-method"
              >
                {isAdding ? 'Loading…' : 'Add payment method'}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
