import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { translateFormMessage } from '@/lib/i18n/translate-form-message.ts';
import {
  ASSIGNABLE_ROLE_PERMISSIONS,
  type RoleInput,
  roleInputSchema,
  type RoleSummary,
} from '@/shared/api/organization-contracts.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Checkbox } from '@/shared/components/ui/checkbox.tsx';
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
import { Textarea } from '@/shared/components/ui/textarea.tsx';
import {
  useCreateRole,
  useRolePermissions,
  useUpdateRole,
} from '@/shared/hooks/useRoles/index.ts';
import { Plus } from '@/shared/icons/index.ts';

const EMPTY_ROLE: RoleInput = { name: '', description: '', permissions: [] };

/** Selected permission codes with `perm` added. */
function withPermission(current: string[], perm: string): string[] {
  return current.includes(perm) ? current : [...current, perm];
}

/** Selected permission codes with `perm` removed. */
function withoutPermission(current: string[], perm: string): string[] {
  return current.filter((p) => p !== perm);
}

/** Submit-button label for the create-vs-edit × idle-vs-submitting matrix. */
function roleSubmitLabel(isEdit: boolean, isSubmitting: boolean): string {
  if (isSubmitting) return isEdit ? 'Saving…' : 'Creating…';
  return isEdit ? 'Save changes' : 'Create role';
}

interface CreateRoleDialogProps {
  /** When provided, the dialog edits this role (controlled) instead of creating. */
  role?: RoleSummary;
  /** Controlled open state — required in edit mode (the parent owns the trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Dialog + form for creating OR editing a custom role (name, description, and a
 * checklist of assignable permissions). In **create** mode it renders its own
 * "New role" trigger (a fresh org has only the system Owner role, so this is the
 * entry point for the Admin/Member/Viewer roles that make inviting possible). In
 * **edit** mode (`role` given) it is controlled by the parent — no trigger — and
 * saves via `useUpdateRole`. Gated by the caller (render only for `role:manage`).
 */
export function CreateRoleDialog({
  role,
  open: controlledOpen,
  onOpenChange,
}: CreateRoleDialogProps = {}) {
  const isEdit = role !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  // The roles list omits permissions, so an edit must fetch the role's real
  // grants to pre-fill — otherwise saving would wipe them.
  const rolePermissions = useRolePermissions(role?.id);

  const initialValues: RoleInput = role
    ? { name: role.name, description: role.description, permissions: role.permissions }
    : EMPTY_ROLE;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleInputSchema),
    defaultValues: initialValues,
  });

  // Pre-fill the permission checklist once the role's real grants load.
  useEffect(() => {
    if (role && rolePermissions.data) {
      reset({
        name: role.name,
        description: role.description,
        permissions: rolePermissions.data,
      });
    }
  }, [role, rolePermissions.data, reset]);

  // In edit mode, don't allow a save before the real permissions load.
  const permissionsPending = isEdit && !rolePermissions.isSuccess;

  const onSubmit = async (data: RoleInput) => {
    if (isEdit && role) {
      await updateRole.mutateAsync({ id: role.id, ...data });
    } else {
      await createRole.mutateAsync(data);
    }
    reset(isEdit ? data : EMPTY_ROLE);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isEdit ? null : (
        <DialogTrigger asChild>
          <Button size="sm" data-testid="role-create-open">
            <Plus className="me-2 h-4 w-4" />
            New role
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit role' : 'Create a role'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the name, description, and permissions.'
              : 'Define a permission set you can assign to members.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="role-create-form"
        >
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              placeholder="e.g. Member"
              aria-invalid={!!errors.name}
              data-testid="role-create-name"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-destructive text-xs" role="alert">
                {translateFormMessage(errors.name.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              placeholder="What can this role do?"
              aria-invalid={!!errors.description}
              data-testid="role-create-description"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-destructive text-xs" role="alert">
                {translateFormMessage(errors.description.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <Controller
              control={control}
              name="permissions"
              render={({ field }) => (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ASSIGNABLE_ROLE_PERMISSIONS.map((perm) => (
                    <div key={perm} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-perm-${perm}`}
                        checked={field.value.includes(perm)}
                        onCheckedChange={(value) =>
                          field.onChange(
                            value === true
                              ? withPermission(field.value, perm)
                              : withoutPermission(field.value, perm),
                          )
                        }
                        data-testid={`role-perm-${perm}`}
                      />
                      <Label
                        htmlFor={`role-perm-${perm}`}
                        className="text-muted-foreground font-mono text-xs font-normal"
                      >
                        {perm}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            />
            {errors.permissions && (
              <p className="text-destructive text-xs" role="alert">
                {translateFormMessage(errors.permissions.message)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting || permissionsPending}
              data-testid="role-create-submit"
            >
              {roleSubmitLabel(isEdit, isSubmitting)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
