import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { isListStale, listRefreshClass } from '@/lib/list-refresh.ts';
import { cn } from '@/lib/utils.ts';
import type { ApiKey } from '@/shared/api/organization-contracts.ts';
import {
  createWebhookSchema,
  type Webhook,
  WEBHOOK_EVENTS,
} from '@/shared/api/webhook-contracts.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { FormattedDate } from '@/shared/components/FormattedDate/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card } from '@/shared/components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { mapApiError } from '@/shared/errors/errorHandler.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useApiKeys, useRevokeApiKey } from '@/shared/hooks/useApiKeys/index.ts';
import { useCan } from '@/shared/hooks/useCan/index.ts';
import { useDebouncedSearch } from '@/shared/hooks/useDebouncedValue/index.ts';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useWebhooks,
} from '@/shared/hooks/useWebhooks/index.ts';
import { Boxes, Plus, Trash2 } from '@/shared/icons/index.ts';

import {
  DEFAULT_ORG_LIST_SORT,
  type OrgListSortPreset,
  orgListSortToParams,
} from './org-list-sort.ts';
import { OrgListControls } from './OrgListControls.tsx';

function useCanManageIntegrations(): boolean {
  return useCan({ permission: 'role:manage', teamOrganizationOnly: true });
}

/** API keys — windowed list (masked) + search + cap-gated revoke. */
function ApiKeysSection() {
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OrgListSortPreset>(DEFAULT_ORG_LIST_SORT);
  const { debounced: debouncedSearch, isPending: isSearchPending } =
    useDebouncedSearch(search);
  const sortParams = orgListSortToParams(sort);
  const keys = useApiKeys({
    q: debouncedSearch || undefined,
    ...sortParams,
  });
  const canManage = useCanManageIntegrations();
  const revokeKey = useRevokeApiKey();
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);
  const isSearching = debouncedSearch.length > 0;
  const isStale = isListStale(keys.isRefreshing, isSearchPending);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">API keys</h3>
      <OrgListControls
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        searchPlaceholder={tSettings(SETTINGS_KEYS.panels.integrations.searchPlaceholder)}
        searchTestId="apikeys-search"
        sortTestId="apikeys-sort"
      />
      {keys.isPending ? (
        <div className="space-y-2" data-testid="apikeys-loading">
          {['a', 'b'].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      ) : null}
      {keys.isError ? (
        // The webhooks list beside this one always offered a retry; the API-key
        // list answered the same failure with a dead sentence (SET-20).
        <div data-testid="apikeys-error">
          <RetryError
            message="Couldn't load API keys. Please try again."
            onRetry={keys.refetch}
            isRetrying={keys.isFetching}
          />
        </div>
      ) : null}
      {!(keys.isPending || keys.isError) && keys.rows.length === 0 ? (
        <EmptyState
          icon={<Boxes />}
          title={isSearching ? 'No matching API keys' : 'No API keys'}
          description={
            isSearching
              ? 'No API keys match your search.'
              : 'API keys let external services talk to your organization.'
          }
        />
      ) : null}
      {!keys.isError && keys.rows.length > 0 ? (
        <Card
          className={cn('gap-0 overflow-hidden py-0', listRefreshClass(isStale))}
          aria-busy={isStale}
        >
          <ul className="divide-border divide-y" data-testid="apikeys-list">
            {keys.rows.map((key) => (
              <li key={key.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {key.prefix}•••••••• · added <FormattedDate value={key.createdAt} />
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${key.name}`}
                    onClick={() => setToRevoke(key)}
                    data-testid={`apikey-revoke-${key.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {!keys.isError && keys.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={keys.fetchNextPage}
            disabled={keys.isFetchingNextPage}
            data-testid="apikeys-load-more"
          >
            Load more
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null);
        }}
        title={`Revoke ${toRevoke?.name ?? 'API key'}?`}
        description="Any service using this key will immediately lose access. This can't be undone."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (toRevoke) await revokeKey.mutateAsync(toRevoke.id);
        }}
      />
    </div>
  );
}

/** Webhooks — list + cap-gated create (url + events) + delete. */
function WebhooksSection() {
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const { data: hooks, isLoading, isError, isFetching, refetch } = useWebhooks();
  const canManage = useCanManageIntegrations();
  const create = useCreateWebhook();
  const remove = useDeleteWebhook();
  const [toDelete, setToDelete] = useState<Webhook | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  function submit() {
    const parsed = createWebhookSchema.safeParse({ url, events });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          i18n.t(ERRORS_KEYS.frontend.organization.formCheck, { ns: ERRORS_NS }),
      );
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: () => {
        setAddOpen(false);
        setUrl('');
        setEvents([]);
      },
      // The dialog stays open on failure, so the reason belongs IN it — beside
      // the URL the server rejected, not only in a toast the user has to catch
      // before it fades (SET-26).
      onError: (cause) => setError(mapApiError(cause)),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Webhooks</h3>
        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            data-testid="webhook-add"
          >
            <Plus className="me-1.5 size-4" />
            Add webhook
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-14 w-full" data-testid="webhooks-loading" />
      ) : null}

      {isError ? (
        <div data-testid="webhooks-error">
          <RetryError
            message="Couldn't load webhooks. Please try again."
            onRetry={() => {
              void refetch();
            }}
            isRetrying={isFetching}
          />
        </div>
      ) : null}

      {!isError && hooks && hooks.length === 0 ? (
        <EmptyState
          icon={<Boxes />}
          title="No webhooks"
          description="Send organization events to an external URL."
        />
      ) : null}

      {!isError && hooks && hooks.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-border divide-y" data-testid="webhooks-list">
            {hooks.map((hook) => (
              <li key={hook.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{hook.url}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {hook.events.join(', ')}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete webhook ${hook.url}`}
                    onClick={() => setToDelete(hook)}
                    data-testid={`webhook-delete-${hook.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          // Esc and the overlay are dismissals too — none of them may abandon a
          // create that is already running.
          if (!create.isPending) setAddOpen(open);
        }}
      >
        <DialogContent data-testid="webhook-add-dialog">
          <DialogHeader>
            <DialogTitle>Add a webhook</DialogTitle>
            <DialogDescription>
              We&apos;ll POST the selected events to this URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">Payload URL</Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={tSettings(
                  SETTINGS_KEYS.panels.integrations.webhookUrlPlaceholder,
                )}
                data-testid="webhook-url"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <Button
                    key={event}
                    type="button"
                    size="sm"
                    variant={events.includes(event) ? 'default' : 'outline'}
                    onClick={() => toggleEvent(event)}
                    data-testid={`webhook-event-${event}`}
                  >
                    {event}
                  </Button>
                ))}
              </div>
            </div>
            {/*
              The same error card the sign-in form and the step-up dialog use.
              A bare red line under the events read as a caption; this reads as
              the thing that went wrong (SET-26).
            */}
            <FormError message={error} data-testid="webhook-error" />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAddOpen(false)}
              // Cancel used to stay live through the request: pressing it left
              // the create in flight with nothing on screen to report it.
              disabled={create.isPending}
              data-testid="webhook-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              isLoading={create.isPending}
              data-testid="webhook-create"
            >
              {create.isPending ? 'Creating…' : 'Create webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Delete this webhook?"
        description="Events will stop being delivered to this URL. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (toDelete) await remove.mutateAsync(toDelete.id);
        }}
      />
    </div>
  );
}

/**
 * Integrations panel — API keys (revoke) + outbound webhooks (create/delete),
 * both gated on the role:manage permission (team orgs only). API-key creation
 * with one-time-secret reveal remains a follow-up.
 */
export function OrganizationIntegrationsPanel() {
  // Webhooks are only shown when the caller can actually read them; API keys are
  // the always-available part of this section (see settings-permissions.ts).
  const canReadWebhooks = useCan({
    permission: 'webhook:read',
    teamOrganizationOnly: true,
  });
  return (
    <section className="space-y-8" data-testid="settings-organization-integrations">
      <SectionHeader title="Integrations" description="API keys and webhooks." />
      <ApiKeysSection />
      {canReadWebhooks ? <WebhooksSection /> : null}
    </section>
  );
}
