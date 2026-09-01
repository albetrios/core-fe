import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { NotificationCenter } from '@/shared/components/NotificationCenter/index.ts';
import { OrganizationSwitcher } from '@/shared/components/OrganizationSwitcher/index.ts';
import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import {
  AppMain,
  BrandLogo,
  MobileNav,
  type NavItems,
  NavList,
  SearchTrigger,
  UserMenu,
} from '@/shared/layouts/AppLayout/AppLayout.shared.tsx';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';

export function RailShell({
  navItems,
  organizationSlug,
}: {
  navItems: NavItems;
  organizationSlug: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <>
      <aside
        aria-label={t(LAYOUT_KEYS.a11y.sidebarNavigation)}
        data-testid="sidebar"
        className="bg-sidebar text-sidebar-foreground flex w-14 shrink-0 flex-col items-center gap-1 border-e py-3 sm:w-16"
      >
        <BrandLogo />
        <nav
          className="mt-2 flex flex-1 flex-col items-center gap-1"
          aria-label={t(LAYOUT_KEYS.a11y.mainNavigation)}
        >
          <NavList
            navItems={navItems}
            organizationSlug={organizationSlug}
            variant="rail"
          />
        </nav>
        <SectionErrorBoundary
          title={t(ERRORS_KEYS.widget.notifications, { ns: ERRORS_NS })}
          testId="notifications-widget-error"
          variant="inline"
        >
          <NotificationCenter
            surface="sidebar"
            popoverSide="right"
            popoverAlign="start"
          />
        </SectionErrorBoundary>
        <ThemeModeToggle surface="sidebar" menuSide="right" menuAlign="start" />
        <UserMenu align="start" side="right" />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="bg-background flex h-14 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6"
          data-testid="header"
        >
          <SectionErrorBoundary
            title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
            testId="org-switcher-error"
            variant="inline"
          >
            <OrganizationSwitcher
              className="min-w-0 flex-1 sm:max-w-[11rem]"
              align="start"
            />
          </SectionErrorBoundary>
          <div className="flex-1" />
          <SearchTrigger iconOnly />
        </header>
        <AppMain />
        <MobileNav navItems={navItems} organizationSlug={organizationSlug} />
      </div>
    </>
  );
}
