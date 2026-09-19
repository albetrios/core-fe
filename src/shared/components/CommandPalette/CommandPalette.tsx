import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ORGANIZATION } from '@/core/config/constants.ts';
import { logout } from '@/shared/auth/service.ts';
import { SETTINGS_NS } from '@/shared/components/SettingsModal/settings.constants.ts';
import { settingsHash } from '@/shared/components/SettingsModal/settings-hash-grammar.ts';
import { visibleSettingsNavGroups } from '@/shared/components/SettingsModal/settings-nav-visibility.ts';
import { mapApiError, reportError } from '@/shared/errors/errorHandler.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
} from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { notify } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandItem } from './CommandPaletteItem.tsx';
import { CommandPaletteOrgGroup } from './CommandPaletteOrgGroup.tsx';

/**
 * Stable id for the logout-failed toast (house rule 7): a user whose sign-out
 * failed will try again, and the second failure should replace the first
 * message rather than stack another copy of it.
 */
export const PALETTE_LOGOUT_TOAST_ID = 'command-palette-logout-failed';

/**
 * Global command palette powered by cmdk.
 * Activated via Cmd+K (Mac) or Ctrl+K (Windows/Linux).
 */
export function CommandPalette() {
  const { t } = useTranslation(LAYOUT_NS);
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const navigate = useNavigate();
  const setTheme = useThemeStore((s) => s.setTheme);
  const { data: meContext } = useMeContext();
  // Organization settings only has sections for a team workspace; on a personal
  // workspace the command would just fall back to account/profile — so hide it.
  const isTeamOrg = meContext?.activeOrganization?.type === 'TEAM';
  // Settings destinations, gated exactly like the Settings modal nav (permission +
  // org type + deployment) so ⌘K can jump straight to e.g. Billing or Members.
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const deploymentFlags = useDeploymentFlags();
  const organizationId = useOrganizationStore((s) => s.organizationId);
  const permissions = useOrganizationStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  const settingsItems = useMemo(
    () =>
      visibleSettingsNavGroups({
        hasOrganizationContext:
          !!organizationId && organizationId !== ORGANIZATION.LOCALHOST_FALLBACK,
        orgType: meContext?.activeOrganization?.type,
        teamOrganizations: deploymentFlags.teamOrganizations,
        role: user?.role ?? 'user',
        permissions,
      }).flatMap((group) => group.items),
    [
      deploymentFlags.teamOrganizations,
      meContext?.activeOrganization?.type,
      organizationId,
      permissions,
      user?.role,
    ],
  );
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  /**
   * Whatever held focus when the palette opened.
   *
   * A lazy state initializer, because it runs during this component's FIRST
   * render — before React commits the subtree, and therefore before the input
   * below moves focus with `autoFocus`. An effect reads `document.activeElement`
   * after that commit and would capture the palette's own input. This component
   * only ever mounts while open, so first render IS the moment of opening.
   */
  const [previousFocus] = useState<HTMLElement | null>(
    () => document.activeElement as HTMLElement | null,
  );

  /**
   * Hand focus back when the palette goes away.
   *
   * The restore lives in the CLEANUP, not in the effect body. The body's `else`
   * branch needed a render with `open === false`, and there is never one:
   * `CommandPaletteLazy` returns `null` the instant `open` flips, so this
   * component unmounts and the effect never runs again. Focus fell to `<body>`
   * and a keyboard or screen-reader user lost their place (SHELL-7). Cleanup is
   * the one thing React guarantees on unmount.
   */
  useEffect(() => {
    if (!open) return;

    return () => {
      // StrictMode re-runs mount effects as mount -> cleanup -> mount in
      // development. Restoring here would steal focus from the palette's own
      // input 2 ms after it opened — and then Escape would go to the trigger
      // instead of the palette, so it could never be closed again. Only restore
      // when the palette is genuinely closing: the store flips first, which is
      // what unmounts this component in the first place.
      if (useUIStore.getState().commandPaletteOpen) return;

      // Only if it is still in the document — selecting a palette item can
      // navigate away, and focusing a detached node just drops focus again.
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, previousFocus]);

  useEffect(() => {
    if (!open) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  if (!open) return null;

  const cp = LAYOUT_KEYS.app.commandPalette;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={t(cp.ariaLabel)}
      ref={dialogRef}
    >
      <div
        className="bg-overlay/50 fixed inset-0 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      <div className="fixed top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2">
        <Command
          data-slot="popover-content"
          className="bg-popover overflow-hidden rounded-md border"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="text-muted-foreground me-2 h-4 w-4 shrink-0" />
            {/* eslint-disable jsx-a11y/no-autofocus -- command palette focuses input on open */}
            <Command.Input
              data-slot="input"
              placeholder={t(cp.placeholder)}
              className="placeholder:text-muted-foreground flex h-12 w-full bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
            {/* eslint-enable jsx-a11y/no-autofocus */}
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
              {t(cp.empty)}
            </Command.Empty>

            <Command.Group
              heading={t(cp.groups.navigation)}
              className="text-muted-foreground px-1 py-1.5 text-xs font-medium"
            >
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: '/' }))}
                icon={LayoutDashboard}
              >
                {t(cp.dashboard)}
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() =>
                    navigate({ to: '.', hash: settingsHash('account', 'profile') }),
                  )
                }
                icon={Settings}
              >
                {t(cp.userSettings)}
              </CommandItem>
              {isTeamOrg ? (
                <CommandItem
                  onSelect={() =>
                    runCommand(() =>
                      navigate({
                        to: '.',
                        hash: settingsHash('organization', 'general'),
                      }),
                    )
                  }
                  icon={Building2}
                >
                  {t(cp.organizationSettings)}
                </CommandItem>
              ) : null}
            </Command.Group>

            {settingsItems.length > 0 ? (
              <Command.Group
                heading={t(cp.settings)}
                className="text-muted-foreground px-1 py-1.5 text-xs font-medium"
              >
                {settingsItems.map((item) => (
                  <CommandItem
                    key={`${item.scope}/${item.section}`}
                    icon={item.icon}
                    keywords={item.keywords}
                    onSelect={() =>
                      runCommand(() =>
                        navigate({
                          to: '.',
                          hash: settingsHash(item.scope, item.section),
                        }),
                      )
                    }
                  >
                    {tSettings(item.labelKey)}
                  </CommandItem>
                ))}
              </Command.Group>
            ) : null}

            {meContext ? (
              <CommandPaletteOrgGroup
                meContext={meContext}
                personalOrganizationsEnabled={deploymentFlags.personalOrganizations}
                heading={t(cp.groups.organizations)}
                currentOrganizationLabel={(name) => t(cp.currentOrganization, { name })}
                switchOrganizationLabel={(name) => t(cp.switchOrganization, { name })}
                closePalette={closePalette}
                navigate={navigate}
              />
            ) : null}

            <Command.Separator className="bg-border my-1 h-px" />

            <Command.Group
              heading={t(cp.groups.shortcuts)}
              className="text-muted-foreground px-1 py-1.5 text-xs font-medium"
            >
              <CommandItem
                onSelect={() => runCommand(() => setShortcutsOpen(true))}
                icon={Settings}
              >
                {t(cp.openShortcuts)}
              </CommandItem>
            </Command.Group>

            <Command.Separator className="bg-border my-1 h-px" />

            <Command.Group
              heading={t(cp.groups.theme)}
              className="text-muted-foreground px-1 py-1.5 text-xs font-medium"
            >
              <CommandItem
                onSelect={() => runCommand(() => setTheme('light'))}
                icon={Sun}
              >
                {t(cp.lightMode)}
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => setTheme('dark'))}
                icon={Moon}
              >
                {t(cp.darkMode)}
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => setTheme('system'))}
                icon={Monitor}
              >
                {t(cp.systemTheme)}
              </CommandItem>
            </Command.Group>

            <Command.Separator className="bg-border my-1 h-px" />

            <Command.Group
              heading={t(cp.groups.account)}
              className="text-muted-foreground px-1 py-1.5 text-xs font-medium"
            >
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    logout().catch((error: unknown) => {
                      // `.catch(() => {})` meant a sign-out that did not happen
                      // looked exactly like one that did: the palette closed,
                      // nothing else moved, and the user was still signed in
                      // with nothing said and nothing reported (SHELL-12).
                      reportError(error, { scope: 'command-palette-logout' });
                      notify.error(mapApiError(error), {
                        id: PALETTE_LOGOUT_TOAST_ID,
                      });
                    });
                  })
                }
                icon={LogOut}
                destructive
              >
                {t(cp.logOut)}
              </CommandItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
