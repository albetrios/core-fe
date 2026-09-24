import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const confirmPayment = vi.fn();
const confirmSetup = vi.fn();
const useStripeMock = vi.fn();
const useElementsMock = vi.fn();

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => useStripeMock(),
  useElements: () => useElementsMock(),
}));

vi.mock('@/shared/billing/load-stripe.ts', () => ({
  getStripePromise: vi.fn(async () => ({})),
}));

import { StripePaymentForm } from './StripePaymentForm.tsx';

describe('StripePaymentForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useStripeMock.mockReturnValue({ confirmPayment, confirmSetup });
    useElementsMock.mockReturnValue({});
    confirmPayment.mockResolvedValue({ error: null });
    confirmSetup.mockResolvedValue({ error: null });
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <StripePaymentForm
        clientSecret="pi_test_secret"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('confirms payment and calls onComplete when Stripe succeeds', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret"
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('stripe-payment-submit'));
    expect(confirmPayment).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows an error when Stripe returns a failure', async () => {
    confirmPayment.mockResolvedValue({ error: { message: 'Card declined' } });
    const user = userEvent.setup();
    render(
      <StripePaymentForm
        clientSecret="pi_test_secret"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('stripe-payment-submit'));
    expect(screen.getByTestId('stripe-payment-error')).toHaveTextContent('Card declined');
  });

  it('confirms setup and calls onComplete for setup intent', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <StripePaymentForm
        clientSecret="seti_test_secret"
        intent="setup"
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('stripe-payment-submit'));
    expect(confirmSetup).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });
});
