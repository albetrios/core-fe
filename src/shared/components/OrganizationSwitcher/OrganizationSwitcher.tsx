import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { iconOnSidebarSurface } from '@/lib/icon-surface.ts';
import { organizationDashboard } from '@/lib/routes/index.ts';
import { cn } from '@/lib/utils.ts';
import { CreateOrganizationDialog } from '@/shared/components/CreateOrganizationDialog/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { Check, ChevronsUpDown, Plus } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import {
  resolveDeploymentMode,
  shouldAllowCreateTeam,
  shouldShowOrganizationSwitcher,
} from '@/shared/tenancy/deployment-mode.ts';
import type { OrganizationSummary } from '@/shared/tenancy/me-context.ts';
import { switchToPersonal } from '@/shared/tenancy/switch.ts';

interface OrganizationSwitcherProps {
  /** Extra classes for the trigger button (e.g. `flex-1` inside the sidebar). */
  className?: string;
  /** Dropdown alignment relative to the trigger. */
  align?: 'start' | 'end';
  /** Tinted shell the trigger sits on — adjusts trigger contrast. */
  surface?: 'default' | 'sidebar';
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

/**
 * Active-organization switcher (dual-URL aware, FE-24). Lists the user's
 * organizations from `me/context`, split into **Personal** and **Organizations**
 * sections. Switching to a **team** org navigates to its
 * `/organization/$organizationSlug/dashboard` (the org guard performs the
 * switch-on-navigation); switching to the **personal** org has no URL to drive
 * it, so it calls `switchToPersonal()` and lands on the root `/dashboard`.
 */
export function OrganizationSwitcher({
  className,
  align = 'start',
  surface = 'default',
}: OrganizationSwitcherProps) {
  const { t } = useTranslation(LAYOUT_NS);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const { data: ctx, isLoading } = useMeContext();
  const deploymentFlags = useDeploymentFlags();

  if (!shouldShowOrganizationSwitcher(deploymentFlags)) {
    return null;
  }

  const mode = resolveDeploymentMode(deploymentFlags);
  const showPersonalSection = deploymentFlags.personalOrganizations;
  const showCreateTeam = shouldAllowCreateTeam(deploymentFlags);

  const orgs = ctx?.organizations ?? [];
  const personalOrgs = showPersonalSection
    ? orgs.filter((o) => o.type === 'PERSONAL')
    : [];
  const teamOrgs = orgs.filter((o) => o.type === 'TEAM');
  const activeId = ctx?.activeOrganization?.id;
  const activeName =
    ctx?.activeOrganization?.name ?? t(LAYOUT_KEYS.app.orgSwitcher.selectPlaceholder);

  async function applySelect(org: OrganizationSummary) {
    if (org.id === activeId) return;
    if (org.type === 'PERSONAL') {
      if (!deploymentFlags.personalOrganizations) return;
      await switchToPersonal();
      void navigate({ to: '/dashboard' });
      return;
    }
    if (org.slug) void navigate(organizationDashboard(org.slug));
  }

  function selectOrg(org: OrganizationSummary) {
    applySelect(org).catch(() => undefined);
  }

  const renderOrg = (org: OrganizationSummary) => (
    <DropdownMenuItem
      key={org.id}
      onClick={() => selectOrg(org)}
      data-testid={`organization-switcher-option-${org.slug ?? 'personal'}`}
      className="gap-2"
    >
      <span
        data-slot="icon-chip"
        className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center text-xs font-semibold"
      >
        {initialOf(org.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{org.name}</span>
        {org.slug ? (
          <span className="text-muted-foreground block truncate text-xs">{org.slug}</span>
        ) : null}
      </span>
      {org.id === activeId ? (
        <Check className="text-primary ms-auto size-4 shrink-0" aria-hidden />
      ) : null}
    </DropdownMenuItem>
  );

  const triggerSurfaceClass =
    surface === 'sidebar'
      ? 'border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      : undefined;

  const chevronClass = surface === 'sidebar' ? iconOnSidebarSurface : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 min-w-0 justify-start gap-2',
              triggerSurfaceClass,
              className,
            )}
            disabled={isLoading}
            aria-label={t(LAYOUT_KEYS.app.orgSwitcher.triggerLabel, {
              name: activeName,
            })}
            data-testid="organization-switcher-trigger"
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold',
                surface === 'sidebar'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {initialOf(activeName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-start text-sm font-medium">
              {activeName}
            </span>
            <ChevronsUpDown className={cn('h-4 w-4 shrink-0 opacity-60', chevronClass)} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-64">
          {personalOrgs.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                {t(LAYOUT_KEYS.app.orgSwitcher.personal)}
              </DropdownMenuLabel>
              {personalOrgs.map(renderOrg)}
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
            {mode === 'team-only'
              ? t(LAYOUT_KEYS.app.orgSwitcher.yourOrganizations)
              : t(LAYOUT_KEYS.app.orgSwitcher.organizations)}
          </DropdownMenuLabel>
          {teamOrgs.map(renderOrg)}
          {showCreateTeam ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCreateOpen(true);
              }}
              data-testid="organization-switcher-create"
            >
              <Plus className="me-2 h-4 w-4" />
              {t(LAYOUT_KEYS.app.orgSwitcher.addOrganization)}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
