import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const { navigateMock, createPaymentMethodSetupMock, notifyErrorMock, stripeForm } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    createPaymentMethodSetupMock: vi.fn(),
    notifyErrorMock: vi.fn(),
    /** Per-test switch for the third-party card form. */
    stripeForm: { crashes: false },
  }));

vi.mock('@/shared/notify/index.ts', () => ({
  notify: { error: notifyErrorMock, success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/shared/components/StripePaymentForm/index.ts', () => ({
  StripePaymentForm: () => {
    if (stripeForm.crashes) throw new Error('stripe elements exploded');
    return <div data-testid="stripe-payment-form" />;
  },
}));

vi.mock('@/shared/api/billing-api.ts', () => ({
  createPaymentMethodSetup: createPaymentMethodSetupMock,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/shared/billing/stripe-config.ts', () => ({
  isStripeEnabled: () => true,
}));

vi.mock('@/shared/hooks/useBillingPaymentMethods/index.ts', () => ({
  useBillingPaymentMethods: () => ({
    data: [
      {
        id: 'pm_1',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
      },
    ],
    isPending: false,
    isLoading: false,
    isError: false,
  }),
}));

import { BillingPaymentMethods } from './BillingPaymentMethods.tsx';

function renderMethods() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingPaymentMethods canManage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  navigateMock.mockClear();
  createPaymentMethodSetupMock.mockReset();
  notifyErrorMock.mockClear();
  stripeForm.crashes = false;
  window.history.replaceState({}, '', '/');
});

describe('BillingPaymentMethods', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderMethods();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lists saved payment methods', () => {
    renderMethods();
    expect(screen.getByTestId('billing-payment-method-pm_1')).toBeInTheDocument();
    expect(screen.getByTestId('billing-add-payment-method')).toBeInTheDocument();
  });

  it('strips Stripe setup-intent return params through the router', () => {
    window.history.replaceState(
      {},
      '',
      '/organization/acme/dashboard?setup_intent_client_secret=si_secret&redirect_status=succeeded#settings/account/billing',
    );
    renderMethods();

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '.', replace: true }),
    );
    const updater = navigateMock.mock.calls.at(-1)?.[0]?.search as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(
      updater({ setup_intent_client_secret: 'si_secret', redirect_status: 'succeeded' }),
    ).toEqual({});
  });

  it('renders nothing when disabled (no subscription — was a stuck skeleton)', () => {
    // Regression: the card rendered whenever Stripe was on, but the query was
    // disabled without a subscription, stranding a permanent loading skeleton.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { queryByTestId } = render(
      <QueryClientProvider client={client}>
        <BillingPaymentMethods enabled={false} canManage />
      </QueryClientProvider>,
    );
    expect(queryByTestId('billing-payment-methods-card')).not.toBeInTheDocument();
  });

  // A second click before React re-renders would open a second Stripe setup
  // intent — `disabled={isAdding}` cannot land in that frame.
  it('opens only one Stripe setup intent when the add button is double-clicked', async () => {
    let release: ((value: { clientSecret: string | null }) => void) | undefined;
    createPaymentMethodSetupMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    renderMethods();
    const button = screen.getByTestId('billing-add-payment-method');
    // Dispatched inside ONE act() batch, so React has not re-rendered between
    // them and `disabled={isAdding}` has not reached the DOM yet — the real
    // double-click window. fireEvent flushes after each call, so it cannot
    // reproduce this.
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createPaymentMethodSetupMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.({ clientSecret: null });
    });
    expect(createPaymentMethodSetupMock).toHaveBeenCalledTimes(1);
  });

  // ── SET-17: a failed setup is news, not silence ──────────────────────────

  it('says so when the setup call fails, instead of just re-enabling', async () => {
    // Regression: try/finally with no catch. The button came back to life and
    // that was the entire feedback — identical to a click that did nothing.
    createPaymentMethodSetupMock.mockRejectedValue(new Error('stripe is down'));
    renderMethods();

    await act(async () => {
      screen
        .getByTestId('billing-add-payment-method')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(notifyErrorMock).toHaveBeenCalledTimes(1);
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'billing-add-payment-method' }),
    );
    expect(screen.getByTestId('billing-add-payment-method')).toBeEnabled();
  });

  it('still reports the failure when the panel was closed mid-request', async () => {
    // The request outlives the card when the user closes Settings. State must
    // not be written into a component that is gone — but the news still travels.
    let reject: ((reason: Error) => void) | undefined;
    createPaymentMethodSetupMock.mockImplementation(
      () =>
        new Promise((_resolve, rejectFn) => {
          reject = rejectFn;
        }),
    );
    const { unmount } = renderMethods();

    act(() => {
      screen
        .getByTestId('billing-add-payment-method')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    unmount();

    await act(async () => {
      reject?.(new Error('stripe is down'));
    });

    expect(notifyErrorMock).toHaveBeenCalledTimes(1);
  });

  it('reports a 200 that carries no client secret', async () => {
    createPaymentMethodSetupMock.mockResolvedValue({ clientSecret: null });
    renderMethods();

    await act(async () => {
      screen
        .getByTestId('billing-add-payment-method')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(notifyErrorMock).toHaveBeenCalledTimes(1);
  });

  it('contains a crash in the card form to that form', async () => {
    // Stripe Elements is third-party and mounts an iframe: a throw in there
    // must cost the form, not the payment-methods card around it.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    stripeForm.crashes = true;
    window.history.replaceState(
      {},
      '',
      '/dashboard?setup_intent_client_secret=si_secret',
    );
    renderMethods();

    expect(await screen.findByTestId('billing-payment-form-error')).toBeInTheDocument();
    expect(screen.getByTestId('billing-payment-methods-card')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
