import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
  },
}));

import { PRODUCT_NAME } from '@/lib/product-identity.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import {
  DEFAULT_DEPLOYMENT_FLAGS,
  type DeploymentFlags,
} from '@/shared/tenancy/deployment-mode.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { Component as AppLayout, preloadAppLayoutVariants } from './AppLayout.tsx';
import { SidebarShell } from './variants/AppLayoutSidebar.tsx';

const { useMeContextMock, quickLinksMock, switcherMock } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  quickLinksMock: vi.fn(),
  switcherMock: vi.fn(),
}));
// Swapped so a render throw can be injected into the org switcher — the one
// surface SHELL-8 is about — without touching the rest of the shell.
vi.mock('@/shared/components/OrganizationSwitcher/index.ts', () => ({
  // Props are forwarded so a test can assert HOW a shell mounts the switcher
  // (the sidebar's brand lockup); the throw-injection tests ignore them.
  OrganizationSwitcher: (props: Record<string, unknown>) =>
    switcherMock(props) as unknown,
}));
// Only the sidebar's quick-links block is swapped, so a render throw can be
// injected into the shell without touching the rest of the nav surface. It is
// deliberately a surface with NO boundary of its own — the switcher and the
// notification centre already carry one, so a throw there never reaches the
// shell boundary this test is about.
vi.mock('@/shared/layouts/AppLayout/components/SidebarQuickLinks/index.ts', () => ({
  SidebarQuickLinks: () => quickLinksMock() as unknown,
}));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

/**
 * The shell is derived ONLY from loaded session context (SHELL-1), so every test
 * that expects a shell has to say what the context actually resolved to. A test
 * that leaves this unset is asserting on the "not loaded yet" state on purpose.
 */
function contextLoaded(deploymentFlags: DeploymentFlags = DEFAULT_DEPLOYMENT_FLAGS) {
  useMeContextMock.mockReturnValue({
    data: {
      user: null,
      activeOrganization: null,
      myPermissions: [],
      globalRole: null,
      organizations: [],
      deploymentFlags,
      personalOrganizationId: null,
    } as unknown as MeContext,
    isSuccess: true,
    isLoading: false,
  });
}

/** me/context still in flight — no `data`, nothing resolved. */
function contextPending() {
  useMeContextMock.mockReturnValue({
    data: undefined,
    isSuccess: false,
    isLoading: true,
  });
}

