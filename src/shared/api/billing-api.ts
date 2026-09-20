import type { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import { parseListTolerant } from '@/lib/parse-list-tolerant.ts';
import type {
  BillingCycle,
  BillingInvoice,
  BillingPaymentMethod,
  BillingPlan,
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/shared/api/billing-contracts.ts';
import {
  billingInvoiceWireSchema,
  billingPaymentMethodWireSchema,
  billingPaymentSetupWireSchema,
  billingPlanWireSchema,
  billingSubscriptionWireSchema,
} from '@/shared/api/billing-contracts.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';
import { isHttpError } from '@/shared/errors/HttpError.ts';

const BILLING_API = `${API_BASE_PATH}/billing`;

const TERMINAL_SUBSCRIPTION_STATUSES = new Set<BillingSubscriptionStatus>([
  'canceled',
  'incomplete_expired',
]);

function parseMoneyToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function normalizeBillingCycle(value: string): BillingCycle {
  return value.toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
}

function normalizeSubscriptionStatus(value: string): BillingSubscriptionStatus {
  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'paused':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return normalized;
    default:
      return 'active';
  }
}

function toBillingPlan(w: z.infer<typeof billingPlanWireSchema>): BillingPlan {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    priceMonthly: parseMoneyToCents(w.price_monthly),
    priceYearly: parseMoneyToCents(w.price_yearly),
    currency: w.currency.toLowerCase(),
    isActive: w.is_active,
    seatLimit: w.limits.seats,
  };
}

