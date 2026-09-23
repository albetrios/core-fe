import { useTranslation } from 'react-i18next';

import type { WebhookDeliveryAttempt } from '@/shared/api/webhook-contracts.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { useWebhookDeliveryAttempts } from '@/shared/hooks/useWebhooks/index.ts';
import { Boxes } from '@/shared/icons/index.ts';

/** Props for {@link WebhookDeliveryAttemptsDialog}. */
export interface WebhookDeliveryAttemptsDialogProps {
  /** The webhook whose history to show — `null` closes the dialog. */
  webhookId: string | null;
  /** The webhook's URL, shown so the reader knows which endpoint this is. */
  webhookUrl: string;
  /** Called when the dialog wants to close. */
  onClose: () => void;
}

/**
 * A webhook's recent delivery attempts — the answer to "why did this stop working?".
 *
 * @remarks
 * Read-only and gated on `webhook:read`, which is the permission core-be enforces on
 * `GET /notify/webhooks/:id/delivery-attempts`. Test deliveries are recorded like any other
 * attempt, so firing a test and reopening this list shows the result.
 *
 * The list projection omits a row id (sec-r4-D6 drops `payload` and `response_body`, and
 * sec-T #17 drops the bigserial), so rows are keyed on the fields that do arrive.
 *
 * @param props - The webhook id and URL, plus the close handler.
 */
export function WebhookDeliveryAttemptsDialog({
  webhookId,
  webhookUrl,
  onClose,
}: WebhookDeliveryAttemptsDialogProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;
  const { data, isLoading, isError, isFetching, refetch } =
    useWebhookDeliveryAttempts(webhookId);

  const rows = data?.rows ?? [];

  return (
    <Dialog
      open={webhookId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-testid="webhook-attempts-dialog">
        <DialogHeader>
          <DialogTitle>{t(integrations.deliveryAttemptsTitle)}</DialogTitle>
          <DialogDescription>
            {t(integrations.deliveryAttemptsDescription)}
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground truncate font-mono text-xs">{webhookUrl}</p>

        {isLoading ? (
          <Skeleton className="h-24 w-full" data-testid="webhook-attempts-loading" />
        ) : null}

        {isError ? (
          <div data-testid="webhook-attempts-error">
            <RetryError
              message={t(integrations.deliveryAttemptsLoadFailed)}
              onRetry={() => {
                void refetch();
              }}
              isRetrying={isFetching}
            />
          </div>
        ) : null}

        {!isError && !isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={t(integrations.deliveryAttemptsEmptyTitle)}
            description={t(integrations.deliveryAttemptsEmptyDescription)}
          />
        ) : null}

        {!isError && rows.length > 0 ? (
          <ul
            className="divide-border max-h-80 divide-y overflow-y-auto"
            data-testid="webhook-attempts-list"
          >
            {rows.map((attempt) => (
              <DeliveryAttemptRow key={attemptKey(attempt)} attempt={attempt} />
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="webhook-attempts-close">
            {t(integrations.closeDialog)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A stable list key composed from the fields the list projection actually returns.
 *
 * @remarks
 * The server sends no row id here, and two attempts of the SAME event can share a
 * `created_at` only if they were written in the same millisecond — the attempt counter
 * separates those.
 */
function attemptKey(attempt: WebhookDeliveryAttempt): string {
  return `${attempt.eventType}:${attempt.createdAt}:${attempt.attemptCount}`;
}

/** One attempt: what was sent, how it went, and when. */
function DeliveryAttemptRow({ attempt }: { attempt: WebhookDeliveryAttempt }) {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;
  const { formatDate } = useLocaleFormat();
  const delivered = attempt.status === 'SENT';

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{attempt.eventType}</p>
        <p className="text-muted-foreground text-xs">
          {formatDate(attempt.sentAt ?? attempt.createdAt)}
          {attempt.attemptCount > 1
            ? ` · ${t(integrations.attemptCountLabel, { count: attempt.attemptCount })}`
            : ''}
        </p>
      </div>
      {attempt.httpStatusCode !== null ? (
        <span className="text-muted-foreground font-mono text-xs">
          {attempt.httpStatusCode}
        </span>
      ) : null}
      <Badge variant={delivered ? 'secondary' : 'destructive'}>{attempt.status}</Badge>
    </li>
  );
}
