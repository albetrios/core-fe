import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { translateFormMessage } from '@/lib/i18n/translate-form-message.ts';
import type { RoleSummary } from '@/shared/api/organization-contracts.ts';
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
  DialogTrigger,
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
import { useInviteMember } from '@/shared/hooks/useInvitations/index.ts';
import { useRoles } from '@/shared/hooks/useRoles/index.ts';
import { UserPlus } from '@/shared/icons/index.ts';

const inviteSchema = z.object({
  email: z.email('Enter a valid email address'),
  roleId: z.string().min(1, 'Select a role'),
});

type InviteInput = z.infer<typeof inviteSchema>;

/** The Owner role is never an invite target — an org has exactly one owner. */
function isInvitableRole(role: RoleSummary): boolean {
  return role.name.toLowerCase() !== 'owner';
}

/**
 * Dialog + form for inviting a new member to the active organization. Roles come
 * from the org's real role set (`role_id` is required by core-be's add-member
 * endpoint), so a freshly-created org — which only has the system Owner role —
 * shows a "create a role first" hint instead of an unusable form. Gated by the
 * caller (render only when the user holds `invitation:manage`).
 */
export function InviteMemberDialog() {
  const { t } = useTranslation(SETTINGS_NS);
  const [open, setOpen] = useState(false);
  const invite = useInviteMember();
  const roles = useRoles();
  const invitableRoles = (roles.rows ?? []).filter(isInvitableRole);
  const hasRoles = invitableRoles.length > 0;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', roleId: '' },
  });

  // Default the role once the list loads (react-hook-form keeps the field
  // otherwise empty, which would fail validation on an all-valid-looking form).
  useEffect(() => {
    if (hasRoles) setValue('roleId', invitableRoles[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key off the first id, not the array identity
  }, [invitableRoles[0]?.id, hasRoles, setValue]);

  const onSubmit = async (data: InviteInput) => {
    await invite.mutateAsync(data);
    reset({ email: '', roleId: invitableRoles[0]?.id ?? '' });
    setOpen(false);
  };

  let body: ReactNode;
  if (roles.isPending) {
    body = (
      <p className="text-muted-foreground text-sm" data-testid="invite-member-loading">
        Loading roles…
      </p>
    );
  } else if (hasRoles) {
    body = (
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        data-testid="invite-member-form"
      >
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder={t(SETTINGS_KEYS.panels.members.emailPlaceholder)}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'invite-email-error' : undefined}
            data-testid="invite-member-email"
            {...register('email')}
          />
          {errors.email && (
            <p id="invite-email-error" className="text-destructive text-xs" role="alert">
              {translateFormMessage(errors.email.message)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Controller
            control={control}
            name="roleId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="invite-role"
                  className="w-full"
                  data-testid="invite-member-role"
                >
                  <SelectValue
                    placeholder={t(SETTINGS_KEYS.panels.members.rolePlaceholder)}
                  />
                </SelectTrigger>
                <SelectContent>
                  {invitableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <DialogFooter>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="invite-member-submit"
          >
            {isSubmitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </form>
    );
  } else {
    body = (
      <div className="space-y-3" data-testid="invite-member-no-roles">
        <p className="text-muted-foreground text-sm">
          You need a role to assign before inviting anyone. Create one in the{' '}
          <span className="text-foreground font-medium">Roles</span> tab, then come back
          here.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="invite-member-open">
          <UserPlus className="me-2 h-4 w-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join this organization.
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
