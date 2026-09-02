import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { closeControlClassName } from '@/lib/icon-surface.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Plus, X } from '@/shared/icons/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import {
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from '../../onboarding.constants.ts';

const inviteEmailSchema = z.string().trim().pipe(z.email());

/** Collects optional teammate emails; the final step sends the invitations. */
export function InviteStep() {
  const { t } = useTranslation(ONBOARDING_NS);
  /*
   * Field-level selectors (ONB-13). `useOnboardingStore()` with no selector
   * subscribes to the whole store, and `patch` replaces the entire `data`
   * object, so this component re-rendered on every keystroke anywhere in the
   * wizard. `patch` is a stable store closure.
   */
  const invites = useOnboardingStore((s) => s.data.invites);
  const patch = useOnboardingStore((s) => s.patch);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const parsed = inviteEmailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t(ONBOARDING_KEYS.invite.invalidEmail));
      return;
    }
    const trimmed = parsed.data.toLowerCase();
    if (invites.includes(trimmed)) {
      setError(t(ONBOARDING_KEYS.invite.duplicateEmail));
      return;
    }
    patch({ invites: [...invites, trimmed] });
    setEmail('');
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="ob-invite">{t(ONBOARDING_KEYS.invite.emailLabel)}</Label>
          <Input
            id="ob-invite"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'onboarding-invite-error' : undefined}
            placeholder={t(ONBOARDING_KEYS.invite.emailPlaceholder)}
            data-testid={ONBOARDING_TEST_IDS.inviteEmail}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={add}
          data-testid={ONBOARDING_TEST_IDS.inviteAdd}
        >
          <Plus className="me-1 h-4 w-4" />
          {t(ONBOARDING_KEYS.invite.addButton)}
        </Button>
      </div>
      {error && (
        <p
          id="onboarding-invite-error"
          className="text-destructive text-xs"
          role="alert"
          data-testid={ONBOARDING_TEST_IDS.inviteError}
        >
          {error}
        </p>
      )}
      {invites.length > 0 && (
        <ul className="space-y-2" data-testid={ONBOARDING_TEST_IDS.inviteList}>
          {invites.map((invite) => (
            <li
              key={invite}
              className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2 text-sm"
            >
              {invite}
              <button
                type="button"
                data-slot="button"
                aria-label={t(ONBOARDING_KEYS.invite.removeAriaLabel, { email: invite })}
                onClick={() => patch({ invites: invites.filter((i) => i !== invite) })}
                className={closeControlClassName}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
