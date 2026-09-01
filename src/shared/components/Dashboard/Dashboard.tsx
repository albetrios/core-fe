import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';
import {
  autoFitActionsGrid,
  autoFitCardsGrid,
  dashboardFooterGrid,
  dashboardKpiGrid,
  gridCellMinWidth,
  splitMainAsideGrid,
} from '@/lib/responsive-grid.ts';
import {
  DeferredAnalyticsChart,
  DeferredHighlightsCarousel,
  DeferredMembersTable,
  DeferredScheduleCalendar,
  DeferredThemeShowcase,
} from '@/shared/components/Dashboard/Dashboard.deferred.tsx';
import { DashboardActionCard } from '@/shared/components/Dashboard/DashboardActionCard/index.ts';
import { DashboardHero } from '@/shared/components/Dashboard/DashboardHero/index.ts';
import { DashboardNextSteps } from '@/shared/components/Dashboard/DashboardNextSteps/index.ts';
import { DashboardKpiTile } from '@/shared/components/Dashboard/DashboardStatCard/index.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { Boxes, Building2, ShieldCheck, Zap } from '@/shared/icons/index.ts';
import type { MeContext, OrganizationSummary } from '@/shared/tenancy/me-context.ts';

import { DASHBOARD_KEYS, DASHBOARD_NS } from './dashboard.constants.ts';
import { buildDashboardQuickActions } from './dashboard-quick-actions.ts';

