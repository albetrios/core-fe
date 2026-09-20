import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { cn } from '@/lib/utils.ts';
import { NotificationCenter } from '@/shared/components/NotificationCenter/index.ts';
import { OrganizationSwitcher } from '@/shared/components/OrganizationSwitcher/index.ts';
import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Separator } from '@/shared/components/ui/separator.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { Menu } from '@/shared/icons/index.ts';
import {
  AppMain,
  BrandLogo,
  MobileNav,
  type NavItems,
  NavList,
  SearchTrigger,
  UserMenu,
} from '@/shared/layouts/AppLayout/AppLayout.shared.tsx';
import { SidebarQuickLinks } from '@/shared/layouts/AppLayout/components/SidebarQuickLinks/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import { shouldShowOrganizationSwitcher } from '@/shared/tenancy/deployment-mode.ts';

// Computed once at module load — a copyright year is not render-reactive.
const CURRENT_YEAR = new Date().getFullYear();

/**
 * The sidebar shell: a permanent column from `lg` up, an off-canvas drawer below
 * it. The header row is one identity lockup (mark + organization switcher) and is
 * exactly as tall as the page header beside it.
 */
export function SidebarShell({
  navItems,
  organizationSlug,
}: {
  navItems: NavItems;
  organizationSlug: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const href = useRouterState({ select: (s) => s.location.href });

  // A drawer that survives the navigation it just performed covers the page the
  // user asked for. `href`, not `pathname`: Settings opens through the hash.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `href` IS the trigger — the effect reads nothing from it
  useEffect(() => {
    setSidebarOpen(false);
  }, [href, setSidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, setSidebarOpen]);
  const deploymentFlags = useDeploymentFlags();
  const showOrgSwitcher = shouldShowOrganizationSwitcher(deploymentFlags);
  const personalOnly = !deploymentFlags.teamOrganizations;
  const navSectionLabel = personalOnly
    ? t(LAYOUT_KEYS.app.sidebar.menu)
    : t(LAYOUT_KEYS.app.sidebar.workspace);

  return (
    <>
      {sidebarOpen && (
        <div
          className="bg-overlay/50 fixed inset-0 z-40 lg:hidden"
          aria-hidden="true"
          data-testid="sidebar-scrim"
          onClick={toggleSidebar}
        />
      )}

      {/*
        A drawer below `lg`, a permanent column from `lg` up.

        `lg`, not `md`: at 768px a 280px column is over a third of a portrait
        tablet, and the dashboard behind it was squeezed to two cramped columns.
        The tablet gets the whole width and opens navigation on demand.

        Closed means `invisible`, not merely translated away. Off-screen is still
        focusable: Tab walked through a switcher and links nobody could see, and
        a screen reader announced them. `visibility` is in the transition so the
        panel stays painted until it has finished sliding out. `lg:visible` and
        `lg:translate-x-0` pin the column regardless of drawer state — and the
        `rtl:` twin is required, because `rtl:translate-x-full` outranks a bare
        `lg:` utility and would push the desktop column off-screen under RTL.
      */}
      <aside
        id="app-sidebar"
        aria-label={t(LAYOUT_KEYS.a11y.sidebarNavigation)}
        data-testid="sidebar"
        data-state={sidebarOpen ? 'open' : 'closed'}
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-y-0 start-0 z-50 flex w-[17.5rem] max-w-[85vw] flex-col border-e',
          'transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none',
          '3xl:w-80 lg:visible lg:relative lg:z-auto lg:max-w-none lg:translate-x-0 rtl:lg:translate-x-0',
          sidebarOpen
            ? 'visible translate-x-0'
            : 'invisible -translate-x-full rtl:translate-x-full',
        )}
      >
        <div
          className="from-sidebar-primary/8 pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b to-transparent"
          aria-hidden="true"
        />

        {/*
          One identity row, exactly as tall as the page header beside it (`h-14`),
          so the two bottom borders read as a single line across the app. The mark
          and the switcher are ONE control here — see OrganizationSwitcher's
          `leading` — rather than a logo floating beside a caption with the
          dropdown indented underneath, where nothing shared an edge or a baseline.
        */}
        <div
          className="border-sidebar-border relative flex h-14 shrink-0 items-center border-b px-2"
          data-testid="sidebar-brand"
        >
          {showOrgSwitcher ? (
            <SectionErrorBoundary
              title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
              testId="org-switcher-error-sidebar"
              variant="control"
            >
              <OrganizationSwitcher
                className="w-full"
                align="start"
                surface="sidebar"
                leading={<BrandLogo />}
                caption={t(LAYOUT_KEYS.brand.name)}
              />
            </SectionErrorBoundary>
          ) : (
            // No switcher (personal-only): the same lockup, just not a button.
            <div className="flex min-w-0 items-center gap-3 px-2">
              <BrandLogo />
              <p className="text-sidebar-foreground truncate text-sm leading-5 font-semibold">
                {t(LAYOUT_KEYS.brand.name)}
              </p>
            </div>
          )}
        </div>

        <nav
          className="flex flex-1 flex-col overflow-y-auto px-3 py-4"
          aria-label={t(LAYOUT_KEYS.a11y.mainNavigation)}
        >
          <p
            className="text-sidebar-foreground/50 mb-2 px-3 text-[11px] font-semibold tracking-wider uppercase"
            id="sidebar-nav-workspace-label"
          >
            {navSectionLabel}
          </p>
          <nav aria-labelledby="sidebar-nav-workspace-label">
            <NavList
              navItems={navItems}
              organizationSlug={organizationSlug}
              variant="sidebar"
            />
          </nav>
        </nav>

        <Separator className="bg-sidebar-border" />
        <div className="relative space-y-3 p-3">
          <div>
            <p className="text-sidebar-foreground/50 mb-2 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {t(LAYOUT_KEYS.app.sidebar.shortcuts)}
            </p>
            <SidebarQuickLinks />
          </div>
          <p className="text-sidebar-foreground/50 px-3 text-xs">
            {t(LAYOUT_KEYS.app.footerCopyright, { year: CURRENT_YEAR })}
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-14 items-center gap-2 border-b px-4 backdrop-blur sm:gap-4 sm:px-6"
          data-testid="header"
        >
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={toggleSidebar}
            aria-label={t(LAYOUT_KEYS.app.toggleSidebar)}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            data-testid="sidebar-toggle"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {showOrgSwitcher ? (
            // `lg:hidden` belongs on the WRAPPER, not on the switcher: when the
            // switcher throws it is replaced by the fallback, which carried no
            // responsive class of its own — so a failure put a second error
            // control on desktop, next to the sidebar one, where the mobile
            // switcher itself never appears.
            <div className="min-w-0 flex-1 sm:max-w-64 lg:hidden">
              <SectionErrorBoundary
                title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
                testId="org-switcher-error-mobile"
                variant="control"
              >
                <OrganizationSwitcher className="w-full" align="start" />
              </SectionErrorBoundary>
            </div>
          ) : null}
          <SearchTrigger />
          {/* `ms-auto`, not a `flex-1` spacer. Below `md` the mobile switcher is
              the flexible item, and a spacer split the free space with it — the
              organization name was crushed down to a single letter. `ms-auto`
              yields to the switcher when it is there and still pins these to the
              end edge when it is not (personal-only, or from `md` up). */}
          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <SectionErrorBoundary
              title={t(ERRORS_KEYS.widget.notifications, { ns: ERRORS_NS })}
              testId="notifications-widget-error"
              variant="inline"
            >
              <NotificationCenter />
            </SectionErrorBoundary>
            <ThemeModeToggle />
            <UserMenu />
          </div>
        </header>
        <AppMain />
      </div>

      <MobileNav navItems={navItems} organizationSlug={organizationSlug} />
    </>
  );
}
