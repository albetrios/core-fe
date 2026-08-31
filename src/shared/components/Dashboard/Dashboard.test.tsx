import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { Dashboard } from './Dashboard.tsx';

const { useMeContextMock } = vi.hoisted(() => ({ useMeContextMock: vi.fn() }));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));
vi.mock('@/shared/components/Dashboard/Dashboard.deferred.tsx', () => ({
  DeferredAnalyticsChart: () => <div data-testid="dashboard-analytics-chart" />,
  DeferredHighlightsCarousel: () => (
    <div data-testid="dashboard-highlights-carousel">
      <div data-testid="dashboard-highlights-tabs" />
    </div>
  ),
  DeferredMembersTable: () => <div data-testid="members-table" />,
  DeferredScheduleCalendar: () => <div data-testid="dashboard-schedule-calendar" />,
  DeferredThemeShowcase: () => <div data-testid="dashboard-theme-showcase" />,
  DeferredSourceDonut: () => <div data-testid="dashboard-source-donut" />,
  DeferredUsageBars: () => <div data-testid="dashboard-usage-bars" />,
}));

function ctx(overrides: Partial<MeContext> = {}): MeContext {
  return {
    user: {
      id: 'usr_x',
      email: 'ada@acme.test',
      isEmailVerified: true,
      isMfaEnabled: false,
      firstName: 'Ada',
      lastName: null,
      avatarUrl: null,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    activeOrganization: {
      id: 'org_x',
      name: 'Acme Inc.',
      slug: 'acme',
      type: 'TEAM',
      status: 'ACTIVE',
      logoUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    myPermissions: [
      'organization:read',
      'membership:read',
      'membership:manage',
      'invitation:manage',
      'role:manage',
    ],
    globalRole: null,
    organizations: [],
    ...overrides,
  };
}

const queryResult = (
  data: MeContext | undefined,
  state: { isLoading?: boolean; isError?: boolean } = {},
) => ({
  data,
  isPending: state.isLoading ?? false,
  isError: state.isError ?? false,
  isFetching: false,
  refetch: vi.fn(),
});

describe('Dashboard', () => {
  beforeEach(() => {
    useOrganizationStore.setState({ deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS });
    useThemeStore.setState({ dashboardVariant: 0 });
  });

  it('greets the user and shows the team overview + management actions', async () => {
    useMeContextMock.mockReturnValue(queryResult(ctx()));
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-greeting')).toHaveTextContent('Ada');
    expect(
      await screen.findByTestId('dashboard-highlights-carousel'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-highlights-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stat-workspaces')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-action-invite')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-action-roles')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-action-billing')).toBeInTheDocument();
    expect(screen.getByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-trend-strip')).toBeInTheDocument();
  });

  it('hides the member roster from viewers without membership:read', async () => {
    useMeContextMock.mockReturnValue(
      queryResult(ctx({ myPermissions: ['organization:read'] })),
    );
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('members-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
  });

  it('hides team-only actions for a personal organization', async () => {
    useMeContextMock.mockReturnValue(
      queryResult(
        ctx({
          activeOrganization: {
            id: 'org_p',
            name: 'Personal',
            slug: null,
            type: 'PERSONAL',
            status: 'ACTIVE',
            logoUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    );
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-action-invite')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-action-roles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-action-org-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-action-billing')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-action-account')).toBeInTheDocument();
    // Regression: the roster is gated on the ACTIVE ORG type, not the
    // deployment mode — in a hybrid install a personal workspace used to show
    // the team members widget (with fixture people) despite having no team.
    expect(screen.queryByTestId('members-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
  });

  it('omits workspace framing in personal-only deployment mode', async () => {
    useOrganizationStore.setState({
      deploymentFlags: { personalOrganizations: true, teamOrganizations: false },
    });
    useMeContextMock.mockReturnValue(
      queryResult(
        ctx({
          activeOrganization: {
            id: 'org_p',
            name: 'Personal',
            slug: null,
            type: 'PERSONAL',
            status: 'ACTIVE',
            logoUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    );
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-next-steps')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-org-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-stat-workspaces')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-stat-type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-highlights-carousel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-theme-showcase')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stat-permissions')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stat-billing')).toBeInTheDocument();
  });

  it('renders a skeleton while the context loads', async () => {
    useMeContextMock.mockReturnValue(queryResult(undefined, { isLoading: true }));
    renderWithProviders(<Dashboard />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-stat-workspaces')).not.toBeInTheDocument();
  });

  // TEMP preview axis: the Shuffle rolls `dashboardVariant` and every
  // arrangement must keep the full section/testid surface — only the layout
  // may differ (see Dashboard variants).
  describe.each([
    [1, 'command center'],
    [2, 'pulse'],
    [3, 'bento'],
  ])('arrangement variant %i (%s)', (variant) => {
    it('renders every dashboard section for a team org', async () => {
      useThemeStore.setState({ dashboardVariant: variant });
      useMeContextMock.mockReturnValue(queryResult(ctx()));
      renderWithProviders(<Dashboard />);

      expect(await screen.findByTestId('dashboard-greeting')).toHaveTextContent('Ada');
      expect(screen.getByTestId('dashboard-kpi-grid')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-next-steps')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-action-invite')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-analytics-chart')).toBeInTheDocument();
      expect(screen.getByTestId('members-table')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-highlights-carousel')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-theme-showcase')).toBeInTheDocument();
      // The variant-only flourish: the pulse gauge rides the non-classic looks.
      expect(screen.getByTestId('dashboard-pulse-gauge')).toBeInTheDocument();
      // Common sections render in every arrangement.
      expect(screen.getByTestId('dashboard-activity-feed')).toBeInTheDocument();
    });
  });

  it('bento renders the full premium component set', async () => {
    useThemeStore.setState({ dashboardVariant: 3 });
    useMeContextMock.mockReturnValue(queryResult(ctx()));
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-trend-strip')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-source-donut')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-usage-ranking')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-timeline-strip')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-pulse-gauge')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-global-map')).toBeInTheDocument();
    // The premium set added on request: charts, funnel, radar, leaderboard,
    // gantt, timer, meters, billing, and the assistant card.
    for (const id of [
      'dashboard-usage-bars',
      'dashboard-heatmap',
      'dashboard-funnel',
      'dashboard-radar',
      'dashboard-leaderboard',
      'dashboard-mini-gantt',
      'dashboard-focus-timer',
      'dashboard-plan-meters',
      'dashboard-billing-summary',
      'dashboard-ai-card',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('falls back to the classic arrangement for an out-of-range variant index', async () => {
    useThemeStore.setState({ dashboardVariant: 99 });
    useMeContextMock.mockReturnValue(queryResult(ctx()));
    renderWithProviders(<Dashboard />);

    expect(await screen.findByTestId('dashboard-greeting')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-kpi-grid')).toBeInTheDocument();
  });
});
