import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { PageTransition } from '@/lib/animations/PageTransition.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import {
  iconChipClassName,
  iconOnPrimarySurface,
  iconOnSidebarSurface,
} from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { logout } from '@/shared/auth/service.ts';
import { preloadCommandPalette } from '@/shared/components/CommandPalette/index.ts';
import { EmailVerificationBanner } from '@/shared/components/EmailVerificationBanner/index.ts';
import { settingsHash } from '@/shared/components/SettingsModal/settings-hash-grammar.ts';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import type { AccessCheck } from '@/shared/hooks/useCan/index.ts';
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
} from '@/shared/icons/index.ts';
import {
  APP_NAV_SEGMENT_KEYS,
  LAYOUT_KEYS,
  LAYOUT_NS,
} from '@/shared/layouts/layout.constants.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import {
  layoutMainClassName,
  resolveEffectiveLayoutWidth,
} from '@/shared/theme/layout-width.ts';

/**
 * Org-scoped nav entries; rendered as Links to
 * `/organization/$organizationSlug/<segment>` with the current param.
 * `id` doubles as the stable `data-testid` slug (`nav-<id>`).
 */
// eslint-disable-next-line react-refresh/only-export-components -- static nav config colocated with the layout shell
export const NAV_ITEMS: ({
  id: string;
  segment: 'dashboard';
  icon: typeof LayoutDashboard;
  labelKey: string;
} & AccessCheck)[] = [
  {
    id: 'dashboard',
    segment: 'dashboard',
    icon: LayoutDashboard,
    labelKey: APP_NAV_SEGMENT_KEYS.dashboard,
  },
];

export type NavItems = typeof NAV_ITEMS;

/**
 * Dual-URL dashboard nav link: a team org links to its
 * `/organization/$organizationSlug/dashboard`; a personal org (no org param)
 * links to the root `/dashboard`. Styling is passed in so each shell can render
 * the nav its own way.
 */
function DashboardNavLink({
  organizationSlug,
  testId,
  activeClassName,
  inactiveClassName,
  children,
}: {
  organizationSlug: string;
  testId: string;
  activeClassName: string;
  inactiveClassName: string;
  children: ReactNode;
}) {
  const shared = {
    activeOptions: { exact: true } as const,
    activeProps: { className: activeClassName },
    inactiveProps: { className: inactiveClassName },
    'data-testid': testId,
  };
  return organizationSlug ? (
    <Link
      to="/organization/$organizationSlug/dashboard"
      params={{ organizationSlug }}
      data-slot="nav-item"
      {...shared}
    >
      {children}
    </Link>
  ) : (
    <Link to="/dashboard" data-slot="nav-item" {...shared}>
      {children}
    </Link>
  );
}

// ── Shared pieces (used by every shell) ──────────────────────────────────────

export function SkipLink() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <a
      href="#main-content"
      className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:underline"
    >
      {t(LAYOUT_KEYS.a11y.skipToMain)}
    </a>
  );
}

export function BrandLogo() {
  return (
    <div
      data-slot="icon-chip"
      className={cn('bg-primary text-primary-foreground size-8', iconChipClassName)}
    >
      <Boxes className={cn('h-5 w-5', iconOnPrimarySurface)} />
    </div>
  );
}

/** ⌘K search — wide button by default, icon-only when `iconOnly`. */
export function SearchTrigger({
  iconOnly = false,
  emphasis = false,
  className,
}: {
  iconOnly?: boolean;
  /** Center-weighted search for the Focus shell. */
  emphasis?: boolean;
  className?: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const open = () => useUIStore.getState().setCommandPaletteOpen(true);
  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={open}
        onMouseEnter={preloadCommandPalette}
        onFocus={preloadCommandPalette}
        aria-label={t(LAYOUT_KEYS.app.search)}
        data-testid="search-trigger"
        className={className}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button
      variant={emphasis ? 'secondary' : 'outline'}
      className={cn(
        'text-muted-foreground justify-start gap-2',
        emphasis ? 'flex h-9 w-full' : 'hidden h-8 w-48 sm:flex lg:w-64',
        className,
      )}
      onClick={open}
      onMouseEnter={preloadCommandPalette}
      onFocus={preloadCommandPalette}
      data-testid="search-trigger"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="text-sm">{t(LAYOUT_KEYS.app.searchPlaceholder)}</span>
      <kbd
        data-slot="kbd"
        className="bg-background text-foreground/70 ms-auto hidden rounded-sm border px-1.5 text-[10px] font-medium sm:inline"
      >
        {isMac
          ? t(LAYOUT_KEYS.app.searchShortcutMac)
          : t(LAYOUT_KEYS.app.searchShortcutWindows)}
      </kbd>
    </Button>
  );
}

