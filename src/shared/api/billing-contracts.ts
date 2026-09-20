import { z } from 'zod';

import { isoDateString, publicId } from '@/core/types/wire.ts';

/** Subscription lifecycle status (normalized from core-be uppercase wire values). */

export type BillingSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired';

export type BillingCycle = 'monthly' | 'yearly';

export type BillingPlan = {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  isActive: boolean;
  seatLimit: number | null;
};

export type BillingSubscription = {
  id: string;
  planId: string | null;
  status:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'paused'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired';
  billingCycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  provider: string | null;
  seatsTotal: number | null;
  seatsUsed: number;
  createdAt: string;
  updatedAt: string;
};

/** Wire schemas — mirror core-be billing serializers. */
export const billingPlanWireSchema = z.object({
  id: publicId('pln'),
  name: z.string(),
  description: z.string().nullable(),
  price_monthly: z.string(),
  price_yearly: z.string(),
  currency: z.string(),
  is_active: z.boolean(),
  features: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  limits: z.object({
    seats: z.number().int().positive().nullable(),
  }),
  created_at: isoDateString,
  updated_at: isoDateString,
});

export const billingSubscriptionWireSchema = z.object({
  id: publicId('sub'),
  plan_id: publicId('pln').nullable(),
  status: z.string(),
  billing_cycle: z.string(),
  current_period_start: isoDateString,
  current_period_end: isoDateString,
  trial_end: isoDateString.nullable(),
  cancel_at_period_end: z.boolean(),
  canceled_at: isoDateString.nullable(),
  provider: z.string().nullable(),
  seats_total: z.number().int().positive().nullable(),
  seats_used: z.number().int().nonnegative(),
  created_at: isoDateString,
  updated_at: isoDateString,
});

export const billingPaymentSetupWireSchema = z.object({
  client_secret: z.string().nullable(),
});

export type BillingInvoice = {
  id: string;
  invoiceNumber: string | null;
  status: 'void' | 'draft' | 'open' | 'paid' | 'uncollectible';
  amountDue: number;
  amountPaid: number;
  currency: string;
  createdAt: string;
  dueDate: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

export type BillingPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export const billingInvoiceWireSchema = z.object({
  id: z.string(),
  invoice_number: z.string().nullable(),
  status: z.string(),
  amount_due: z.string(),
  amount_paid: z.string(),
  currency: z.string(),
  created_at: isoDateString,
  due_date: isoDateString.nullable(),
  hosted_invoice_url: z.string().nullable(),
  invoice_pdf: z.string().nullable(),
});

export const billingPaymentMethodWireSchema = z.object({
  id: z.string(),
  brand: z.string(),
  last4: z.string(),
  exp_month: z.number().int(),
  exp_year: z.number().int(),
  is_default: z.boolean(),
});
