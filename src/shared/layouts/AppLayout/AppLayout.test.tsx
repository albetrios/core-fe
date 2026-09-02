import { axe } from 'vitest-axe';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
  },
}));

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import {
  DEFAULT_DEPLOYMENT_FLAGS,
  type DeploymentFlags,
} from '@/shared/tenancy/deployment-mode.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { Component as AppLayout, preloadAppLayoutVariants } from './AppLayout.tsx';

const { useMeContextMock, quickLinksMock, switcherMock } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  quickLinksMock: vi.fn(),
  switcherMock: vi.fn(),
}));
// Swapped so a render throw can be injected into the org switcher — the one
// surface SHELL-8 is about — without touching the rest of the shell.
vi.mock('@/shared/components/OrganizationSwitcher/index.ts', () => ({
  OrganizationSwitcher: () => switcherMock() as unknown,
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
      // The switcher carried `md:hidden`; its FALLBACK did not. So a throw
      // replaced a hidden control with a visible error, and desktop showed two
      // error controls at once. jsdom has no media queries, so assert the
      // responsive class sits on the wrapper that survives the throw.
      useThemeStore.setState({ appVariant: 0 });
      const { findByTestId } = renderWithProviders(<AppLayout />);

      const mobile = await findByTestId('org-switcher-error-mobile');
      // Attribute match, not `.md\:hidden`: the escaped colon in a class
      // selector is a footgun inside a JS string literal.
      expect(mobile.closest('[class~="md:hidden"]')).not.toBeNull();
    });
  });
});
