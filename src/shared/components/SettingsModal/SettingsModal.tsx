import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ORGANIZATION } from '@/core/config/constants.ts';
import { onceAsync, useRetryableLazy } from '@/lib/lazy-module.ts';
import { cn } from '@/lib/utils.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { useEnterAnimationProps } from '@/shared/components/LazyOverlay/index.ts';
import { PanelSkeleton } from '@/shared/components/PanelSkeleton/index.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog.tsx';
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useAccessResolved } from '@/shared/hooks/useCan/index.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
  SETTINGS_KEYS,
  SETTINGS_NS,
  SETTINGS_SECTION_LABEL_KEYS,
} from './settings.constants.ts';
import { SettingsDirtyProvider, useSettingsDirty } from './settings-dirty.tsx';
import {
  isCanonicalSettingsHash,
  isSettingsHash,
  parseSettingsHash,
  settingsHash,
} from './settings-hash.ts';
import {
  firstVisibleSettingsSection,
  visibleSettingsNavGroups,
} from './settings-nav-visibility.ts';
import { resolveSettingsSection } from './settings-resolve.ts';
import type {
  SettingsScope,
  SettingsSection,
  SettingsSectionRef,
} from './settings-sections.ts';
import { SettingsNav } from './SettingsNav.tsx';
import { SectionHeader } from './SettingsPanelShell.tsx';

/**
 * Global settings modal — ONE modal for account + organization settings,
 * driven by the URL hash (`#settings/<scope>/<section>`), mounted once on the
 * root route so it overlays any page without unmounting it. Deep links
 * reproduce page + modal, refresh keeps the section, back/Esc closes.
 *
 * Route guards never see hashes: auth, organization-context, and permission
 * gating all happen here (settings-permissions.ts). routing-and-tenancy.md §7.
 */
export function SettingsModal() {
  return (
    <SettingsDirtyProvider>
      <SettingsModalBody />
    </SettingsDirtyProvider>
  );
}

/** One dialog shell for both the loading and the resolved states. */
/**
 * A full-screen sheet on phones (square — it IS the screen), a dialog from `sm`.
 *
 * The `sm:` half has to undo the sheet, not just cap it: `w-full` with only a
 * `max-w` left the modal flush against both edges on anything between 640px and
 * 960px (every tablet), and an unconditional `rounded-none` kept it square on
 * desktop under every radius setting. `sm:rounded-lg` is token-backed and the
 * dialog slot squares it again under the Sharp shape.
 */
const SETTINGS_DIALOG_CLASS =
  'h-dvh max-h-dvh w-full max-w-full gap-0 overflow-hidden rounded-none p-0 ' +
  'sm:h-[640px] sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-[960px] sm:rounded-lg ' +
  '3xl:h-[760px] 3xl:max-w-[1120px]';

