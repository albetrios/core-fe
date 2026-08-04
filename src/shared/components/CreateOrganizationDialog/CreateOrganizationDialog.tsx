import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { organizationDashboard } from '@/lib/routes/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Plus } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import {
  createOrganization,
  type CreateOrganizationInput,
  createOrganizationSchema,
} from '@/shared/tenancy/my-organizations.ts';
import { hydrateSessionContext } from '@/shared/tenancy/session-context.ts';
import { switchToOrganization } from '@/shared/tenancy/switch.ts';

interface CreateOrganizationDialogProps {
  /** Custom trigger element; defaults to a "New organization" button. Omit when controlled. */
  trigger?: ReactNode;
  /** Controlled open state. When provided, the dialog is controlled by the parent. */
  open?: boolean;
  /** Controlled open-change handler. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Dialog to create a new organization from anywhere in the app shell. On
 * success it refreshes the organization list and navigates to the new
 * organization's dashboard — the `$organizationSlug` guard syncs context,
 * persists the choice, and loads permissions. Works uncontrolled (with a
 * trigger) or controlled (via `open` / `onOpenChange`).
 */
export function CreateOrganizationDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value);
    else setUncontrolledOpen(value);
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', slug: '' },
  });

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      const requestedSlug = data.slug?.trim();
      const org = await createOrganization({
        name: data.name,
        slug: requestedSlug === '' ? undefined : requestedSlug,
      });

      await hydrateSessionContext();
      await switchToOrganization(org.id);
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });

      notify.success(
        i18n.t(ERRORS_KEYS.frontend.organization.createSuccess, {
          ns: ERRORS_NS,
          name: org.name,
        }),
      );
      reset();
      setOpen(false);
      await navigate({ ...organizationDashboard(org.slug), replace: true });
    } catch {
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.organization.formCheck, { ns: ERRORS_NS }),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" data-testid="create-organization-open">
              <Plus className="me-2 h-4 w-4" />
              New organization
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Spin up a new workspace. You can invite teammates afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="create-organization-dialog-form"
        >
          <div className="space-y-2">
            <Label htmlFor="new-org-name">Organization name</Label>
            <Input
              id="new-org-name"
              autoComplete="organization"
              placeholder="Acme Inc."
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'new-org-name-error' : undefined}
              data-testid="create-organization-dialog-name"
              {...register('name')}
            />
            {errors.name && (
              <p
                id="new-org-name-error"
                className="text-destructive text-xs"
                role="alert"
              >
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-org-slug">Workspace URL (optional)</Label>
            <Input
              id="new-org-slug"
              placeholder="acme"
              data-testid="create-organization-dialog-slug"
              {...register('slug')}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="create-organization-dialog-submit"
            >
              {isSubmitting ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
