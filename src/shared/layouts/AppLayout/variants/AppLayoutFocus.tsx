import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { NotificationCenter } from '@/shared/components/NotificationCenter/index.ts';
import { OrganizationSwitcher } from '@/shared/components/OrganizationSwitcher/index.ts';
import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import {
  AppMain,
  BrandLogo,
  MobileNav,
  type NavItems,
  NavList,
  SearchTrigger,
  UserMenu,
} from '@/shared/layouts/AppLayout/AppLayout.shared.tsx';
import { AppContextStrip } from '@/shared/layouts/AppLayout/components/AppContextStrip/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';

/**
 * Canvas-first shell — no sidebar. Navigation lives in the top bar, context
 * strip, command palette (⌘K), and mobile bottom bar.
 */
export function FocusShell({
  navItems,
  organizationSlug,
}: {
  navItems: NavItems;
  organizationSlug: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const personalOnly = useDeploymentMode() === 'personal-only';

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="focus-shell">
      <header className="bg-background border-border/80 border-b" data-testid="header">
        <div className="flex h-14 items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandLogo />
            <span className="text-foreground hidden text-sm font-semibold tracking-tight sm:inline">
              {t(LAYOUT_KEYS.brand.name)}
            </span>
          </div>

          {!personalOnly ? (
            <SectionErrorBoundary
              title={t(ERRORS_KEYS.widget.organizationSwitcher, { ns: ERRORS_NS })}
              testId="org-switcher-error"
              variant="inline"
            >
              <OrganizationSwitcher
                className="hidden min-w-0 md:flex md:max-w-[12rem]"
                align="start"
              />
            </SectionErrorBoundary>
          ) : null}

          <nav
            className="hidden items-center lg:flex"
            aria-label={t(LAYOUT_KEYS.a11y.mainNavigation)}
          >
            <NavList
              navItems={navItems}
              organizationSlug={organizationSlug}
              variant="top"
            />
          </nav>

          <div className="flex min-w-0 flex-1 justify-center px-2">
            <SearchTrigger emphasis className="w-full max-w-md" />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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
        </div>

        <AppContextStrip />
      </header>

      <AppMain />
      <MobileNav navItems={navItems} organizationSlug={organizationSlug} />
    </div>
  );
}