function SettingsModalBody() {
  const { t } = useTranslation(SETTINGS_NS);
  // The shell stays mounted while panels load or change sections.
  const enterProps = useEnterAnimationProps();
  const dirtyCtx = useSettingsDirty();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const organizationId = useOrganizationStore((s) => s.organizationId);
  const permissions = useOrganizationStore((s) => s.permissions);
  // Active org type (PERSONAL/TEAM) drives which org sections EXIST — so until
  // me/context answers, the shape of this modal is unknown. Read the whole
  // query, not just its data: `undefined` is "still loading", and treating it
  // as "everything is allowed" is what made the Organization group appear and
  // then vanish, and a deep link open the members panel and then swap itself
  // for a fallback (SET-15).
  const meContext = useMeContext();
  const orgType = meContext.data?.activeOrganization?.type;
  // The OTHER half of "do we know the shape of this modal yet": which sections
  // the user may open comes from the org store's permission set, and entering an
  // organization clears that set (`ensurePermissionsFor` → `clearPermissions()`)
  // a beat before the real one lands. For that beat `permissions` is `[]` —
  // which means "not known yet", not "you may do nothing" (SET-23; it is what
  // `useAccessResolved` exists to tell apart). Reading it as an answer hid the
  // Organization group, resolved `#settings/organization/general` to the
  // fallback, and let the effect below REWRITE THE URL to `account/profile` —
  // permanently, 19 ms after the deep link and ~50 ms before the permissions
  // arrived. me/context was already correct (`TEAM`) the whole time.
  const accessResolved = useAccessResolved();
  // …unless there is nothing to wait for. The permission set is DERIVED from
  // me/context (`deriveOrgContext`), so when that settled without data — a failed
  // fetch — no answer is ever coming: do not hang on the skeleton, fall back to
  // permission-only gating with whatever the store holds, as the modal always has.
  const contextReady = !meContext.isPending && (accessResolved || !meContext.data);
  const deploymentFlags = useDeploymentFlags();
  const navigate = useNavigate();
  const router = useRouter();
  // Drives the top scroll-shadow on the content panel (elevates the header bar
  // once the user scrolls down past the top).
  const [scrolled, setScrolled] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const parsed = isAuthenticated ? parseSettingsHash(hash) : null;
  const hasOrganizationContext =
    !!organizationId && organizationId !== ORGANIZATION.LOCALHOST_FALLBACK;
  const navCtx = useMemo(
    () => ({
      hasOrganizationContext,
      orgType,
      teamOrganizations: deploymentFlags.teamOrganizations,
      role: user?.role ?? ('user' as const),
      permissions,
    }),
    [
      deploymentFlags.teamOrganizations,
      hasOrganizationContext,
      orgType,
      permissions,
      user?.role,
    ],
  );
  const visibleGroups = useMemo(() => visibleSettingsNavGroups(navCtx), [navCtx]);
  const readyGroups = contextReady
    ? visibleGroups
    : visibleGroups.filter((group) => group.scope === 'account');
  const fallbackSection = useMemo(
    () => firstVisibleSettingsSection(visibleGroups),
    [visibleGroups],
  );
  const active =
    parsed && contextReady
      ? resolveSettingsSection(parsed, navCtx, fallbackSection)
      : parsed;
  const scope = active?.scope;
  const section = active?.section;

  useLayoutEffect(() => {
    if (!(contextReady && active && isSettingsHash(hash))) return;
    if (isCanonicalSettingsHash(hash, active)) return;
    void navigate({
      to: '.',
      hash: settingsHash(active.scope, active.section),
      search: (prev) => prev,
      replace: true,
    });
  }, [active, contextReady, hash, navigate]);

  // Hash changes are invisible to pageview analytics — emit explicitly.
  useEffect(() => {
    if (scope && section) {
      captureAnalyticsEvent(ANALYTICS_EVENTS.settingsSectionViewed, { scope, section });
    }
  }, [scope, section]);

  const close = useCallback(() => {
    if (router.history.length > 1) {
      router.history.back();
    } else {
      void navigate({ to: '.', hash: '', search: (prev) => prev, replace: true });
    }
  }, [navigate, router]);

  const runOrConfirmDiscard = useCallback(
    (action: () => void) => {
      if (dirtyCtx?.isDirty) {
        pendingActionRef.current = action;
        setDiscardOpen(true);
        return;
      }
      action();
    },
    [dirtyCtx?.isDirty],
  );

  if (!active) return null;

  const guardedClose = () => runOrConfirmDiscard(close);

  // Section switches replace the history entry so a single Back closes the
  // modal from anywhere instead of replaying every visited section.
  const goTo = (next: SettingsSectionRef) => {
    runOrConfirmDiscard(() => {
      void navigate({
        to: '.',
        hash: settingsHash(next.scope, next.section),
        search: (prev) => prev,
        replace: true,
      });
    });
  };

  const confirmDiscard = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setDiscardOpen(false);
    action?.();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && guardedClose()}>
        <DialogContent
          className={SETTINGS_DIALOG_CLASS}
          data-testid="settings-modal"
          {...enterProps}
          onInteractOutside={(e) => {
            // Toasts render outside the dialog (sonner) — clicking one (e.g. its
            // close button) must dismiss the toast, not close Settings.
            const node = e.detail.originalEvent.target as Element | null;
            if (node?.closest('[data-sonner-toaster]')) e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{t(SETTINGS_KEYS.dialog.title)}</DialogTitle>
          <div className="grid h-full min-h-0 grid-cols-1 sm:grid-cols-[240px_1fr]">
            <SettingsNav groups={readyGroups} active={active} onSelect={goTo} />
            <div className="flex min-h-0 flex-col">
              {/*
                Mobile section picker — the sidebar is hidden below sm. `ps-4` is
                the content pane's gutter, so the picker and the fields under it
                share a left edge.

                `pe-14` reserves room for the dialog's close button, which is
                now pinned on the logical end too (`ui/dialog.tsx`) — so the two
                mirror together. They did not: the button was physical
                (`right-4`) while this inset was logical, which put them on
                opposite sides in Arabic and Hebrew and ran the picker under the
                X. Fixed in the primitive rather than here, because every dialog
                had it.

                14 rather than 12: the button is 32px wide inset 16px, so 48px of
                reservation left the picker flush against the X with nothing
                between them. 56px is the same 16px gutter the rest of the pane
                uses, and is what "feels tight" was about (QA-V3 suggestion 7).
              */}
              <div className="shrink-0 border-b py-3 ps-4 pe-14 sm:hidden">
                <Select
                  value={`${active.scope}/${active.section}`}
                  onValueChange={(value) => {
                    const [scope, section] = value.split('/') as [
                      SettingsScope,
                      SettingsSection,
                    ];
                    goTo({ scope, section });
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="settings-mobile-section"
                    aria-label={t(SETTINGS_KEYS.nav.ariaSections)}
                  >
                    <SelectValue
                      placeholder={t(SETTINGS_SECTION_LABEL_KEYS[active.section])}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {readyGroups
                      .flatMap((group) => group.items)
                      .map((item) => (
                        <SelectItem
                          key={`${item.scope}/${item.section}`}
                          value={`${item.scope}/${item.section}`}
                        >
                          {t(item.labelKey)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Desktop: empty header strip — gives the dialog's close button room
                and elevates with a shadow once the content scrolls beneath it. */}
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none z-10 hidden h-12 shrink-0 transition-shadow duration-200 sm:block',
                  scrolled && 'scroll-shadow-top',
                )}
              />
              <div
                // `sm:px-6` / `sm:pb-6`: the standard dialog inset (see SettingsNav).
                className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 sm:px-6 sm:pt-2 sm:pb-6"
                data-testid="settings-content"
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
              >
                {contextReady ? (
                  <ActivePanel
                    key={`${active.scope}/${active.section}`}
                    active={active}
                  />
                ) : (
                  <SettingsContentLoading active={active} />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent data-testid="settings-discard-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t(SETTINGS_KEYS.discard.title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(SETTINGS_KEYS.discard.description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="settings-discard-stay">
              {t(SETTINGS_KEYS.discard.stay)}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              data-testid="settings-discard-leave"
            >
              {t(SETTINGS_KEYS.discard.leave)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const PANEL_LOADERS = {
  profile: onceAsync(() =>
    import('./account/AccountProfilePanel.tsx').then((m) => ({
      default: m.AccountProfilePanel,
    })),
  ),
  account: onceAsync(() =>
    import('./account/AccountPanel.tsx').then((m) => ({ default: m.AccountPanel })),
  ),
  security: onceAsync(() =>
    import('./account/AccountSecurityPanel.tsx').then((m) => ({
      default: m.AccountSecurityPanel,
    })),
  ),
  notifications: onceAsync(() =>
    import('./account/AccountNotificationsPanel.tsx').then((m) => ({
      default: m.AccountNotificationsPanel,
    })),
  ),
  sessions: onceAsync(() =>
    import('./account/AccountSessionsPanel.tsx').then((m) => ({
      default: m.AccountSessionsPanel,
    })),
  ),
  billing: onceAsync(() =>
    import('./account/AccountBillingPanel.tsx').then((m) => ({
      default: m.AccountBillingPanel,
    })),
  ),
  general: onceAsync(() =>
    import('./organization/OrganizationGeneralPanel.tsx').then((m) => ({
      default: m.OrganizationGeneralPanel,
    })),
  ),
  members: onceAsync(() =>
    import('./organization/OrganizationMembersPanel.tsx').then((m) => ({
      default: m.OrganizationMembersPanel,
    })),
  ),
  roles: onceAsync(() =>
    import('./organization/OrganizationRolesPanel.tsx').then((m) => ({
      default: m.OrganizationRolesPanel,
    })),
  ),
  integrations: onceAsync(() =>
    import('./organization/OrganizationIntegrationsPanel.tsx').then((m) => ({
      default: m.OrganizationIntegrationsPanel,
    })),
  ),
};

function SettingsContentLoading({ active }: { active: SettingsSectionRef }) {
  const { t } = useTranslation(SETTINGS_NS);
  const sectionLabel = t(SETTINGS_SECTION_LABEL_KEYS[active.section]);
  // The header names the section; the skeleton below is the SAME component every
  // panel draws while its own query resolves, so the shell-to-panel handoff
  // swaps identical markup instead of one skeleton shape for another.
  return (
    <div className="flex flex-col gap-6" data-testid="settings-content-loading">
      <SectionHeader title={sectionLabel} />
      <PanelSkeleton className="max-w-xl" name={sectionLabel} />
    </div>
  );
}

function ActivePanel({ active }: { active: SettingsSectionRef }) {
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const { Component: Panel, retry } = useRetryableLazy(PANEL_LOADERS[active.section]);
  const sectionLabel = tSettings(
    SETTINGS_SECTION_LABEL_KEYS[
      active.section as keyof typeof SETTINGS_SECTION_LABEL_KEYS
    ],
  );

  return (
    <SectionErrorBoundary
      title={sectionLabel}
      testId={`settings-panel-error-${active.section}`}
      onReset={retry}
    >
      <Suspense fallback={<SettingsContentLoading active={active} />}>
        <Panel />
      </Suspense>
    </SectionErrorBoundary>
  );
}