function toBillingSubscription(
  w: z.infer<typeof billingSubscriptionWireSchema>,
): BillingSubscription {
  return {
    id: w.id,
    planId: w.plan_id,
    status: normalizeSubscriptionStatus(w.status),
    billingCycle: normalizeBillingCycle(w.billing_cycle),
    currentPeriodStart: w.current_period_start,
    currentPeriodEnd: w.current_period_end,
    trialEnd: w.trial_end,
    cancelAtPeriodEnd: w.cancel_at_period_end,
    canceledAt: w.canceled_at,
    provider: w.provider,
    seatsTotal: w.seats_total,
    seatsUsed: w.seats_used,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

function normalizeInvoiceStatus(value: string): BillingInvoice['status'] {
  const normalized = value.toLowerCase();
  if (
    normalized === 'draft' ||
    normalized === 'open' ||
    normalized === 'paid' ||
    normalized === 'void' ||
    normalized === 'uncollectible'
  ) {
    return normalized;
  }
  return 'draft';
}

function toBillingInvoice(w: z.infer<typeof billingInvoiceWireSchema>): BillingInvoice {
  return {
    id: w.id,
    invoiceNumber: w.invoice_number,
    status: normalizeInvoiceStatus(w.status),
    amountDue: parseMoneyToCents(w.amount_due),
    amountPaid: parseMoneyToCents(w.amount_paid),
    currency: w.currency.toLowerCase(),
    createdAt: w.created_at,
    dueDate: w.due_date,
    hostedInvoiceUrl: w.hosted_invoice_url,
    invoicePdfUrl: w.invoice_pdf,
  };
}

function toBillingPaymentMethod(
  w: z.infer<typeof billingPaymentMethodWireSchema>,
): BillingPaymentMethod {
  return {
    id: w.id,
    brand: w.brand,
    last4: w.last4,
    expMonth: w.exp_month,
    expYear: w.exp_year,
    isDefault: w.is_default,
  };
}

export async function listBillingPlans(): Promise<BillingPlan[]> {
  const res = await apiClient.get<unknown>(`${BILLING_API}/plans`);
  // Tolerant parse: one malformed plan row must not blank the whole pricing
  // catalog — drop it (logged) and render the rest.
  return parseListTolerant(billingPlanWireSchema, res.data, 'billing-plans').map(
    toBillingPlan,
  );
}

async function listSubscriptions(): Promise<BillingSubscription[]> {
  const res = await apiClient.get<unknown>(`${BILLING_API}/subscriptions`);
  return parseListTolerant(
    billingSubscriptionWireSchema,
    res.data,
    'billing-subscriptions',
  ).map(toBillingSubscription);
}

/**
 * First non-terminal subscription for the active organization, if any.
 *
 * A personal workspace (and any context without billing access) is **forbidden**
 * from reading subscriptions — the backend answers `403`. That means "no active
 * subscription", not a failure: treat it as `null` so the billing panel renders
 * the no-plan state instead of a dead-end "couldn't load billing" error whose
 * Retry can never succeed.
 */
export async function getActiveSubscription(): Promise<BillingSubscription | null> {
  let subscriptions: BillingSubscription[];
  try {
    subscriptions = await listSubscriptions();
  } catch (error) {
    if (isHttpError(error) && error.status === 403) return null;
    throw error;
  }
  return (
    subscriptions.find(
      (subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status),
    ) ?? null
  );
}

export async function createSubscription(input: {
  planId: string;
  billingCycle: BillingCycle;
}): Promise<BillingSubscription> {
  const res = await apiClient.post<unknown>(`${BILLING_API}/subscriptions`, {
    plan_id: input.planId,
    billing_cycle: input.billingCycle,
  });
  return toBillingSubscription(billingSubscriptionWireSchema.parse(res.data));
}

export async function changeSubscriptionPlan(input: {
  subscriptionId: string;
  planId: string;
}): Promise<BillingSubscription> {
  const res = await apiClient.post<unknown>(
    `${BILLING_API}/subscriptions/${encodeURIComponent(input.subscriptionId)}/change-plan`,
    { plan_id: input.planId },
  );
  return toBillingSubscription(billingSubscriptionWireSchema.parse(res.data));
}

export async function cancelSubscription(
  subscriptionId: string,
): Promise<BillingSubscription> {
  const res = await apiClient.post<unknown>(
    `${BILLING_API}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
  );
  return toBillingSubscription(billingSubscriptionWireSchema.parse(res.data));
}

export async function resumeSubscription(
  subscriptionId: string,
): Promise<BillingSubscription> {
  const res = await apiClient.post<unknown>(
    `${BILLING_API}/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
  );
  return toBillingSubscription(billingSubscriptionWireSchema.parse(res.data));
}

export async function getSubscriptionPaymentSetup(
  subscriptionId: string,
): Promise<{ clientSecret: string | null }> {
  const res = await apiClient.get<unknown>(
    `${BILLING_API}/subscriptions/${encodeURIComponent(subscriptionId)}/payment-setup`,
  );
  const wire = billingPaymentSetupWireSchema.parse(res.data);
  return { clientSecret: wire.client_secret };
}

export async function listBillingInvoices(): Promise<BillingInvoice[]> {
  // Follow the backend cursor (`meta.pagination.next`) so a customer with more
  // than one Stripe page of invoices sees their full history — not just the
  // latest page. Rows are parsed tolerantly per page (a single malformed invoice
  // — an unexpected Stripe field on one row — must not blank the whole history).
  const rows = await fetchAllPages(
    `${BILLING_API}/invoices`,
    billingInvoiceWireSchema,
    'billing-invoices',
  );
  return rows.map(toBillingInvoice);
}

export async function listBillingPaymentMethods(): Promise<BillingPaymentMethod[]> {
  const res = await apiClient.get<unknown>(`${BILLING_API}/payment-methods`);
  return parseListTolerant(
    billingPaymentMethodWireSchema,
    res.data,
    'billing-payment-methods',
  ).map(toBillingPaymentMethod);
}

export async function createPaymentMethodSetup(): Promise<{
  clientSecret: string | null;
}> {
  const res = await apiClient.post<unknown>(`${BILLING_API}/payment-methods/setup`);
  const wire = billingPaymentSetupWireSchema.parse(res.data);
  return { clientSecret: wire.client_secret };
}
