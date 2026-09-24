import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: getMock, post: postMock },
}));

import { HttpError } from '@/shared/errors/HttpError.ts';

import {
  changeSubscriptionPlan,
  createPaymentMethodSetup,
  createSubscription,
  getActiveSubscription,
  getSubscriptionPaymentSetup,
  listBillingInvoices,
  listBillingPaymentMethods,
  listBillingPlans,
} from './billing-api.ts';

const TS = '2026-01-01T00:00:00.000Z';
const PLN_FREE = 'pln_sdtmjt7arqtzhood26fpd';
const PLN_PRO = 'pln_g0fu7wcajseuy94s0swvm';
const SUB_ID = 'sub_abcdefghij0123456789x';

const PLAN_WIRE = {
  id: PLN_PRO,
  name: 'Pro',
  description: null,
  price_monthly: '99.00',
  price_yearly: '990.00',
  currency: 'USD',
  is_active: true,
  features: {},
  limits: { seats: null },
  created_at: TS,
  updated_at: TS,
};

const SUB_WIRE = {
  id: SUB_ID,
  plan_id: PLN_FREE,
  status: 'ACTIVE',
  billing_cycle: 'MONTHLY',
  current_period_start: TS,
  current_period_end: '2026-12-01T00:00:00.000Z',
  trial_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  provider: 'stripe',
  seats_total: 10,
  seats_used: 2,
  created_at: TS,
  updated_at: TS,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('billing-api', () => {
  it('maps billing plans from the wire shape', async () => {
    getMock.mockResolvedValue({ data: [PLAN_WIRE] });
    const plans = await listBillingPlans();
    expect(plans[0]).toMatchObject({
      id: PLN_PRO,
      name: 'Pro',
      priceMonthly: 9900,
      priceYearly: 99000,
      currency: 'usd',
      isActive: true,
    });
  });

  it('drops a malformed plan instead of blanking the whole catalog (tolerant)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getMock.mockResolvedValue({ data: [PLAN_WIRE, { id: 'pln_broken' }] });

    const plans = await listBillingPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe(PLN_PRO);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns the first non-terminal subscription', async () => {
    getMock.mockResolvedValue({
      data: [
        { ...SUB_WIRE, status: 'CANCELED' },
        { ...SUB_WIRE, id: 'sub_abcdefghij0123456789y', status: 'ACTIVE' },
      ],
    });
    const sub = await getActiveSubscription();
    expect(sub?.id).toBe('sub_abcdefghij0123456789y');
    expect(sub?.status).toBe('active');
  });

  // Regression: a personal workspace is forbidden from reading subscriptions
  // (403). That must degrade to "no subscription" so the billing panel shows the
  // no-plan state, not a dead-end "couldn't load billing" whose Retry can't win.
  it('treats a 403 (no billing access) as no subscription', async () => {
    getMock.mockRejectedValue(
      new HttpError('Forbidden', 403, '/billing/subscriptions', 'GET', null),
    );
    await expect(getActiveSubscription()).resolves.toBeNull();
  });

  it('rethrows a non-403 subscription error', async () => {
    getMock.mockRejectedValue(
      new HttpError('Server error', 500, '/billing/subscriptions', 'GET', null),
    );
    await expect(getActiveSubscription()).rejects.toThrow();
  });

  it('creates a subscription with plan_id and billing_cycle', async () => {
    postMock.mockResolvedValue({ data: SUB_WIRE });
    const sub = await createSubscription({ planId: PLN_PRO, billingCycle: 'monthly' });
    expect(postMock).toHaveBeenCalledWith('/api/v1/billing/subscriptions', {
      plan_id: PLN_PRO,
      billing_cycle: 'monthly',
    });
    expect(sub.planId).toBe(PLN_FREE);
  });

  it('changes plan via the change-plan route', async () => {
    postMock.mockResolvedValue({ data: { ...SUB_WIRE, plan_id: PLN_PRO } });
    const sub = await changeSubscriptionPlan({ subscriptionId: SUB_ID, planId: PLN_PRO });
    expect(postMock).toHaveBeenCalledWith(
      `/api/v1/billing/subscriptions/${SUB_ID}/change-plan`,
      { plan_id: PLN_PRO },
    );
    expect(sub.planId).toBe(PLN_PRO);
  });

  it('reads payment setup client_secret', async () => {
    getMock.mockResolvedValue({ data: { client_secret: 'pi_secret' } });
    const setup = await getSubscriptionPaymentSetup(SUB_ID);
    expect(getMock).toHaveBeenCalledWith(
      `/api/v1/billing/subscriptions/${SUB_ID}/payment-setup`,
    );
    expect(setup.clientSecret).toBe('pi_secret');
  });

  it('maps invoices from the wire shape', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          id: 'in_123',
          invoice_number: 'INV-1',
          status: 'PAID',
          amount_due: '12.00',
          amount_paid: '12.00',
          currency: 'USD',
          created_at: TS,
          due_date: '2026-02-01T00:00:00.000Z',
          hosted_invoice_url: 'https://stripe.test/in_123',
          invoice_pdf: null,
        },
      ],
    });
    const invoices = await listBillingInvoices();
    expect(invoices[0]).toMatchObject({
      id: 'in_123',
      status: 'paid',
      amountDue: 1200,
      hostedInvoiceUrl: 'https://stripe.test/in_123',
    });
  });

  it('drops a malformed invoice row instead of blanking the whole history (tolerant)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getMock.mockResolvedValue({
      data: [
        {
          id: 'in_ok',
          invoice_number: 'INV-1',
          status: 'PAID',
          amount_due: '12.00',
          amount_paid: '12.00',
          currency: 'USD',
          created_at: TS,
          due_date: null,
          hosted_invoice_url: null,
          invoice_pdf: null,
        },
        { id: 'in_bad' }, // missing required fields — must NOT throw / blank the list
      ],
    });

    const invoices = await listBillingInvoices();

    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.id).toBe('in_ok');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('follows the invoice cursor across pages (no latest-page ceiling)', async () => {
    const invoice = (id: string) => ({
      id,
      invoice_number: id,
      status: 'PAID',
      amount_due: '1.00',
      amount_paid: '1.00',
      currency: 'USD',
      created_at: TS,
      due_date: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
    });
    getMock
      .mockResolvedValueOnce({
        data: [invoice('in_1')],
        meta: { pagination: { has_more: true, next: 'cur1' } },
      })
      .mockResolvedValueOnce({
        data: [invoice('in_2')],
        meta: { pagination: { has_more: false, next: null } },
      });

    const invoices = await listBillingInvoices();

    // Both pages are accumulated, and the second request carries the cursor.
    expect(invoices.map((i) => i.id)).toEqual(['in_1', 'in_2']);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[1]?.[0]).toContain('after=cur1');
  });

  it('maps payment methods from the wire shape', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          id: 'pm_123',
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2030,
          is_default: true,
        },
      ],
    });
    const methods = await listBillingPaymentMethods();
    expect(methods[0]).toMatchObject({
      id: 'pm_123',
      brand: 'visa',
      last4: '4242',
      isDefault: true,
    });
  });

  it('creates a payment method setup intent', async () => {
    postMock.mockResolvedValue({ data: { client_secret: 'seti_secret' } });
    const setup = await createPaymentMethodSetup();
    expect(postMock).toHaveBeenCalledWith('/api/v1/billing/payment-methods/setup');
    expect(setup.clientSecret).toBe('seti_secret');
  });
});
