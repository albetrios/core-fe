import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  readStripeBillingReturnParams,
  stripeReturnCleanupNavigation,
} from '@/lib/billing/stripe-return.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as billingApi from '@/shared/api/billing-api.ts';
import type { BillingPaymentMethod } from '@/shared/api/billing-contracts.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { isStripeEnabled } from '@/shared/billing/stripe-config.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
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
import { mapApiError } from '@/shared/errors/errorHandler.ts';
import { useBillingPaymentMethods } from '@/shared/hooks/useBillingPaymentMethods/index.ts';
import { CreditCard } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** One toast id for the add-card button — a retry replaces, never stacks. */
const ADD_METHOD_TOAST = 'billing-add-payment-method';

const METHOD_KEYS = SETTINGS_KEYS.panels.billing.paymentMethods;

function formatCardLabel(method: BillingPaymentMethod, t: TFunction) {
  const brand = method.brand ? method.brand.toUpperCase() : t(METHOD_KEYS.cardFallback);
  return `${brand} ···· ${method.last4}`;
}

function PaymentMethodRow({ method }: { method: BillingPaymentMethod }) {
  const { t } = useTranslation(SETTINGS_NS);
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      data-testid={`billing-payment-method-${method.id}`}
    >
      <div className="flex items-center gap-2">
        <CreditCard className="text-muted-foreground size-4" data-icon />
        <div>
          <p className="text-sm font-medium">{formatCardLabel(method, t)}</p>
          <p className="text-muted-foreground text-xs">
            {t(METHOD_KEYS.expires, { month: method.expMonth, year: method.expYear })}
          </p>
        </div>
      </div>
      {method.isDefault ? (
        <Badge variant="secondary">{t(METHOD_KEYS.defaultBadge)}</Badge>
      ) : null}
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
  const { t } = useTranslation(SETTINGS_NS);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const orgId = useOrganizationStore((s) => s.organizationId);
  const query = useBillingPaymentMethods(enabled && isStripeEnabled());
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Synchronous twin of `isAdding` — see handleAddPaymentMethod.
  const isAddingRef = useRef(false);
  /**
   * The setup request outlives this card when the user closes Settings
   * mid-flight. Its result must not be written into a component that is gone —
   * the toast still fires, because the failure is the user's news either way.
   */
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Set on every run, not just the first: React re-runs mount effects (Strict
    // Mode does it immediately), and a cleanup that only ever flips this to
    // false would leave the card permanently "unmounted" to itself.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const { setupIntentClientSecret, redirectStatus } = readStripeBillingReturnParams();
    if (setupIntentClientSecret && redirectStatus === 'succeeded') {
      // Clear the return params through the router so its cached location stays
      // in sync (a raw replaceState would desync it) — keeping the settings hash,
      // or the modal this card lives in closes (`stripeReturnCleanupNavigation`).
      void navigate(stripeReturnCleanupNavigation());
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
      if (!setup.clientSecret) {
        // A 200 with no secret is still "no form to fill in".
        notify.error(i18n.t(ERRORS_KEYS.api.unexpected, { ns: ERRORS_NS }), {
          id: ADD_METHOD_TOAST,
        });
      } else if (isMountedRef.current) {
        setSetupSecret(setup.clientSecret);
      }
    } catch (error) {
      // Was a bare try/finally: the button simply re-enabled, so a failed setup
      // looked exactly like a click that did nothing (SET-17).
      notify.error(mapApiError(error), { id: ADD_METHOD_TOAST });
    } finally {
      isAddingRef.current = false;
      if (isMountedRef.current) setIsAdding(false);
    }
  }

  async function refreshPaymentMethods() {
    setSetupSecret(null);
    await queryClient
      .invalidateQueries({ queryKey: billingQueryKeys.paymentMethods(orgId) })
      .catch(() => {
        /* best effort — the list refetches on next focus */
      });
  }

  // Hide the whole card when there is no subscription, or Stripe is off. The
  // guard is about the card, not about the query: QueryBoundary tells a disabled
  // query apart from a loading one by itself now (X-5).
  if (!enabled || !isStripeEnabled()) {
    return null;
  }

  return (
    <Card data-testid="billing-payment-methods-card">
      <CardHeader>
        <CardTitle className="text-base">{t(METHOD_KEYS.title)}</CardTitle>
        <CardDescription>{t(METHOD_KEYS.description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {setupSecret ? (
          // Stripe Elements is third-party and mounts an iframe: a throw in
          // there costs the card form, not the whole billing panel.
          <SectionErrorBoundary
            title={i18n.t(ERRORS_KEYS.widget.payment, { ns: ERRORS_NS })}
            testId="billing-payment-form-error"
          >
            <StripePaymentForm
              clientSecret={setupSecret}
              intent="setup"
              onCancel={() => setSetupSecret(null)}
              onComplete={() => void refreshPaymentMethods()}
            />
          </SectionErrorBoundary>
        ) : (
          <>
            <QueryBoundary query={query} errorMessage={t(METHOD_KEYS.loadFailed)}>
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
                    {t(METHOD_KEYS.empty)}
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
                {isAdding ? t(METHOD_KEYS.adding) : t(METHOD_KEYS.add)}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
