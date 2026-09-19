import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import type { CreateWebhookInput, Webhook } from '@/shared/api/webhook-contracts.ts';
import * as api from '@/shared/api/webhooks-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** Org-scoped so two tenants never share a webhooks cache entry. */
export const webhooksQueryKey = (organizationId: string | null) =>
  ['org', organizationId, 'webhooks'] as const;

/** The active org's outbound webhooks. Server state only. */
export function useWebhooks() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: webhooksQueryKey(orgId),
    queryFn: api.listWebhooks,
    // The integrations panel renders a RetryError for exactly this failure.
    notifyOnError: false,
  });
}

/** Create a webhook, then refresh the list. */
export function useCreateWebhook() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: CreateWebhookInput) => api.createWebhook(input),
    invalidateKeys: [webhooksQueryKey(orgId)],
    // The add-webhook dialog renders the mapped error inline, beside the field
    // the server rejected — a toast on top of it would say the same thing twice
    // (SET-26, and rule 12: silence here is chosen, not accidental).
    notifyOnError: false,
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.webhooks.createSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/** Delete a webhook, then refresh the list. */
export function useDeleteWebhook() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    invalidateKeys: [webhooksQueryKey(orgId)],
    optimistic: {
      queryKey: webhooksQueryKey(orgId),
      update: (previous: Webhook[] | undefined, id) =>
        previous?.filter((webhook) => webhook.id !== id),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.webhooks.deleteSuccess, {
      ns: ERRORS_NS,
    }),
  });
}
