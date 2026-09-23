import { useQueryClient } from '@tanstack/react-query';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
} from '@/shared/api/webhook-contracts.ts';
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

/** Per-webhook delivery history, nested under the org-scoped webhooks key. */
export const webhookDeliveryAttemptsQueryKey = (
  organizationId: string | null,
  webhookId: string,
) => [...webhooksQueryKey(organizationId), webhookId, 'delivery-attempts'] as const;

/**
 * Change a webhook's URL and subscribed events, then refresh the list.
 *
 * @remarks
 * Mirrors {@link useCreateWebhook}'s silence on error: the edit dialog renders the mapped
 * reason beside the field the server rejected, so a toast would say the same thing twice.
 */
export function useUpdateWebhook() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (vars: { id: string; input: UpdateWebhookInput }) =>
      api.updateWebhook(vars.id, vars.input),
    invalidateKeys: [webhooksQueryKey(orgId)],
    notifyOnError: false,
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.webhooks.updateSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/**
 * Fire a test delivery and hand the outcome back to the caller.
 *
 * @remarks
 * No `successMessage` on purpose. A test that reaches the endpoint and is refused resolves
 * with `success: false`, so a blanket success toast would announce a delivery that did not
 * happen. The row renders the real outcome instead; the toast here is reserved for the
 * mutation genuinely failing (a 403 without `webhook:manage`, or the strict rate limit).
 *
 * core-be records every test in the delivery history, so the attempts list is invalidated
 * too — open it after a test and the attempt is there.
 */
export function useTestWebhook() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  const client = useQueryClient();
  return useAppMutation({
    mutationFn: (id: string) => api.testWebhook(id),
    onSuccess: (_data, id) => {
      void client.invalidateQueries({
        queryKey: webhookDeliveryAttemptsQueryKey(orgId, id),
      });
    },
  });
}

/**
 * One page of a webhook's delivery history.
 *
 * @param webhookId - Public id of the webhook, or `null` when no row is open.
 * @returns The standard query result; disabled until a webhook is chosen.
 */
export function useWebhookDeliveryAttempts(webhookId: string | null) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: webhookDeliveryAttemptsQueryKey(orgId, webhookId ?? 'none'),
    queryFn: () => api.listWebhookDeliveryAttempts(webhookId ?? ''),
    enabled: Boolean(webhookId),
    // The history dialog renders its own RetryError.
    notifyOnError: false,
  });
}
