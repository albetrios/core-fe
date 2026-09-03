import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getActiveSubscription,
  createSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  resumeSubscription,
} = vi.hoisted(() => ({
  getActiveSubscription: vi.fn(),
  createSubscription: vi.fn(),
  changeSubscriptionPlan: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
}));
vi.mock('@/shared/api/billing-api.ts', () => ({
  getActiveSubscription,
  createSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  resumeSubscription,
}));
const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import {
  useCancelSubscription,
  useResumeSubscription,
  useSelectBillingPlan,
  useSubscription,
} from './useSubscription.ts';

const SUB = { id: 'sub_test', planId: 'pln_test', status: 'active' as const };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSubscription', () => {
  it('loads getActiveSubscription data under the billing query key', async () => {
    getActiveSubscription.mockResolvedValue(SUB);
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SUB);
  });
});

describe('useSelectBillingPlan', () => {
  it('creates a subscription when none exists yet', async () => {
    getActiveSubscription.mockResolvedValue(null);
    createSubscription.mockResolvedValue({ id: 'sub_new', planId: 'pln_pro' });
    const { result } = renderHook(() => useSelectBillingPlan(), { wrapper });

    result.current.mutate({ planId: 'pln_pro', billingCycle: 'monthly' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createSubscription).toHaveBeenCalledWith({
      planId: 'pln_pro',
      billingCycle: 'monthly',
    });
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('changes the plan of the existing subscription (upgrade/downgrade)', async () => {
    getActiveSubscription.mockResolvedValue({ id: 'sub_1', planId: 'pln_free' });
    changeSubscriptionPlan.mockResolvedValue({ id: 'sub_1', planId: 'pln_pro' });
    const { result } = renderHook(() => useSelectBillingPlan(), { wrapper });

    result.current.mutate({ planId: 'pln_pro', billingCycle: 'monthly' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeSubscriptionPlan).toHaveBeenCalledWith({
      subscriptionId: 'sub_1',
      planId: 'pln_pro',
    });
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('surfaces the error when the plan change fails', async () => {
    getActiveSubscription.mockResolvedValue({ id: 'sub_1', planId: 'pln_free' });
    changeSubscriptionPlan.mockRejectedValue(new Error('declined'));
    const { result } = renderHook(() => useSelectBillingPlan(), { wrapper });

    result.current.mutate({ planId: 'pln_pro', billingCycle: 'monthly' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});

describe('useCancelSubscription', () => {
  it('cancels the subscription by id', async () => {
    cancelSubscription.mockResolvedValue({ ...SUB, cancelAtPeriodEnd: true });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper });

    result.current.mutate('sub_test');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancelSubscription).toHaveBeenCalledWith('sub_test');
  });

  it('confirms the cancellation — the one write here that costs money', async () => {
    // Regression: cancel and resume were the only mutations in the app with no
    // successMessage, so the dialog closed and nothing said it had worked.
    cancelSubscription.mockResolvedValue({ ...SUB, cancelAtPeriodEnd: true });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper });

    result.current.mutate('sub_test');

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    // One id for both directions of the switch: cancel → resume → cancel
    // replaces its confirmation instead of stacking contradicting ones.
    expect(notifySuccess).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'subscription-lifecycle' }),
    );
  });
});

describe('useResumeSubscription', () => {
  it('resumes the subscription by id', async () => {
    resumeSubscription.mockResolvedValue({ ...SUB, cancelAtPeriodEnd: false });
    const { result } = renderHook(() => useResumeSubscription(), { wrapper });

    result.current.mutate('sub_test');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(resumeSubscription).toHaveBeenCalledWith('sub_test');
  });

  it('confirms the resume, under the same toast id', async () => {
    resumeSubscription.mockResolvedValue({ ...SUB, cancelAtPeriodEnd: false });
    const { result } = renderHook(() => useResumeSubscription(), { wrapper });

    result.current.mutate('sub_test');

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    expect(notifySuccess).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'subscription-lifecycle' }),
    );
  });
});
