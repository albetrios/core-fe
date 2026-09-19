import * as billingApi from '@/shared/api/billing-api.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

export function useBillingPaymentMethods(enabled = true) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: billingQueryKeys.paymentMethods(orgId),
    queryFn: billingApi.listBillingPaymentMethods,
    enabled,
    // The card renders a QueryBoundary for exactly this failure.
    notifyOnError: false,
  });
}
