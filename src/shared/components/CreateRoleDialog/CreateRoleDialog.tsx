import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { OrganizationPermission } from '@/core/types/permissions.ts';
import { translateFormMessage } from '@/lib/i18n/translate-form-message.ts';
import {
  type RoleInput,
  roleInputSchema,
  type RoleSummary,
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
  DialogTrigger,
} from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { Textarea } from '@/shared/components/ui/textarea.tsx';
import {
  type AssignablePermissions,
  useAssignablePermissions,
} from '@/shared/hooks/useAssignablePermissions/index.ts';
import {
  useCreateRole,
  useRolePermissions,
  useUpdateRole,
} from '@/shared/hooks/useRoles/index.ts';
import { Plus } from '@/shared/icons/index.ts';

const EMPTY_ROLE: RoleInput = { name: '', description: '', permissions: [] };

/** Selected permission codes with `perm` added. */
function withPermission(
  current: OrganizationPermission[],
  perm: OrganizationPermission,
): OrganizationPermission[] {
  return current.includes(perm) ? current : [...current, perm];
}

/** Selected permission codes with `perm` removed. */
function withoutPermission(
  current: OrganizationPermission[],
  perm: OrganizationPermission,
): OrganizationPermission[] {
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
 * The permission checkboxes, plus the catalog's own loading and error states.
 *
 * Split out of {@link CreateRoleDialog} so those two extra states do not push the dialog past
 * the complexity ceiling — and because "render the grants this caller may delegate" is a
 * coherent unit on its own.
 */
function PermissionChecklist({
  assignable,
  selected,
  onToggle,
}: {
  assignable: AssignablePermissions;
  selected: OrganizationPermission[];
  onToggle: (next: OrganizationPermission[]) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);

  if (assignable.isPending) {
    return (
      <p className="text-muted-foreground text-xs">
        {t(SETTINGS_KEYS.panels.roles.permissionsLoading)}
      </p>
    );
  }
  if (assignable.isError) {
    return (
      <p className="text-destructive text-xs" role="alert">
        {t(SETTINGS_KEYS.panels.roles.permissionsLoadFailed)}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {assignable.rows.map((entry) => (
        <div key={entry.code} className="flex items-center gap-2">
          <Checkbox
            id={`role-perm-${entry.code}`}
            checked={selected.includes(entry.code)}
            onCheckedChange={(value) =>
              onToggle(
                value === true
                  ? withPermission(selected, entry.code)
                  : withoutPermission(selected, entry.code),
              )
            }
            data-testid={`role-perm-${entry.code}`}
          />
          <Label
            htmlFor={`role-perm-${entry.code}`}
            className="text-muted-foreground text-xs font-normal"
            title={entry.code}
          >
            {entry.name}
          </Label>
        </div>
      ))}
    </div>
  );
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
  const { t } = useTranslation(SETTINGS_NS);
  const isEdit = role !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  // The roles list omits permissions, so an edit must fetch the role's real
  // grants to pre-fill — otherwise saving would wipe them.
  const rolePermissions = useRolePermissions(role?.id);
  // The catalog core-be enforces, narrowed to what this caller may actually grant —
  // `assertCallerCanGrantPermissionCodes` refuses anything else.
  const assignable = useAssignablePermissions();

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

  /**
   * Which role this form has already been pre-filled for. The permissions query
   * key is a DESCENDANT of the roles prefix, so every other role mutation
   * invalidates it: keying the pre-fill on `rolePermissions.data` re-ran `reset`
   * on each refetch and wiped whatever the user had typed or ticked (SET-10).
   * Pre-fill once per role, on the success transition, and never again.
   */
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!role) {
      hydratedFor.current = null;
      return;
    }
    if (!rolePermissions.isSuccess || hydratedFor.current === role.id) return;
    hydratedFor.current = role.id;
    reset({
      name: role.name,
      description: role.description,
      permissions: rolePermissions.data,
    });
  }, [role, rolePermissions.isSuccess, rolePermissions.data, reset]);

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
          {permissionsPending ? (
            // The checklist is a statement about what this role can do. Rendered
            // from the list row — which carries no permissions — it opens with
            // every box unchecked and then visibly ticks itself.
            <div className="space-y-3" data-testid="role-edit-loading">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  placeholder={t(SETTINGS_KEYS.panels.roles.namePlaceholder)}
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
                  placeholder={t(SETTINGS_KEYS.panels.roles.descriptionPlaceholder)}
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
                    <PermissionChecklist
                      assignable={assignable}
                      selected={field.value}
                      onToggle={field.onChange}
                    />
                  )}
                />
                {errors.permissions && (
                  <p className="text-destructive text-xs" role="alert">
                    {translateFormMessage(errors.permissions.message)}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Always rendered — the dialog keeps its action, disabled, rather
              than losing it while the grants load. */}
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
