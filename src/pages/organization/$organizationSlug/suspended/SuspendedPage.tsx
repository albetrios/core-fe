import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { organizationPicker } from '@/lib/routes/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { ShieldAlert } from '@/shared/icons/index.ts';

/**
 * Blocked state for a suspended / lapsed organization. Reading data is
 * blocked at the guard layer; the user can switch organization or contact
 * an administrator about billing.
 */
export function SuspendedPage() {
  const { t } = useTranslation(ERRORS_NS);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
      data-testid="suspended-page"
    >
      <div
        data-slot="pill"
        className="bg-destructive/10 text-destructive flex h-12 w-12 items-center justify-center rounded-full"
      >
        <ShieldAlert className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t(ERRORS_KEYS.suspended.title)}</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          {t(ERRORS_KEYS.suspended.message)}
        </p>
      </div>
      <Button asChild variant="outline" data-testid="suspended-switch-organization">
        <Link {...organizationPicker()}>
          {t(ERRORS_KEYS.suspended.switchOrganization)}
        </Link>
      </Button>
    </div>
  );
}
