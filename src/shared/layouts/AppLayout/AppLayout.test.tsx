import { axe } from 'vitest-axe';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
  },
}));

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { Component as AppLayout } from './AppLayout.tsx';

describe('AppLayout', () => {
  // Preload lazy shells so Suspense doesn't flake under full-suite contention.
  beforeAll(async () => {
    await Promise.all([
      import('./variants/AppLayoutSidebar.tsx'),
      import('./variants/AppLayoutTopNav.tsx'),
      import('./variants/AppLayoutRail.tsx'),
      import('./variants/AppLayoutFocus.tsx'),
    ]);
  });

  beforeEach(() => {
    useThemeStore.setState({ appVariant: 0 });
    useOrganizationStore.setState({ deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS });
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
    useOrganizationStore.setState({
      deploymentFlags: { personalOrganizations: true, teamOrganizations: false },
    });
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
    await findByTestId('app-layout');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
