import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { NotificationCenter } from '@/shared/components/NotificationCenter/index.ts';
import { OrganizationSwitcher } from '@/shared/components/OrganizationSwitcher/index.ts';
import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import { Separator } from '@/shared/components/ui/separator.tsx';
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

export function TopNavShell({
  navItems,
  organizationSlug,
}: {
  navItems: NavItems;
  organizationSlug: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header
        className="bg-background flex h-14 items-center gap-3 border-b px-4 sm:px-6"
        data-testid="header"
      >
        <BrandLogo />
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
        <Separator orientation="vertical" className="mx-1 hidden h-6 md:block" />
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label={t(LAYOUT_KEYS.a11y.mainNavigation)}
        >
          <NavList
            navItems={navItems}
            organizationSlug={organizationSlug}
            variant="top"
          />
        </nav>
        <div className="flex-1" />
        <SearchTrigger />
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
      <MobileNav navItems={navItems} organizationSlug={organizationSlug} />
    </div>
  );
}
