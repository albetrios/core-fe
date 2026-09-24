import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
import { mapApiError } from '@/shared/errors/errorHandler.ts';
import { Plus } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { notify } from '@/shared/notify/index.ts';
import { useWorkspaceSwitchStore } from '@/shared/store/useWorkspaceSwitchStore/index.ts';
import { myOrganizationsQueryKey } from '@/shared/tenancy/my-organization-summaries.ts';
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
  const { t: tLayout } = useTranslation(LAYOUT_NS);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value);
    else setUncontrolledOpen(value);
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const beginSwitch = useWorkspaceSwitchStore((state) => state.beginSwitch);
  const endSwitch = useWorkspaceSwitchStore((state) => state.endSwitch);
  // Synchronous twin of react-hook-form's `isSubmitting` — see onSubmit.
  const submittingRef = useRef(false);

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
    // `isSubmitting` only disables the button after React re-renders, so the
    // submit stays live for the frame after the first click — and this handler
    // CREATES AN ORGANIZATION. The ref flips synchronously, so a double-click
    // (or a second Enter) is dropped before a second one can be provisioned.
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const requestedSlug = data.slug?.trim();
      let org: Awaited<ReturnType<typeof createOrganization>>;
      try {
        org = await createOrganization({
          name: data.name,
          slug: requestedSlug === '' ? undefined : requestedSlug,
        });
      } catch (error) {
        // ONLY the create is a form-level failure — a taken slug, a rejected
        // name. Surface what actually went wrong instead of a generic "check
        // the form", and keep the user here so they can correct it.
        notify.error(mapApiError(error));
        return;
      }

      // The organization EXISTS from here on. Nothing below may route the user
      // back to this form: they would "fix" a form that was never wrong and
      // submit again, creating a SECOND organization. Close first, then run the
      // follow-up steps — each failure is recoverable and reported as itself.
      reset();
      setOpen(false);
      notify.success(
        i18n.t(ERRORS_KEYS.frontend.organization.createSuccess, {
          ns: ERRORS_NS,
          name: org.name,
        }),
      );

      try {
        /*
         * Four awaits — a context re-read, a token re-mint, a cache
         * invalidation and a navigation — with the dialog already closed. The
         * screen underneath for that whole stretch is the workspace the user is
         * LEAVING, with its own name still ticked in the switcher, so creating
         * an organization looked like it had silently failed and then
         * auto-switched on its own some seconds later (QA-V3-2).
         *
         * The same overlay the switcher raises for the same hop: it names the
         * destination, so what is on screen and what is happening finally agree.
         * Cleared in `finally`, on both outcomes.
         */
        beginSwitch(org.name);
        await hydrateSessionContext();
        await switchToOrganization(org.id);
        await queryClient.invalidateQueries({ queryKey: myOrganizationsQueryKey });
        // PUSH, never replace. This dialog is a plain modal opened from inside an
        // organization (the switcher) as well as from the picker; replacing
        // overwrote the organization the user was in, so Back from the new one
        // skipped straight past it. Switching through the switcher or the command
        // palette already pushes — creating is a switch too.
        await navigate(organizationDashboard(org.slug));
      } catch {
        // Created, but the hop into it failed. Say exactly that — the new
        // organization is already in the switcher, so the user is one click
        // away rather than one duplicate away.
        notify.warning(
          i18n.t(ERRORS_KEYS.frontend.organization.createdSwitchFailed, {
            ns: ERRORS_NS,
            name: org.name,
          }),
        );
      } finally {
        endSwitch();
      }
    } finally {
      submittingRef.current = false;
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
          <DialogTitle>{tLayout(LAYOUT_KEYS.app.orgCreate.title)}</DialogTitle>
          <DialogDescription>
            Spin up a new workspace. You can invite teammates afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          // Bound at submit time, not during render: `onSubmit` reads
          // `submittingRef`, and handing a ref-reading callback to
          // `handleSubmit()` during render is what react-hooks/refs forbids.
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="space-y-4"
          data-testid="create-organization-dialog-form"
        >
          <div className="space-y-2">
            <Label htmlFor="new-org-name">
              {tLayout(LAYOUT_KEYS.app.orgCreate.nameLabel)}
            </Label>
            <Input
              id="new-org-name"
              autoComplete="organization"
              placeholder={tLayout(LAYOUT_KEYS.app.orgCreate.namePlaceholder)}
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
                data-testid="create-organization-dialog-name-error"
              >
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-org-slug">
              {tLayout(LAYOUT_KEYS.app.orgCreate.slugLabel)}
            </Label>
            {/*
              Optional, but not unvalidated: the schema rejects anything outside
              `[a-z0-9-]`. This field used to render no error at all — no
              `aria-invalid`, no message — so a user who typed their
              organization's NAME here (the natural thing to do under a label
              reading "Workspace URL") pressed Create and watched nothing
              happen: the dialog stayed open, the page did not move, and not one
              `role="alert"` existed anywhere on it. The name field beside it has
              always said why it refused; this one now does too.
            */}
            <Input
              id="new-org-slug"
              placeholder={tLayout(LAYOUT_KEYS.app.orgCreate.slugPlaceholder)}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'new-org-slug-error' : undefined}
              data-testid="create-organization-dialog-slug"
              {...register('slug')}
            />
            {errors.slug && (
              <p
                id="new-org-slug-error"
                className="text-destructive text-xs"
                role="alert"
                data-testid="create-organization-dialog-slug-error"
              >
                {errors.slug.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="create-organization-dialog-submit"
            >
              {isSubmitting
                ? tLayout(LAYOUT_KEYS.app.orgCreate.submitting)
                : tLayout(LAYOUT_KEYS.app.orgCreate.submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
