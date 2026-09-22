import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as billingApi from '@/shared/api/billing-api.ts';
import type { BillingCycle } from '@/shared/api/billing-contracts.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** One toast id for cancel + resume — the two directions of one switch. */
const SUBSCRIPTION_LIFECYCLE_TOAST = 'subscription-lifecycle';

/**
 * Active subscription for the current organization — query + plan mutations.
 * Server state only — never mirrored into Zustand (file-structure.mdc).
 */
export function useSubscription() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: billingQueryKeys.activeSubscription(orgId),
    queryFn: billingApi.getActiveSubscription,
    // The billing panel renders a QueryBoundary for exactly this failure.
    notifyOnError: false,
  });
}

/**
 * The one answer to "what plan is this workspace on?".
 *
 * @remarks
 * The dashboard used to answer it from a hardcoded `isTeam ? 'Managed' : '—'`
 * and a fabricated sample card, while Settings → Billing answered it from the
 * API — so a workspace with no subscription at all read "Managed · Team plan"
 * on one screen and "No plan · choose one below" on the next (QA-V3-3). Both
 * surfaces now derive from here.
 *
 * `price` is the amount for the cycle the subscription is actually on, so the
 * headline figure matches the invoice rather than an arbitrary monthly rate. A
 * context without billing access (a personal workspace) resolves to no
 * subscription rather than an error — see {@link billingApi.getActiveSubscription}.
 */
export function useCurrentPlan() {
  const subscriptionQuery = useSubscription();
  const plansQuery = useBillingPlans();
  const subscription = subscriptionQuery.data ?? null;
  const plan =
    subscription?.planId && plansQuery.data
      ? (plansQuery.data.find((candidate) => candidate.id === subscription.planId) ??
        null)
      : null;
  const cyclePrice =
    subscription?.billingCycle === 'yearly' ? plan?.priceYearly : plan?.priceMonthly;

  return {
    subscription,
    plan,
    /** Amount in cents for the subscription's own cycle, or null without one. */
    priceCents: cyclePrice ?? null,
    currency: plan?.currency ?? null,
    /** Still resolving — surfaces should show a placeholder, never a guess. */
    isPending: subscriptionQuery.isPending || plansQuery.isPending,
  };
}

export function useBillingPlans() {
  return useAppQuery({
    queryKey: billingQueryKeys.plans(),
    queryFn: billingApi.listBillingPlans,
    // The plan grid is wrapped in a QueryBoundary.
    notifyOnError: false,
  });
}

export function useSelectBillingPlan() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: async ({
      planId,
      billingCycle,
    }: {
      planId: string;
      billingCycle: BillingCycle;
    }) => {
      const existing = await billingApi.getActiveSubscription();
      if (existing) {
        return billingApi.changeSubscriptionPlan({
          subscriptionId: existing.id,
          planId,
        });
      }
      return billingApi.createSubscription({ planId, billingCycle });
    },
    invalidateKeys: [
      billingQueryKeys.activeSubscription(orgId),
      billingQueryKeys.subscriptions(orgId),
    ],
    successMessage: (subscription) =>
      i18n.t(ERRORS_KEYS.frontend.hooks.subscription.changePlanSuccess, {
        ns: ERRORS_NS,
        plan: subscription.planId ?? 'plan',
      }),
  });
}

/**
 * Cancel at period end. Both lifecycle mutations share one `toastId`: cancel and
 * resume are the two directions of the same switch, so flipping it twice must
 * replace the first confirmation rather than stack a contradicting pair.
 */
export function useCancelSubscription() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (subscriptionId: string) => billingApi.cancelSubscription(subscriptionId),
    invalidateKeys: [billingQueryKeys.activeSubscription(orgId)],
    // Was silent: the dialog closed and NOTHING said the subscription had been
    // cancelled — the one write on this panel that costs the user money
    // (SET-14).
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.subscription.cancelSuccess, {
      ns: ERRORS_NS,
    }),
    toastId: SUBSCRIPTION_LIFECYCLE_TOAST,
  });
}

export function useResumeSubscription() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (subscriptionId: string) => billingApi.resumeSubscription(subscriptionId),
    invalidateKeys: [billingQueryKeys.activeSubscription(orgId)],
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.subscription.resumeSuccess, {
      ns: ERRORS_NS,
    }),
    toastId: SUBSCRIPTION_LIFECYCLE_TOAST,
  });
}