/** Avatar + dropdown (settings, logout). */
export function UserMenu({
  align = 'end',
  side,
}: {
  align?: 'end' | 'start';
  /** Preferred popover side — use `right` when the trigger sits in a narrow left rail. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.slice(0, 2).toUpperCase() ?? '??');

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // forceLogout handles the redirect
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative size-9 rounded-full p-0"
          aria-label={t(LAYOUT_KEYS.app.userMenu)}
          data-testid="user-menu-trigger"
        >
          <Avatar className="ring-border size-8 ring-1">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">
              {user?.name ?? t(LAYOUT_KEYS.app.userFallback)}
            </p>
            <p className="text-muted-foreground text-xs">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void navigate({ to: '.', hash: settingsHash('account', 'profile') })
          }
          data-testid="user-menu-settings"
        >
          <Settings className="me-2 h-4 w-4" />
          {t(LAYOUT_KEYS.app.settings)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
          data-testid="logout-button"
        >
          <LogOut className="me-2 h-4 w-4" />
          {t(LAYOUT_KEYS.app.logOut)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const sidebarNavBase =
  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors';

// eslint-disable-next-line react-refresh/only-export-components -- static class map colocated with the layout shell
export const NAV_STYLES = {
  sidebar: {
    active: `${sidebarNavBase} bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-1/2 before:start-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary [&_svg]:text-sidebar-accent-foreground`,
    inactive: `${sidebarNavBase} text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground [&_svg]:${iconOnSidebarSurface}`,
  },
  top: {
    active:
      'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-foreground after:absolute after:inset-x-3 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-primary',
    inactive:
      'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  },
  rail: {
    active:
      'flex size-10 items-center justify-center bg-sidebar-accent text-sidebar-accent-foreground',
    inactive: `flex size-10 items-center justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground [&_svg]:${iconOnSidebarSurface}`,
  },
} as const;

export function NavList({
  navItems,
  organizationSlug,
  variant,
}: {
  navItems: NavItems;
  organizationSlug: string;
  variant: keyof typeof NAV_STYLES;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const style = NAV_STYLES[variant];

  const links = navItems.map((item) => {
    const label = t(item.labelKey);
    const link = (
      <DashboardNavLink
        key={item.id}
        organizationSlug={organizationSlug}
        testId={`nav-${item.id}`}
        activeClassName={style.active}
        inactiveClassName={style.inactive}
      >
        <item.icon className={variant === 'rail' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
        {variant === 'rail' ? <span className="sr-only">{label}</span> : label}
      </DashboardNavLink>
    );

    if (variant !== 'rail') return link;

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  });

  if (variant === 'rail') {
    return <TooltipProvider delayDuration={300}>{links}</TooltipProvider>;
  }

  return <>{links}</>;
}

/** Bottom tab bar for mobile (shells that hide their nav on small screens). */
export function MobileNav({
  navItems,
  organizationSlug,
}: {
  navItems: NavItems;
  organizationSlug: string;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <nav
      aria-label={t(LAYOUT_KEYS.a11y.mobileNavigation)}
      // `mobile-nav` is what `index.css` looks for to lift floating corner
      // surfaces (consent card, feedback trigger) clear of this bar.
      data-slot="mobile-nav"
      className="bg-background fixed start-0 end-0 bottom-0 z-40 flex border-t md:hidden"
      data-testid="mobile-bottom-bar"
    >
      {navItems.map((item) => (
        <DashboardNavLink
          key={item.id}
          organizationSlug={organizationSlug}
          testId={`nav-${item.id}`}
          activeClassName="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-foreground bg-muted/50"
          inactiveClassName="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <item.icon className="h-5 w-5" aria-hidden />
          <span>{t(item.labelKey)}</span>
        </DashboardNavLink>
      ))}
    </nav>
  );
}

/**
 * Scroll offset carried across a shell swap.
 *
 * Each variant owns its own `<main>`, so changing shells unmounts this one and
 * mounts a different node — the browser has nothing to restore and the user is
 * thrown back to the top of a page they were reading (SHELL-1). Module scope,
 * not state: it must outlive the component that is being replaced.
 *
 * Outliving the component also meant outliving the SESSION. Signing out and
 * signing back in as somebody else left the fresh session being chase-scrolled
 * to the previous user's offset for the whole restore window below, on a page
 * they had never scrolled. A logout now clears it — see
 * {@link bindScrollResetToSession}.
 */
let lastMainScrollTop = 0;

/** How long a restore keeps chasing content that is still rendering in. */
const SCROLL_RESTORE_WINDOW_MS = 1500;

let scrollResetBound = false;

/**
 * Drop the carried offset when the session ends.
 *
 * Every local logout path — the user menu, a dead/expired session, the
 * cross-tab logout broadcast — funnels through the auth service's
 * `clearLocalAuthState()`, and its one effect observable from here is
 * `useAuthStore.clearAuth()`. Watching that one transition therefore covers all
 * of them without this shell having to know about any of them, and follows the
 * store-subscription pattern already used for auth transitions in
 * `shared/icons/icon-registry.ts`.
 *
 * Bound once from the first `AppMain` mount and deliberately never unbound. The
 * offset it guards cannot be non-zero unless `AppMain` has mounted, so binding
 * on mount misses nothing; keeping the subscription alive afterwards is what
 * makes it correct, because the logout it has to hear is usually the same event
 * that unmounts `AppMain` (a subscription owned by the effect would be torn
 * down in that same teardown), and a cross-tab logout can arrive while this tab
 * already sits on `/login` with no shell mounted at all.
 */
function bindScrollResetToSession(): void {
  if (scrollResetBound) return;
  scrollResetBound = true;
  useAuthStore.subscribe((state, prev) => {
    if (prev.isAuthenticated && !state.isAuthenticated) lastMainScrollTop = 0;
  });
}

/** The scrolling content region (email banner + routed page). */
export function AppMain() {
  const { t } = useTranslation(ERRORS_NS);
  const mainRef = useRef<HTMLElement>(null);
  const layoutPreference = useThemeStore((s) => s.layoutWidth);
  const layoutWidth = resolveEffectiveLayoutWidth(
    platformConfig.layoutWidthForced,
    layoutPreference,
  );

  useEffect(() => {
    bindScrollResetToSession();
    const el = mainRef.current;
    if (!el) return;
    const target = lastMainScrollTop;
    let restoring = target > 0;
    let written: number | null = null;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const deadline = performance.now() + SCROLL_RESTORE_WINDOW_MS;

    const stop = () => {
      restoring = false;
      observer?.disconnect();
    };

    // One assignment is not enough: the routed island remounts with the shell,
    // so at this instant its content can still be short and `scrollTop` clamps
    // back to 0. Re-apply while the content grows into the offset.
    const apply = () => {
      if (!restoring) return;
      // Someone moved it who is not us — the user wins, stop restoring.
      if (written !== null && el.scrollTop !== written) return stop();
      el.scrollTop = target;
      written = el.scrollTop;
      if (written >= target || performance.now() > deadline) stop();
    };

    // Save continuously rather than on unmount: during a shell swap React can
    // mount the replacement before the outgoing instance's cleanup runs, and a
    // value written then arrives one commit too late to be read.
    const onScroll = () => {
      if (restoring || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        lastMainScrollTop = el.scrollTop;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    apply();
    if (restoring && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(apply);
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      <SectionErrorBoundary
        title={t(ERRORS_KEYS.widget.emailBanner)}
        testId="email-banner-error"
        variant="inline"
      >
        <EmailVerificationBanner />
      </SectionErrorBoundary>
      <main
        id="main-content"
        ref={mainRef}
        // `app-main`: index.css extends the bottom padding by the consent card's
        // height on phones. `sm:pb-20` is not redundant — `sm:p-6` resets every
        // side, and the tab bar this padding clears stays until `md`.
        data-slot="app-main"
        className="3xl:p-8 flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-20 md:pb-6"
        data-testid="main-content"
        data-layout-width={layoutWidth}
      >
        <div className={layoutMainClassName(layoutWidth)}>
          <SectionErrorBoundary
            title={t(ERRORS_KEYS.widget.pageContent)}
            testId="page-content-error"
          >
            <PageTransition>
              <Outlet />
            </PageTransition>
          </SectionErrorBoundary>
        </div>
      </main>
    </>
  );
}
