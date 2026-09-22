import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { copySensitiveText } from '@/lib/sensitive-clipboard.ts';
import { cn } from '@/lib/utils.ts';
import {
  type ApiKeyWithSecret,
  ASSIGNABLE_ROLE_PERMISSIONS,
} from '@/shared/api/organization-contracts.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Checkbox } from '@/shared/components/ui/checkbox.tsx';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { mapApiError } from '@/shared/errors/errorHandler.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useCreateApiKey } from '@/shared/hooks/useApiKeys/index.ts';
import { Copy, Plus } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';

/**
 * Lifetimes offered for a new key. core-be caps `expires_in_days` at 365, so
 * `NEVER_EXPIRES` omits the field entirely rather than sending a larger number
 * the server would reject.
 */
const NEVER_EXPIRES = 'never';
const EXPIRY_CHOICES = [
  { value: 'thirty', days: 30 },
  { value: 'ninety', days: 90 },
  { value: 'year', days: 365 },
] as const;

type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]['value'] | typeof NEVER_EXPIRES;

const DEFAULT_EXPIRY: ExpiryChoice = 'ninety';

function daysFor(choice: ExpiryChoice): number | null {
  return EXPIRY_CHOICES.find((option) => option.value === choice)?.days ?? null;
}

interface SecretRevealProps {
  secret: string;
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
  onDone: () => void;
}

/**
 * The one and only sight of a new key's secret. core-be stores a hash, so this
 * screen is the whole of the user's chance to keep it — hence the copy action,
 * the explicit acknowledgement, and a Done that stays disabled until then.
 */
function SecretReveal({
  secret,
  acknowledged,
  onAcknowledge,
  onDone,
}: SecretRevealProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;

  async function copy() {
    const copied = await copySensitiveText(secret);
    if (copied) notify.success(t(integrations.apiKeyCopySuccess));
    else notify.error(t(integrations.apiKeyCopyFailed));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(integrations.apiKeySecretTitle)}</DialogTitle>
        <DialogDescription>{t(integrations.apiKeySecretDescription)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <code
          className="bg-muted block rounded-md p-3 font-mono text-xs break-all"
          data-testid="apikey-secret"
        >
          {secret}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          data-testid="apikey-secret-copy"
        >
          <Copy className="me-1.5 size-4" />
          {t(integrations.apiKeyCopy)}
        </Button>
        <div className="flex items-start gap-2">
          <Checkbox
            id="apikey-secret-ack"
            checked={acknowledged}
            onCheckedChange={(value) => onAcknowledge(value === true)}
            data-testid="apikey-secret-ack"
          />
          <Label
            htmlFor="apikey-secret-ack"
            className="text-muted-foreground text-xs font-normal"
          >
            {t(integrations.apiKeySecretAck)}
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!acknowledged}
          onClick={onDone}
          data-testid="apikey-secret-done"
        >
          {t(integrations.apiKeySecretDone)}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Create an organization API key, then reveal its secret exactly once.
 *
 * The integrations panel listed and revoked keys but offered no way to make
 * one, so the section opened on an empty state with no next action — the API
 * key that would fill it could only be created by calling the endpoint by hand.
 *
 * Two phases in one dialog, because they are one task: the form, then the
 * secret. The secret phase cannot be dismissed by Esc or the overlay and its
 * Done button stays disabled until the acknowledgement is ticked — core-be
 * stores only a hash, so a secret dismissed by a stray keypress is gone for
 * good and the key has to be rotated. Same shape as the recovery-code reveal.
 *
 * Scopes are permission codes. core-be refuses any the caller does not hold
 * themselves, so the picker offers the same assignable set the role editor uses
 * and requires at least one — an empty `scopes` array is a 400.
 */
export function ApiKeyCreateDialog() {
  const { t } = useTranslation(SETTINGS_NS);
  const integrations = SETTINGS_KEYS.panels.integrations;
  const create = useCreateApiKey();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiKeyWithSecret | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  function reset() {
    setName('');
    setScopes([]);
    setExpiry(DEFAULT_EXPIRY);
    setError(null);
    setCreated(null);
    setAcknowledged(false);
  }

  function toggleScope(scope: string) {
    setScopes((previous) =>
      previous.includes(scope)
        ? previous.filter((held) => held !== scope)
        : [...previous, scope],
    );
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t(integrations.apiKeyNameRequired));
      return;
    }
    if (scopes.length === 0) {
      setError(t(integrations.apiKeyScopesRequired));
      return;
    }
    setError(null);
    create.mutate(
      { name: trimmed, scopes, expiresInDays: daysFor(expiry) },
      {
        onSuccess: (key) => setCreated(key),
        // The dialog stays open on failure, so the reason belongs IN it —
        // beside the form the server rejected, not only in a toast that fades.
        onError: (cause) => setError(mapApiError(cause)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never while the create is in flight, and never while an unacknowledged
        // secret is on screen: both Esc and the overlay come through here.
        if (create.isPending) return;
        if (created && !acknowledged) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="apikey-create-open"
      >
        <Plus className="me-1.5 size-4" />
        {t(integrations.createApiKey)}
      </Button>

      <DialogContent data-testid="apikey-create-dialog">
        {created ? (
          <SecretReveal
            secret={created.secret}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
            onDone={() => {
              setOpen(false);
              reset();
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t(integrations.createApiKeyTitle)}</DialogTitle>
              <DialogDescription>
                {t(integrations.createApiKeyDescription)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="apikey-name">{t(integrations.apiKeyNameLabel)}</Label>
                <Input
                  id="apikey-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t(integrations.apiKeyNamePlaceholder)}
                  data-testid="apikey-name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apikey-expiry">{t(integrations.apiKeyExpiryLabel)}</Label>
                <Select
                  value={expiry}
                  onValueChange={(value) => setExpiry(value as ExpiryChoice)}
                >
                  <SelectTrigger
                    id="apikey-expiry"
                    className="w-full"
                    data-testid="apikey-expiry"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_CHOICES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(integrations.apiKeyExpiryDays, { count: option.days })}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEVER_EXPIRES}>
                      {t(integrations.apiKeyExpiryNever)}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t(integrations.apiKeyScopesLabel)}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(integrations.apiKeyScopesHint)}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ASSIGNABLE_ROLE_PERMISSIONS.map((scope) => (
                    <div key={scope} className="flex items-center gap-2">
                      <Checkbox
                        id={`apikey-scope-${scope}`}
                        checked={scopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                        data-testid={`apikey-scope-${scope}`}
                      />
                      <Label
                        htmlFor={`apikey-scope-${scope}`}
                        className={cn(
                          'text-muted-foreground font-mono text-xs font-normal',
                        )}
                      >
                        {scope}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <FormError message={error} data-testid="apikey-error" />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                disabled={create.isPending}
                data-testid="apikey-cancel"
              >
                {t(integrations.cancel)}
              </Button>
              <Button
                onClick={submit}
                isLoading={create.isPending}
                data-testid="apikey-create"
              >
                {create.isPending
                  ? t(integrations.creating)
                  : t(integrations.createApiKey)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
