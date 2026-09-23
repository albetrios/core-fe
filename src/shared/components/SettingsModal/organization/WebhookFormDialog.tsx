import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  createWebhookSchema,
  updateWebhookSchema,
  type Webhook,
} from '@/shared/api/webhook-contracts.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
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
import { useWebhookEvents } from '@/shared/hooks/useWebhookEvents/index.ts';
import { useCreateWebhook, useUpdateWebhook } from '@/shared/hooks/useWebhooks/index.ts';

/** Props for {@link WebhookFormDialog}. */
export interface WebhookFormDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog wants to open or close. */
  onOpenChange: (open: boolean) => void;
  /** The webhook being edited, or `null` to create a new one. */
  webhook: Webhook | null;
}

/**
 * Create or edit a webhook — one form for both, because the fields are identical.
 *
 * @remarks
 * The event checklist comes from `GET /notify/webhook-events`, never a client-side list.
 * That is load-bearing rather than tidy: core-be's `CreateWebhookDto` validates `events`
 * only as an array of strings, so a stale client list produces webhooks the API accepts and
 * then never delivers. The checklist is disabled while the catalog is loading and renders a
 * retry when it fails, so a webhook can never be saved against an empty guess.
 *
 * Editing sends only `url` and `events`. Omitting `secret` tells core-be to keep the existing
 * signing key, so an edit never silently breaks a receiver's signature verification.
 *
 * @param props - Open state, the close handler, and the webhook to edit (or `null`).
 *
 * @example
 * <WebhookFormDialog open={open} onOpenChange={setOpen} webhook={editing} />
 */
export function WebhookFormDialog({
  open,
  onOpenChange,
  webhook,
}: WebhookFormDialogProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;
  const catalog = useWebhookEvents();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();

  const isEdit = webhook !== null;
  // Seeded once, at mount. The panel gives this dialog a fresh `key` every time it opens, so
  // editing a second row never shows the first row's values and a cancelled edit never leaks
  // into the next open — without an effect that writes state during render.
  const [url, setUrl] = useState(() => webhook?.url ?? '');
  const [events, setEvents] = useState<string[]>(() =>
    webhook ? [...webhook.events] : [],
  );
  const [error, setError] = useState<string | null>(null);

  const isPending = isEdit ? update.isPending : create.isPending;

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  function close() {
    onOpenChange(false);
  }

  function submit() {
    const schema = isEdit ? updateWebhookSchema : createWebhookSchema;
    const parsed = schema.safeParse({ url, events });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          i18n.t(ERRORS_KEYS.frontend.organization.formCheck, { ns: ERRORS_NS }),
      );
      return;
    }
    setError(null);
    const onError = (cause: unknown) => setError(mapApiError(cause));

    if (isEdit && webhook) {
      update.mutate(
        { id: webhook.id, input: parsed.data },
        { onSuccess: close, onError },
      );
      return;
    }
    create.mutate(parsed.data, { onSuccess: close, onError });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Esc and the overlay are dismissals too — none of them may abandon a write
        // that is already running.
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent data-testid="webhook-form-dialog">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? integrations.editWebhookTitle : integrations.addWebhookTitle)}
          </DialogTitle>
          <DialogDescription>
            {t(
              isEdit
                ? integrations.editWebhookDescription
                : integrations.addWebhookDescription,
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">{t(integrations.payloadUrlLabel)}</Label>
            <Input
              id="webhook-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t(integrations.webhookUrlPlaceholder)}
              data-testid="webhook-url"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t(integrations.eventsLabel)}</Label>
            <WebhookEventChecklist
              catalog={catalog}
              selected={events}
              onToggle={toggleEvent}
            />
          </div>
          {/*
            The same error card the sign-in form and the step-up dialog use — a bare red
            line under the events reads as a caption, not as the thing that went wrong.
          */}
          <FormError message={error} data-testid="webhook-error" />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={close}
            disabled={isPending}
            data-testid="webhook-cancel"
          >
            {t(integrations.cancel)}
          </Button>
          <Button onClick={submit} isLoading={isPending} data-testid="webhook-save">
            {t(submitLabelKey({ isEdit, isPending }))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Which of the four footer labels the submit button shows. */
function submitLabelKey({ isEdit, isPending }: { isEdit: boolean; isPending: boolean }) {
  const integrations = SETTINGS_KEYS.panels.integrations;
  if (isEdit) {
    return isPending ? integrations.savingWebhook : integrations.saveWebhook;
  }
  return isPending ? integrations.creating : integrations.createWebhook;
}

/** The subscribe checklist, with its own loading / error / empty states. */
function WebhookEventChecklist({
  catalog,
  selected,
  onToggle,
}: {
  catalog: ReturnType<typeof useWebhookEvents>;
  selected: string[];
  onToggle: (event: string) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;

  if (catalog.isPending) {
    return <Skeleton className="h-16 w-full" data-testid="webhook-events-loading" />;
  }

  // A failed catalog must not read as "there are no events" — that would invite saving a
  // webhook subscribed to nothing.
  if (catalog.isError) {
    return (
      <div data-testid="webhook-events-error">
        <RetryError
          message={t(integrations.eventsLoadFailed)}
          onRetry={catalog.refetch}
          isRetrying={catalog.isFetching}
        />
      </div>
    );
  }

  if (catalog.rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="webhook-events-empty">
        {t(integrations.eventsEmpty)}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {catalog.rows.map((entry) => (
        <Button
          key={entry.event}
          type="button"
          size="sm"
          variant={selected.includes(entry.event) ? 'default' : 'outline'}
          onClick={() => onToggle(entry.event)}
          title={entry.description}
          aria-pressed={selected.includes(entry.event)}
          data-testid={`webhook-event-${entry.event}`}
        >
          {entry.event}
        </Button>
      ))}
    </div>
  );
}
