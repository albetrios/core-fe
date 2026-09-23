import type { WebhookEventCatalogEntry } from '@/shared/api/webhook-contracts.ts';
import { listWebhookEventCatalog } from '@/shared/api/webhooks-api.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

/**
 * Query key for the dispatchable-event catalog.
 *
 * @remarks
 * Deliberately NOT org-scoped. The catalog is platform reference data — core-be serves the
 * same list to every tenant from a static array — so scoping it per organization would
 * refetch identical rows on every workspace switch.
 */
export const webhookEventsQueryKey = () => ['webhook-events'] as const;

/** What the event checklist needs: the rows to render plus the query's own state. */
export interface WebhookEventCatalog {
  rows: WebhookEventCatalogEntry[];
  isPending: boolean;
  isError: boolean;
  /** Whether a refetch is in flight — drives the retry button's spinner. */
  isFetching: boolean;
  /** Re-run the catalog query after a failure. */
  refetch: () => void;
}

/**
 * The event types a webhook may subscribe to, read from core-be rather than hardcoded.
 *
 * @remarks
 * The list this replaces (`member.created`, `member.removed`, `role.changed`,
 * `billing.updated`) shared **no** entries with the catalog core-be dispatches, and
 * `CreateWebhookDto` validates `events` only as an array of strings — never against the
 * catalog. So every webhook created through the old checklist was accepted by the API and
 * then never fired. Reading the catalog is what makes the subscription real.
 *
 * Cached with a long `staleTime` like the permission catalog: it is reference data that
 * changes only when the backend ships new event types.
 *
 * @returns The catalog rows plus pending/error state for the checklist's own UI.
 */
export function useWebhookEvents(): WebhookEventCatalog {
  const query = useAppQuery({
    queryKey: webhookEventsQueryKey(),
    queryFn: listWebhookEventCatalog,
    staleTime: 60_000,
    // The webhook form renders its own inline error beside the checklist.
    notifyOnError: false,
  });

  return {
    rows: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}
