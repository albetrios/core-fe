import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { useState } from 'react';

import { stripeBillingReturnUrl } from '@/lib/billing/stripe-return.ts';
import { getStripePromise } from '@/shared/billing/load-stripe.ts';
import { Button } from '@/shared/components/ui/button.tsx';

type StripeBillingIntent = 'payment' | 'setup';

interface StripePaymentFormInnerProps {
  intent: StripeBillingIntent;
  onComplete: () => void;
  onCancel: () => void;
}

function resolveSubmitLabel(intent: StripeBillingIntent, isSubmitting: boolean): string {
  if (intent === 'setup') return isSubmitting ? 'Saving…' : 'Save payment method';
  return isSubmitting ? 'Confirming…' : 'Confirm payment';
}

function StripePaymentFormInner({
  intent,
  onComplete,
  onCancel,
}: StripePaymentFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    if (!(stripe && elements)) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const returnUrl = stripeBillingReturnUrl();
    const result =
      intent === 'setup'
        ? await stripe.confirmSetup({
            elements,
            redirect: 'if_required',
            confirmParams: { return_url: returnUrl },
          })
        : await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: { return_url: returnUrl },
          });

    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(result.error.message ?? 'Payment could not be completed.');
      return;
    }

    onComplete();
  }

  const submitLabel = resolveSubmitLabel(intent, isSubmitting);

  return (
    <div className="flex flex-col gap-4" data-testid="stripe-payment-form">
      <PaymentElement />
      {errorMessage ? (
        <p
          className="text-destructive text-sm"
          data-testid="stripe-payment-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!(stripe && elements) || isSubmitting}
          data-testid="stripe-payment-submit"
        >
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="stripe-payment-cancel"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export interface StripePaymentFormProps {
  clientSecret: string;
  intent?: StripeBillingIntent;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Stripe Payment Element — subscription payment (PaymentIntent) or add card (SetupIntent).
 */
export function StripePaymentForm({
  clientSecret,
  intent = 'payment',
  onComplete,
  onCancel,
}: StripePaymentFormProps) {
  return (
    <Elements stripe={getStripePromise()} options={{ clientSecret }}>
      <StripePaymentFormInner
        intent={intent}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </Elements>
  );
}
