import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import i18n from '@/lib/i18n/i18n.ts';
import type { BillingSubscription } from '@/shared/api/billing-contracts.ts';

import { SETTINGS_KEYS, SETTINGS_NS } from '../../settings.constants.ts';

const KEYS = SETTINGS_KEYS.panels.billing.cancellation;

/** The section's copy as the bundle renders it — never the English literal. */
const copy = (key: string, lng = 'en') => i18n.t(key, { ns: SETTINGS_NS, lng });

const { cancelMutate, resumeMutate, ctl } = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  resumeMutate: vi.fn(),
  /** Settles whichever lifecycle write is in flight. */
  ctl: { finish: null as null | (() => void) },
}));

/**
 * Stateful stubs: the pending flag IS the subject here, and a mock frozen at
 * `isPending: false` cannot show a confirm that fails to hold itself open.
 */
vi.mock('@/shared/hooks/useSubscription/index.ts', async () => {
  const { useState } = await import('react');
  function useLifecycle(spy: typeof cancelMutate) {
    const [isPending, setIsPending] = useState(false);
    function mutate(id: string, options?: { onSuccess?: () => void }) {
      spy(id, options);
      setIsPending(true);
      ctl.finish = settle.bind(null, options);
    }
    function settle(options?: { onSuccess?: () => void }) {
      setIsPending(false);
      options?.onSuccess?.();
    }
    return { isPending, mutate };
  }
  return {
    useCancelSubscription: () => useLifecycle(cancelMutate),
    useResumeSubscription: () => useLifecycle(resumeMutate),
  };
});

import { BillingCancellationSection } from './BillingCancellationSection.tsx';

const SUB: BillingSubscription = {
  id: 'sub_test',
  planId: 'pln_pro',
  status: 'active',
  billingCycle: 'monthly',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-12-01T00:00:00.000Z',
  trialEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  provider: 'stripe',
  seatsTotal: 3,
  seatsUsed: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderSection(canManage = true, subscription: BillingSubscription = SUB) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingCancellationSection subscription={subscription} canManage={canManage} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  ctl.finish = null;
});

describe('BillingCancellationSection', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderSection();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows cancel control when the user can manage billing', () => {
    renderSection(true);
    expect(screen.getByTestId('billing-cancel')).toBeInTheDocument();
  });

  it('hides the section when the user cannot manage billing', () => {
    renderSection(false);
    expect(screen.queryByTestId('billing-cancellation-card')).not.toBeInTheDocument();
  });

  // ── SET-14: a cancellation the user can see happening ────────────────────

  it('holds the confirm open until the cancellation resolves', async () => {
    // Regression: no e.preventDefault(), so Radix closed the dialog on click —
    // and the mutation had no success message either, so cancelling a paid
    // subscription produced exactly nothing on screen.
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId('billing-cancel'));
    await user.click(await screen.findByTestId('billing-cancel-confirm'));

    expect(cancelMutate).toHaveBeenCalledWith(
      'sub_test',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // Still open, still busy, and no longer pressable.
    const confirm = await screen.findByTestId('billing-cancel-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm.querySelector('.animate-spin')).not.toBeNull();
    expect(confirm).toHaveTextContent(copy(KEYS.cancelling));

    act(() => ctl.finish?.());
    expect(screen.queryByTestId('billing-cancel-confirm')).not.toBeInTheDocument();
  });

  it('shows the resume button working, not just greyed out', async () => {
    const user = userEvent.setup();
    renderSection(true, { ...SUB, cancelAtPeriodEnd: true });

    await user.click(screen.getByTestId('billing-resume'));

    const resume = screen.getByTestId('billing-resume');
    expect(resume).toHaveAttribute('aria-busy', 'true');
    expect(resume.querySelector('.animate-spin')).not.toBeNull();
    expect(resume).toHaveTextContent(copy(KEYS.resuming));
  });
});