function SectionHeading({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-foreground text-base font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-prose text-sm text-pretty">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function OrgOpenAction({ org }: { org: OrganizationSummary & { isActive: boolean } }) {
  const { t } = useTranslation(DASHBOARD_NS);
  if (org.isActive)
    return <Badge variant="outline">{t(DASHBOARD_KEYS.organizations.current)}</Badge>;
  const className = 'text-primary text-sm font-medium hover:underline';
  if (org.slug) {
    return (
      <Link
        to="/organization/$organizationSlug/dashboard"
        params={{ organizationSlug: org.slug }}
        className={className}
        data-testid="dashboard-org-open"
      >
        {t(DASHBOARD_KEYS.organizations.openWorkspace)}
      </Link>
    );
  }
  return (
    <Link to="/dashboard" className={className} data-testid="dashboard-org-open">
      {t(DASHBOARD_KEYS.organizations.openWorkspace)}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-page" className="flex flex-col gap-6">
      <SkeletonShimmer className="h-36 w-full rounded-2xl" />
      <div className={dashboardKpiGrid}>
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
      </div>
      <SkeletonShimmer className="h-56 rounded-xl" />
    </div>
  );
}

function QuickActions({ ctx }: { ctx: MeContext }) {
  const { t } = useTranslation(DASHBOARD_NS);
  const actions = buildDashboardQuickActions(ctx, t);

  return (
    <section aria-label={t(DASHBOARD_KEYS.quickActions.ariaLabel)} className="space-y-3">
      <SectionHeading title={t(DASHBOARD_KEYS.quickActions.heading)} />
      <div className={autoFitActionsGrid}>
        {actions.map((action) => (
          <DashboardActionCard key={action.testId} {...action} />
        ))}
      </div>
    </section>
  );
}

function KpiGrid({ ctx, isTeam }: { ctx: MeContext; isTeam: boolean }) {
  const { t } = useTranslation(DASHBOARD_NS);
  const personalOnly = useDeploymentMode() === 'personal-only';

  const tiles = [
    personalOnly
      ? null
      : {
          icon: Boxes,
          label: t(DASHBOARD_KEYS.stats.workspaces),
          value: ctx.organizations.length,
          hint:
            ctx.organizations.length === 1
              ? t(DASHBOARD_KEYS.stats.workspacesHintOne)
              : t(DASHBOARD_KEYS.stats.workspacesHintMany),
          testId: 'dashboard-stat-workspaces',
        },
    {
      icon: ShieldCheck,
      label: t(DASHBOARD_KEYS.stats.permissions),
      value: ctx.myPermissions.length,
      hint: t(DASHBOARD_KEYS.stats.permissionsHint),
      testId: 'dashboard-stat-permissions',
    },
    personalOnly
      ? null
      : {
          icon: Building2,
          label: t(DASHBOARD_KEYS.stats.type),
          value: isTeam
            ? t(DASHBOARD_KEYS.orgType.team)
            : t(DASHBOARD_KEYS.orgType.personal),
          hint: isTeam
            ? t(DASHBOARD_KEYS.stats.typeHintTeam)
            : t(DASHBOARD_KEYS.stats.typeHintPersonal),
          testId: 'dashboard-stat-type',
        },
    {
      icon: Zap,
      label: t(DASHBOARD_KEYS.stats.billing),
      value: isTeam
        ? t(DASHBOARD_KEYS.stats.billingManaged)
        : t(DASHBOARD_KEYS.stats.billingNone),
      hint: isTeam
        ? t(DASHBOARD_KEYS.stats.billingHintTeam)
        : t(DASHBOARD_KEYS.stats.billingHintPersonal),
      testId: 'dashboard-stat-billing',
    },
  ].filter((tile) => tile !== null);

  return (
    <section
      aria-label={t(DASHBOARD_KEYS.overview.ariaLabel)}
      className={dashboardKpiGrid}
      data-testid="dashboard-kpi-grid"
    >
      {tiles.map((tile) => (
        <DashboardKpiTile key={tile.testId} {...tile} />
      ))}
    </section>
  );
}

/**
 * Workspace dashboard — the landing surface after sign-in. Reads the session
 * context (`useMeContext`) and renders an overview + capability-gated quick
 * actions. Personal organizations show a lighter set (no member/role/billing
 * management); team organizations surface the full toolkit. Shared so both the
 * personal (`/dashboard`) and team route spaces render the same surface (FE-20).
 */
export function Dashboard() {
  const { t } = useTranslation(DASHBOARD_NS);
  const query = useMeContext();

  return (
    <QueryBoundary
      query={query}
      loading={<DashboardSkeleton />}
      errorMessage={t(DASHBOARD_KEYS.errorLoad)}
    >
      {(ctx) => <DashboardContent ctx={ctx} />}
    </QueryBoundary>
  );
}

function DashboardContent({ ctx }: { ctx: MeContext }) {
  const { t } = useTranslation(DASHBOARD_NS);
  const personalOnly = useDeploymentMode() === 'personal-only';

  const org = ctx.activeOrganization;
  const isTeam = org?.type === 'TEAM';
  const firstName =
    ctx.user.firstName ??
    ctx.user.email.split('@')[0] ??
    t(DASHBOARD_KEYS.greetingFallback);

  return (
    <div className="flex flex-col gap-6 sm:gap-8" data-testid="dashboard-page">
      <DashboardHero
        firstName={firstName}
        orgName={org?.name ?? t(DASHBOARD_KEYS.workspaceFallback)}
        orgType={org?.type ?? 'PERSONAL'}
        orgStatus={org?.status}
      />

      <SectionErrorBoundary
        title={t(DASHBOARD_KEYS.nextSteps.heading)}
        testId="dashboard-next-steps-error"
      >
        <DashboardNextSteps ctx={ctx} />
      </SectionErrorBoundary>

      <SectionErrorBoundary
        title={t(DASHBOARD_KEYS.overview.ariaLabel)}
        testId="dashboard-stats-error"
      >
        <KpiGrid ctx={ctx} isTeam={isTeam} />
      </SectionErrorBoundary>

      {!personalOnly ? (
        <SectionErrorBoundary
          title={t(DASHBOARD_KEYS.quickActions.heading)}
          testId="dashboard-actions-error"
        >
          <QuickActions ctx={ctx} />
        </SectionErrorBoundary>
      ) : null}

      {!personalOnly ? (
        <SectionErrorBoundary
          title={t(DASHBOARD_KEYS.highlights.heading)}
          testId="dashboard-highlights-error"
        >
          <DeferredHighlightsCarousel />
        </SectionErrorBoundary>
      ) : null}

      {/*
        One boundary per widget, not one around the section. These three render
        independent data and fail independently, so a throw in the chart used to
        take the roster, the calendar and the section heading down with it —
        three widgets lost to one bug. The heading now stays whichever widget
        breaks, and each fallback offers its own retry.
      */}
      <section
        aria-label={t(DASHBOARD_KEYS.insights.ariaLabel)}
        className="flex flex-col gap-4 sm:gap-5"
      >
        <SectionHeading
          title={t(DASHBOARD_KEYS.insights.heading)}
          description={t(DASHBOARD_KEYS.analytics.description)}
        />
        <SectionErrorBoundary
          title={t(DASHBOARD_KEYS.insights.heading)}
          testId="dashboard-insights-error"
        >
          <DeferredAnalyticsChart />
        </SectionErrorBoundary>
        {/* The roster is a TEAM surface gated on the active org's type — not
            the deployment mode: in a hybrid install a personal workspace is
            still `personalOnly === false` but has no roster to show. */}
        {isTeam && ctx.myPermissions.includes('membership:read') ? (
          <div className={splitMainAsideGrid}>
            <div className={gridCellMinWidth}>
              <SectionErrorBoundary
                title={t(DASHBOARD_KEYS.members.heading)}
                testId="dashboard-members-error"
              >
                <DeferredMembersTable />
              </SectionErrorBoundary>
            </div>
            <div className={gridCellMinWidth}>
              <SectionErrorBoundary
                title={t(DASHBOARD_KEYS.schedule.heading)}
                testId="dashboard-schedule-error"
              >
                <DeferredScheduleCalendar />
              </SectionErrorBoundary>
            </div>
          </div>
        ) : (
          <SectionErrorBoundary
            title={t(DASHBOARD_KEYS.schedule.heading)}
            testId="dashboard-schedule-error"
          >
            <DeferredScheduleCalendar />
          </SectionErrorBoundary>
        )}
      </section>

      {!personalOnly ? (
        <div className={dashboardFooterGrid}>
          <SectionErrorBoundary
            title={t(DASHBOARD_KEYS.overview.ariaLabel)}
            testId="dashboard-theme-error"
          >
            <DeferredThemeShowcase />
          </SectionErrorBoundary>

          {ctx.organizations.length > 1 ? (
            <SectionErrorBoundary
              title={t(DASHBOARD_KEYS.organizations.heading)}
              testId="dashboard-orgs-error"
            >
              <section
                aria-label={t(DASHBOARD_KEYS.organizations.ariaLabel)}
                className="space-y-3"
              >
                <SectionHeading title={t(DASHBOARD_KEYS.organizations.heading)} />
                <div className={autoFitCardsGrid}>
                  {ctx.organizations.map((o) => (
                    <Card
                      key={o.id}
                      className="gap-0 py-0"
                      data-testid="dashboard-org-item"
                    >
                      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
                        <CardTitle className="truncate text-sm">{o.name}</CardTitle>
                        <Badge variant={o.type === 'TEAM' ? 'secondary' : 'outline'}>
                          {o.type === 'TEAM'
                            ? t(DASHBOARD_KEYS.orgType.team)
                            : t(DASHBOARD_KEYS.orgType.personal)}
                        </Badge>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <OrgOpenAction org={o} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            </SectionErrorBoundary>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
