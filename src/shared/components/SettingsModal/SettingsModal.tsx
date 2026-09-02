import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ORGANIZATION } from '@/core/config/constants.ts';
import { cn } from '@/lib/utils.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
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
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { AccountBillingPanel } from './account/AccountBillingPanel.tsx';
import { AccountNotificationsPanel } from './account/AccountNotificationsPanel.tsx';
import { AccountPanel } from './account/AccountPanel.tsx';
import { AccountProfilePanel } from './account/AccountProfilePanel.tsx';
import { AccountSecurityPanel } from './account/AccountSecurityPanel.tsx';
import { AccountSessionsPanel } from './account/AccountSessionsPanel.tsx';
import { OrganizationGeneralPanel } from './organization/OrganizationGeneralPanel.tsx';
import { OrganizationIntegrationsPanel } from './organization/OrganizationIntegrationsPanel.tsx';
import { OrganizationMembersPanel } from './organization/OrganizationMembersPanel.tsx';
import { OrganizationRolesPanel } from './organization/OrganizationRolesPanel.tsx';
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
import { SettingsNav, SettingsNavSkeleton } from './SettingsNav.tsx';

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
const SETTINGS_DIALOG_CLASS =
  'h-dvh max-h-dvh w-full max-w-full gap-0 overflow-hidden rounded-none p-0 ' +
  'sm:h-[640px] sm:max-h-[85vh] sm:max-w-[960px]';

function SettingsModalBody() {
  const { t } = useTranslation(SETTINGS_NS);
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
  // A failed fetch is not a reason to hang on the skeleton forever: fall back to
  // permission-only gating, which is what the modal did before.
  const contextReady = !meContext.isPending;
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
  const fallbackSection = useMemo(
    () => firstVisibleSettingsSection(visibleGroups),
    [visibleGroups],
  );
  const active =
    parsed && contextReady
      ? resolveSettingsSection(parsed, navCtx, fallbackSection)
      : null;
  const scope = active?.scope;
  const section = active?.section;

  useLayoutEffect(() => {
    if (!(active && isSettingsHash(hash))) return;
    if (isCanonicalSettingsHash(hash, active)) return;
    void navigate({
      to: '.',
      hash: settingsHash(active.scope, active.section),
      search: (prev) => prev,
      replace: true,
    });
  }, [active, hash, navigate]);

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

  if (!parsed) return null;

  if (!active) {
    // Open, sized, and honest: the rail holds its space while the session
    // context lands. Nothing here can be dirty yet, so Esc closes directly.
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          className={SETTINGS_DIALOG_CLASS}
          data-testid="settings-modal"
          aria-busy
        >
          <DialogTitle className="sr-only">{t(SETTINGS_KEYS.dialog.title)}</DialogTitle>
          <div className="grid h-full min-h-0 grid-cols-1 sm:grid-cols-[240px_1fr]">
            <SettingsNavSkeleton />
            <div
              className="min-h-0 flex-1 space-y-4 px-4 pt-6 pb-6 sm:px-8"
              data-testid="settings-content-loading"
            >
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
          onInteractOutside={(e) => {
            // Toasts render outside the dialog (sonner) — clicking one (e.g. its
            // close button) must dismiss the toast, not close Settings.
            const node = e.detail.originalEvent.target as Element | null;
            if (node?.closest('[data-sonner-toaster]')) e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{t(SETTINGS_KEYS.dialog.title)}</DialogTitle>
          <div className="grid h-full min-h-0 grid-cols-1 sm:grid-cols-[240px_1fr]">
            <SettingsNav groups={visibleGroups} active={active} onSelect={goTo} />
            <div className="flex min-h-0 flex-col">
              {/* Mobile section picker — the sidebar is hidden below sm */}
              <div className="shrink-0 border-b p-3 sm:hidden">
                <Select
                  value={`${active.scope}/${active.section}`}
                  onValueChange={(v) => {
                    const [scope, section] = v.split('/') as [
                      SettingsScope,
                      SettingsSection,
                    ];
                    goTo({ scope, section });
                  }}
                >
                  <SelectTrigger className="w-full" data-testid="settings-mobile-section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleGroups
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
                className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 sm:px-8 sm:pt-2 sm:pb-8"
                data-testid="settings-content"
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
              >
                <ActivePanel active={active} />
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

function panelForSection(section: SettingsSection) {
  switch (section) {
    case 'profile':
      return <AccountProfilePanel />;
    case 'account':
      return <AccountPanel />;
    case 'security':
      return <AccountSecurityPanel />;
    case 'notifications':
      return <AccountNotificationsPanel />;
    case 'sessions':
      return <AccountSessionsPanel />;
    case 'billing':
      return <AccountBillingPanel />;
    case 'general':
      return <OrganizationGeneralPanel />;
    case 'members':
      return <OrganizationMembersPanel />;
    case 'roles':
      return <OrganizationRolesPanel />;
    case 'integrations':
      return <OrganizationIntegrationsPanel />;
  }
}

function ActivePanel({ active }: { active: SettingsSectionRef }) {
  const { t: tSettings } = useTranslation(SETTINGS_NS);
  const sectionLabel = tSettings(
    SETTINGS_SECTION_LABEL_KEYS[
      active.section as keyof typeof SETTINGS_SECTION_LABEL_KEYS
    ],
  );

  return (
    <SectionErrorBoundary
      title={sectionLabel}
      testId={`settings-panel-error-${active.section}`}
    >
      {panelForSection(active.section)}
    </SectionErrorBoundary>
  );
}
