import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
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
import { mapApiError, reportError } from '@/shared/errors/errorHandler.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { Check, ChevronsUpDown, Loader2, Plus } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { notify } from '@/shared/notify/index.ts';
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

/**
 * Stable id for the switch-failed toast (house rule 7). Switching is a repeat-fire
 * control — a user whose first attempt failed will press again — so the second
 * failure must REPLACE the first message rather than stack another copy of it.
 */
export const ORG_SWITCH_TOAST_ID = 'organization-switch-failed';

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
  /**
   * The menu is CONTROLLED so it can be closed once a switch settles.
   *
   * `onSelect` calls `preventDefault()` to hold the menu open for the whole
   * round trip (SHELL-2 — see `renderOrg`), but an uncontrolled menu has no
   * second half to that: nothing ever closed it again. Team → team is a param
   * change on the `$organizationSlug` shell this control lives inside, so the
   * component stays mounted and the menu was left hanging open over the
   * freshly-switched dashboard. Radix still drives every OTHER open/close —
   * trigger, Escape, outside click, re-picking the active row — through
   * `onOpenChange`; this state only adds the missing close-on-success.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * WHICH row's switch is in flight — not just "a" switch, so the row the user
   * actually pressed is the one that spins.
   *
   * `disabled={isLoading}` only ever covered the INITIAL me/context load, so from
   * the user's side a switch was indistinguishable from a dead menu: the menu
   * closed and nothing moved for a whole network round trip. `switchToPersonal()`
   * resolves *before* any navigation starts, so the RouteProgressBar — the app's
   * usual "something is happening" signal — is still idle for that entire
   * window (SHELL-2).
   */
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  /**
   * Synchronous single-flight latch (house rule 1). Switching re-mints the
   * GLOBAL access token, so two selections in the same frame — a double-tap, a
   * held Enter on a menu item — put two `/auth/switch-*` POSTs on the wire whose
   * round trips interleave. `switch.ts` already drops the *stale response* so the
   * wrong tenant can never win the token; this stops the second request being
   * made at all, which is the half a latest-wins generation counter cannot do.
   */
  const switchingRef = useRef(false);
  const navigate = useNavigate();
  // A failed me/context used to pass in silence: the trigger just read "Select
  // organization" over an empty list, indistinguishable from a real empty
  // account (X-1). It now raises one toast carrying a Retry that refetches.
  // Deliberately NOT `throwOnError` — swapping the switcher for an error card
  // reflows the header around a control the user is mid-reach for; the toast
  // says the same thing without moving anything.
  const { data: ctx, isLoading } = useMeContext({ notifyOnError: true });
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
    if (org.type === 'PERSONAL') {
      if (!deploymentFlags.personalOrganizations) return;
      await switchToPersonal();
      // Awaited, not `void`: a navigation that rejects is the other half of
      // "and on failure, nothing happens ever" — fire-and-forget put it out of
      // reach of the catch below, so it could not be reported either.
      await navigate({ to: '/dashboard' });
      return;
    }
    if (org.slug) await navigate(organizationDashboard(org.slug));
  }

  function selectOrg(org: OrganizationSummary) {
    // Re-picking the current org is a no-op; it must not arm the latch.
    if (org.id === activeId) return;
    if (switchingRef.current) return;
    switchingRef.current = true;
    setSwitchingId(org.id);

    applySelect(org)
      .then(() => {
        // The switch landed — now close the menu. It was held open for the
        // round trip on purpose (the pressed row IS the progress indicator),
        // but once the switch settles the user is looking at the destination
        // org with the menu still covering it.
        //
        // Deliberately in `.then` and NOT `.finally`: a FAILED switch keeps the
        // menu open so the retry is one click away rather than four, and so the
        // failure has somewhere to land other than a screen the user has
        // already been handed back.
        setMenuOpen(false);
      })
      .catch((error: unknown) => {
        // The bare `.catch(() => undefined)` was the bug: a failed switch looked
        // exactly like a slow one — no toast, no error, still on the old org, and
        // nothing in Sentry either. Both halves are restored here.
        reportError(error, {
          scope: 'organization-switcher',
          organizationId: org.id,
          organizationType: org.type,
        });
        notify.error(mapApiError(error), { id: ORG_SWITCH_TOAST_ID });
      })
      .finally(() => {
        /*
         * Released on BOTH outcomes, not just failure.
         *
         * Holding it after a success assumed the switcher was on its way out.
         * It is not: team → team is a param change on the `$organizationSlug`
         * shell, and this control lives in AppLayout INSIDE that shell, so
         * TanStack Router keeps it mounted. There is no effect resetting the
         * latch either — so the trigger stayed disabled with a spinner frozen
         * on the destination row, and the user could not switch again without
         * reloading the page. A `/suspended` redirect lands inside the same
         * shell and behaved identically.
         *
         * The double-submit guard this latch exists for is unaffected: it is
         * held for the whole round trip, and by the time it releases the token
         * is re-minted and `activeId` has moved, so re-picking the row the user
         * just switched to is already a no-op above.
         */
        switchingRef.current = false;
        setSwitchingId(null);
      });
  }

  const renderOrg = (org: OrganizationSummary) => (
    <DropdownMenuItem
      key={org.id}
      onSelect={(event) => {
        // Re-picking the active org is a no-op — let Radix close the menu.
        if (org.id === activeId) return;
        // Otherwise KEEP THE MENU OPEN. Radix closes on select, which is what
        // made a switch look like nothing at all: the menu vanished and the
        // screen sat unchanged for a round trip. Held open, this row is the
        // progress indicator — and a failure has somewhere to land other than a
        // screen the user has already been handed back.
        event.preventDefault();
        selectOrg(org);
      }}
      disabled={switchingId !== null && switchingId !== org.id}
      data-testid={`organization-switcher-option-${org.slug ?? 'personal'}`}
      className="gap-2"
    >
      <span
        data-slot="icon-chip"
        className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center text-xs font-semibold"
      >
        {switchingId === org.id ? (
          <Loader2
            className="size-4 animate-spin"
            aria-hidden
            data-testid="organization-switcher-option-spinner"
          />
        ) : (
          initialOf(org.name)
        )}
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
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 min-w-0 justify-start gap-2',
              triggerSurfaceClass,
              className,
            )}
            disabled={isLoading || switchingId !== null}
            aria-busy={switchingId !== null}
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