describe('AppLayout', () => {
  // Preload lazy shells so Suspense doesn't flake under full-suite contention.
  beforeAll(async () => {
    await preloadAppLayoutVariants();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useThemeStore.setState({ appVariant: 0 });
    useOrganizationStore.setState({ deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS });
    quickLinksMock.mockReturnValue(<div data-testid="sidebar-quick-links" />);
    switcherMock.mockReturnValue(<div data-testid="organization-switcher-trigger" />);
    contextLoaded();
  });

  it('renders the app layout: sidebar, header, main region, mobile nav', async () => {
    const { findByTestId } = renderWithProviders(<AppLayout />);

    expect(await findByTestId('app-layout')).toBeInTheDocument();
    expect(await findByTestId('sidebar')).toBeInTheDocument();
    expect(await findByTestId('header')).toBeInTheDocument();
    expect(await findByTestId('main-content')).toBeInTheDocument();
    expect(await findByTestId('mobile-bottom-bar')).toBeInTheDocument();
  });

  it('exposes the primary navigation and user menu controls', async () => {
    const { findAllByTestId, findByTestId } = renderWithProviders(<AppLayout />);

    // nav links render twice by design: sidebar + mobile bottom bar
    expect(await findAllByTestId('nav-dashboard')).toHaveLength(2);
    expect(await findByTestId('user-menu-trigger')).toBeInTheDocument();
    expect(await findByTestId('search-trigger')).toBeInTheDocument();
  });

  it('renders the focus shell for personal-only deployments', async () => {
    contextLoaded({ personalOrganizations: true, teamOrganizations: false });
    const { findByTestId, queryByTestId } = renderWithProviders(<AppLayout />);

    expect(await findByTestId('focus-shell')).toBeInTheDocument();
    expect(await findByTestId('app-context-strip')).toBeInTheDocument();
    expect(queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(await findByTestId('main-content')).toBeInTheDocument();
  });

  it('renders the top-nav preview shell (1)', async () => {
    useThemeStore.setState({ appVariant: 1 });
    const { findByTestId, findAllByTestId } = renderWithProviders(<AppLayout />);

    expect(await findByTestId('app-layout')).toBeInTheDocument();
    expect(await findByTestId('main-content')).toBeInTheDocument();
    expect(await findByTestId('user-menu-trigger')).toBeInTheDocument();
    expect(await findByTestId('search-trigger')).toBeInTheDocument();
    expect((await findAllByTestId('nav-dashboard')).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the icon-rail preview shell (2) with the profile control', async () => {
    useThemeStore.setState({ appVariant: 2 });
    const { findByTestId } = renderWithProviders(<AppLayout />);

    expect(await findByTestId('app-layout')).toBeInTheDocument();
    expect(await findByTestId('sidebar')).toBeInTheDocument();
    expect(await findByTestId('user-menu-trigger')).toBeInTheDocument();
    expect(await findByTestId('search-trigger')).toBeInTheDocument();
    expect(await findByTestId('mobile-bottom-bar')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container, findByTestId } = renderWithProviders(<AppLayout />);
    // Wait for the SHELL, not just the container: the container paints first with
    // the loading skeleton inside it, and that is not what this test is about.
    await findByTestId('sidebar');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe('SHELL-1 — the shell is never derived from state that has not loaded', () => {
    it('holds the skeleton instead of guessing a shell while me/context is in flight', async () => {
      // The store fallback here says personal-and-team, which would resolve to the
      // sidebar shell. Rendering it is the bug: when the real context lands and
      // says personal-only, the whole shell is torn down and rebuilt.
      contextPending();
      const { findByTestId, queryByTestId } = renderWithProviders(<AppLayout />);

      expect(await findByTestId('app-layout')).toBeInTheDocument();
      expect(await findByTestId('layout-variant-fallback')).toBeInTheDocument();
      expect(queryByTestId('sidebar')).not.toBeInTheDocument();
      expect(queryByTestId('focus-shell')).not.toBeInTheDocument();
      expect(queryByTestId('main-content')).not.toBeInTheDocument();
    });

    it('mounts exactly the shell the loaded context calls for, with no first guess', async () => {
      contextLoaded({ personalOrganizations: true, teamOrganizations: false });
      const { findByTestId, queryByTestId } = renderWithProviders(<AppLayout />);

      expect(await findByTestId('focus-shell')).toBeInTheDocument();
      // Never the permissive-default shell on the way there.
      expect(queryByTestId('sidebar')).not.toBeInTheDocument();
    });
  });

  describe('SHELL-1 — a crashing shell stays inside the shell', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it('contains a shell throw and keeps the layout container mounted', async () => {
      // A throw from inside the mounted shell, in a block that has no boundary of
      // its own — so without the shell boundary it reaches the route boundary and
      // replaces the entire authenticated application.
      quickLinksMock.mockImplementation(() => {
        throw new Error('app shell exploded');
      });

      const { findByTestId } = renderWithProviders(<AppLayout />);

      expect(await findByTestId('app-shell-error')).toBeInTheDocument();
      expect(await findByTestId('app-layout')).toBeInTheDocument();
    });
  });

  // ── The top-start corner: mark + switcher as one aligned identity row ─────

  describe('sidebar header — brand and organization switcher are one aligned row', () => {
    /** Props the sidebar handed its (desktop) switcher — the one with a lockup. */
    function sidebarSwitcherProps() {
      const call = switcherMock.mock.calls.find(
        ([props]) => (props as { surface?: string } | undefined)?.surface === 'sidebar',
      );
      if (!call) throw new Error('the sidebar never mounted its switcher');
      return call[0] as { leading?: unknown; caption?: string; className?: string };
    }

    it('mounts the switcher as a brand lockup: the mark leads it, the product name captions it', async () => {
      // Regression: the logo and the switcher were two things in a column — a
      // 32px mark top-aligned against an 11px caption, the dropdown indented on
      // a second row — so nothing in the corner shared an edge or a baseline.
      const { findByTestId } = renderWithProviders(<AppLayout />);
      await findByTestId('sidebar-brand');

      const props = sidebarSwitcherProps();
      expect(props.leading).toBeTruthy();
      expect(props.caption).toBe(PRODUCT_NAME);
      expect(props.className).toContain('w-full');
    });

    it('renders no free-standing logo or caption beside the switcher', async () => {
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const brand = await findByTestId('sidebar-brand');

      // The mark now lives INSIDE the switcher (mocked away here), so the row
      // itself holds exactly one child: the switcher's boundary.
      expect(brand.querySelector('[data-slot="icon-chip"]')).toBeNull();
      expect(brand).not.toHaveTextContent(PRODUCT_NAME);
    });

    it('is exactly as tall as the page header, so their bottom borders form one line', async () => {
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const brand = await findByTestId('sidebar-brand');
      const header = await findByTestId('header');

      // jsdom does no layout: pin the contract on the shared height utility.
      for (const row of [brand, header]) {
        expect(row).toHaveClass('h-14');
        expect(row).toHaveClass('border-b');
        expect(row).toHaveClass('items-center');
      }
    });

    it('keeps the same lockup, as plain text, when there is no switcher to mount', async () => {
      // Personal-only normally runs the Focus shell, so this is the sidebar's
      // defensive branch — rendered directly, because AppLayout never picks it.
      contextLoaded({ personalOrganizations: true, teamOrganizations: false });
      const { findByTestId } = renderWithProviders(
        <SidebarShell navItems={[]} organizationSlug="" />,
      );
      const brand = await findByTestId('sidebar-brand');

      expect(brand.querySelector('[data-slot="icon-chip"]')).not.toBeNull();
      expect(brand).toHaveTextContent(PRODUCT_NAME);
      expect(brand).toHaveClass('h-14');
      expect(switcherMock).not.toHaveBeenCalled();
    });

    it('does not let the mobile header squeeze the switcher down to one letter', async () => {
      // Regression: a `flex-1` spacer sat beside the `flex-1` mobile switcher and
      // took half the free space — "Personal" rendered as "P". The actions are
      // pinned with `ms-auto` instead, which yields to the switcher.
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const header = await findByTestId('header');
      const spacers = [...header.children].filter(
        (el) => el.children.length === 0 && el.classList.contains('flex-1'),
      );

      expect(spacers).toEqual([]);
      const actions = (await findByTestId('user-menu-trigger')).parentElement;
      expect(actions).toHaveClass('ms-auto');
      expect(actions).toHaveClass('shrink-0');
    });
  });

  // ── Phones and tablets: the sidebar is a drawer ──────────────────────────

  describe('navigation drawer (below `lg`)', () => {
    const classesOf = (el: HTMLElement) => el.className.split(/\s+/);

    beforeEach(() => {
      useUIStore.setState({ sidebarOpen: false });
    });

    it('is a drawer until `lg` — a portrait tablet gets the whole width', async () => {
      // At 768px a 280px column was over a third of the screen.
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const sidebar = await findByTestId('sidebar');
      const classes = classesOf(sidebar);

      expect(classes).toContain('fixed');
      expect(classes).toContain('lg:relative');
      expect(classes).toContain('lg:translate-x-0');
      expect(classes.filter((c) => c.startsWith('md:'))).toEqual([]);
      expect(await findByTestId('sidebar-toggle')).toHaveClass('lg:hidden');
    });

    it('is invisible — not just off-screen — while closed, so it cannot take focus', async () => {
      // Translated away is still focusable: Tab walked through a switcher and
      // links nobody could see, and a screen reader announced them.
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const sidebar = await findByTestId('sidebar');

      expect(sidebar).toHaveAttribute('data-state', 'closed');
      expect(classesOf(sidebar)).toContain('invisible');
      // …while the desktop column is pinned visible whatever the drawer state.
      expect(classesOf(sidebar)).toContain('lg:visible');
    });

    it('pins the desktop column under RTL too', async () => {
      // `rtl:translate-x-full` outranks a bare `lg:translate-x-0`; without the
      // `rtl:` twin a closed drawer pushed the desktop sidebar off-screen.
      const { findByTestId } = renderWithProviders(<AppLayout />);

      expect(classesOf(await findByTestId('sidebar'))).toContain('rtl:lg:translate-x-0');
    });

    it('opens from the header toggle, with a scrim, and says so to assistive tech', async () => {
      const user = userEvent.setup();
      const { findByTestId, queryByTestId } = renderWithProviders(<AppLayout />);
      const toggle = await findByTestId('sidebar-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls', 'app-sidebar');
      expect(queryByTestId('sidebar-scrim')).not.toBeInTheDocument();

      await user.click(toggle);

      const sidebar = await findByTestId('sidebar');
      expect(sidebar).toHaveAttribute('data-state', 'open');
      expect(classesOf(sidebar)).toContain('visible');
      expect(classesOf(sidebar)).not.toContain('invisible');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(await findByTestId('sidebar-scrim')).toHaveClass('lg:hidden');
    });

    it('closes on the scrim and on Escape', async () => {
      const user = userEvent.setup();
      const { findByTestId } = renderWithProviders(<AppLayout />);
      await user.click(await findByTestId('sidebar-toggle'));

      await user.click(await findByTestId('sidebar-scrim'));
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      await user.click(await findByTestId('sidebar-toggle'));
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      await user.keyboard('{Escape}');
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('never grows wider than the phone it opens on', async () => {
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const classes = classesOf(await findByTestId('sidebar'));

      expect(classes).toContain('max-w-[85vw]');
      expect(classes).toContain('lg:max-w-none');
    });

    it('clears the tab bar for as long as the tab bar exists (`sm:pb-20`)', async () => {
      // `sm:p-6` resets every side, so between 640px and 768px the last rows of a
      // page sat underneath a tab bar that stays until `md`.
      const { findByTestId } = renderWithProviders(<AppLayout />);
      const main = await findByTestId('main-content');

      expect(main).toHaveClass('pb-20', 'sm:pb-20', 'md:pb-6');
      expect(main).toHaveAttribute('data-slot', 'app-main');
      expect(await findByTestId('mobile-bottom-bar')).toHaveAttribute(
        'data-slot',
        'mobile-nav',
      );
    });
  });

  describe('SHELL-8 — a crashing org switcher costs the switcher, not the shell', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      switcherMock.mockImplementation(() => {
        throw new Error('org switcher exploded');
      });
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    // Every mount site, because the sidebar's desktop instance is the one that
    // has been silently un-wrapped before. A boundary nothing asserts is a
    // boundary that quietly goes away again.
    it.each([
      ['sidebar (desktop)', 0, 'org-switcher-error-sidebar'],
      ['sidebar (mobile)', 0, 'org-switcher-error-mobile'],
      ['top-nav', 1, 'org-switcher-error'],
      ['icon-rail', 2, 'org-switcher-error'],
    ])('contains the throw in the %s shell', async (_label, appVariant, testId) => {
      useThemeStore.setState({ appVariant });
      const { findByTestId, queryByTestId } = renderWithProviders(<AppLayout />);

      // The failure is visible where the switcher was...
      expect(await findByTestId(testId)).toBeInTheDocument();
      // ...and the shell around it is untouched: nav, main region, the lot.
      expect(await findByTestId('main-content')).toBeInTheDocument();
      expect(queryByTestId('app-shell-error')).not.toBeInTheDocument();
      expect(queryByTestId('route-error-boundary')).not.toBeInTheDocument();
    });

    it('does not put the mobile fallback on desktop beside the sidebar one', async () => {
      // The switcher carried the responsive `hidden`; its FALLBACK did not. So a
      // throw replaced a hidden control with a visible error, and desktop showed
      // two error controls at once. jsdom has no media queries, so assert the
      // responsive class sits on the wrapper that survives the throw. (`lg`, not
      // `md`: the sidebar is a drawer on tablets, so they use this switcher too.)
      useThemeStore.setState({ appVariant: 0 });
      const { findByTestId } = renderWithProviders(<AppLayout />);

      const mobile = await findByTestId('org-switcher-error-mobile');
      // Attribute match, not `.md\:hidden`: the escaped colon in a class
      // selector is a footgun inside a JS string literal.
      expect(mobile.closest('[class~="lg:hidden"]')).not.toBeNull();
    });
  });
});
