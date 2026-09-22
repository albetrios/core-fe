import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type {
  BillingPaymentMethod,
  BillingPlan,
  BillingSubscription,
} from '@/shared/api/billing-contracts.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { getActiveSubscription, listBillingPlans, listBillingPaymentMethods, stripe } =
  vi.hoisted(() => ({
    getActiveSubscription: vi.fn(),
    listBillingPlans: vi.fn(),
    listBillingPaymentMethods: vi.fn(),
    stripe: { enabled: true },
  }));

vi.mock('@/shared/api/billing-api.ts', () => ({
  getActiveSubscription,
  listBillingPlans,
  listBillingPaymentMethods,
}));

vi.mock('@/shared/billing/stripe-config.ts', () => ({
  isStripeEnabled: () => stripe.enabled,
}));

import { BillingSummary } from './BillingSummary.tsx';

const PRO_PLAN: BillingPlan = {
  id: 'pln_pro',
  name: 'Pro',
  description: 'Everything, for teams',
  priceMonthly: 4900,
  priceYearly: 49_000,
  currency: 'usd',
  isActive: true,
  seatLimit: 25,
};

const SUBSCRIPTION: BillingSubscription = {
  id: 'sub_1',
  planId: 'pln_pro',
  status: 'active',
  billingCycle: 'monthly',
  currentPeriodStart: '2026-09-01T00:00:00.000Z',
  currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  trialEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  provider: 'stripe',
  seatsTotal: 25,
  seatsUsed: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const CARD: BillingPaymentMethod = {
  id: 'pm_1',
  brand: 'visa',
  last4: '4242',
  expMonth: 12,
  expYear: 2030,
  isDefault: true,
};

describe('BillingSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The subscription read is gated on `subscription:read` (and a signed-in
    // user): without both, the query is never sent and this panel has no plan
    // to show — which is the point of the gate, not a failure of this panel.
    useAuthStore.setState({
      user: { id: 'usr_1', email: 'a@b.test', role: 'member' } as never,
    });
    useOrganizationStore.setState({ permissions: ['subscription:read'] });
    stripe.enabled = true;
    getActiveSubscription.mockResolvedValue(null);
    listBillingPlans.mockResolvedValue([PRO_PLAN]);
    listBillingPaymentMethods.mockResolvedValue([CARD]);
  });

  it('renders its key surfaces', async () => {
    renderWithProviders(<BillingSummary />);

    expect(await screen.findByTestId('dashboard-billing-summary')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-billing-amount')).toBeInTheDocument();
  });

  // Regression (QA-V3-3): this card claimed "Managed · Team plan · $49" from a
  // hardcoded sample while Settings → Billing, one click away, said there was no
  // active subscription at all. Both now read the same `useCurrentPlan`.
  it('says there is no plan when the workspace has no subscription', async () => {
    renderWithProviders(<BillingSummary />);

    await waitFor(() =>
      expect(screen.getByTestId('dashboard-billing-plan')).toHaveTextContent('No plan'),
    );
    expect(screen.getByTestId('dashboard-billing-manage')).toHaveTextContent(
      'Choose a plan',
    );
    expect(screen.queryByTestId('dashboard-billing-status')).not.toBeInTheDocument();
    // …and nothing fabricated in its place.
    expect(screen.getByTestId('dashboard-billing-amount')).toHaveTextContent('—');
  });

  it('shows the real plan, status and card once a subscription exists', async () => {
    getActiveSubscription.mockResolvedValue(SUBSCRIPTION);
    renderWithProviders(<BillingSummary />);

    await waitFor(() =>
      expect(screen.getByTestId('dashboard-billing-plan')).toHaveTextContent('Pro'),
    );
    expect(screen.getByTestId('dashboard-billing-status')).toHaveTextContent('active');
    expect(screen.getByTestId('dashboard-billing-manage')).toHaveTextContent(
      'Manage billing',
    );
    expect(await screen.findByText(/4242/)).toBeInTheDocument();
  });

  it('asks for no payment methods when there is nothing to bill', async () => {
    renderWithProviders(<BillingSummary />);
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-billing-plan')).toHaveTextContent('No plan'),
    );
    expect(listBillingPaymentMethods).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<BillingSummary />);
    await screen.findByTestId('dashboard-billing-summary');
    expect(await axe(container)).toHaveNoViolations();
  });
});
