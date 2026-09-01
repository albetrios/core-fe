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
          className="bg-overlay/50 fixed inset-0 z-40 md:hidden"
          aria-hidden="true"
          onClick={toggleSidebar}
        />
      )}

      <aside
        aria-label={t(LAYOUT_KEYS.a11y.sidebarNavigation)}
        data-testid="sidebar"
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-y-0 start-0 z-50 flex w-[17.5rem] flex-col border-e transition-transform md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div
          className="from-sidebar-primary/8 pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b to-transparent"
          aria-hidden="true"
        />

        <div className="border-sidebar-border relative border-b px-4 py-4">
          <div className="flex items-start gap-3">
            <BrandLogo />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sidebar-foreground/55 text-[11px] font-semibold tracking-wider uppercase">
                {t(LAYOUT_KEYS.brand.name)}
              </p>
              {showOrgSwitcher ? (
                <SectionErrorBoundary
                  title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
                  testId="org-switcher-error-sidebar"
                  variant="inline"
                >
                  <OrganizationSwitcher
                    className="w-full"
                    align="start"
                    surface="sidebar"
                  />
                </SectionErrorBoundary>
              ) : null}
            </div>
          </div>
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
            className="md:hidden"
            onClick={toggleSidebar}
            aria-label={t(LAYOUT_KEYS.app.toggleSidebar)}
            data-testid="sidebar-toggle"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {showOrgSwitcher ? (
            <SectionErrorBoundary
              title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
              testId="org-switcher-error-mobile"
              variant="inline"
            >
              <OrganizationSwitcher className="min-w-0 flex-1 md:hidden" align="start" />
            </SectionErrorBoundary>
          ) : null}
          <SearchTrigger />
          <div className="flex-1" />
          <SectionErrorBoundary
            title={t(ERRORS_KEYS.widget.notifications, { ns: ERRORS_NS })}
            testId="notifications-widget-error"
            variant="inline"
          >
            <NotificationCenter />
          </SectionErrorBoundary>
          <ThemeModeToggle />
          <UserMenu />
        </header>
        <AppMain />
      </div>

      <MobileNav navItems={navItems} organizationSlug={organizationSlug} />
    </>
  );
}
