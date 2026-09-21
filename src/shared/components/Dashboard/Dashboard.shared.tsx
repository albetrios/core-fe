import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  autoFitActionsGrid,
  autoFitCardsGrid,
  dashboardKpiGrid,
} from '@/lib/responsive-grid.ts';
import { AiAssistantCard } from '@/shared/components/Dashboard/AiAssistantCard/index.ts';
import { AutomationLeaderboard } from '@/shared/components/Dashboard/AutomationLeaderboard/index.ts';
import { BillingSummary } from '@/shared/components/Dashboard/BillingSummary/index.ts';
import { ContributionHeatmap } from '@/shared/components/Dashboard/ContributionHeatmap/index.ts';
import { ConversionFunnel } from '@/shared/components/Dashboard/ConversionFunnel/index.ts';
import {
  DeferredHighlightsCarousel,
  DeferredScheduleCalendar,
  DeferredSourceDonut,
  DeferredThemeShowcase,
  DeferredUsageBars,
} from '@/shared/components/Dashboard/Dashboard.deferred.tsx';
import { DashboardActionCard } from '@/shared/components/Dashboard/DashboardActionCard/index.ts';
import { DashboardActivityFeed } from '@/shared/components/Dashboard/DashboardActivityFeed/index.ts';
import { DashboardNextSteps } from '@/shared/components/Dashboard/DashboardNextSteps/index.ts';
import { DashboardKpiTile } from '@/shared/components/Dashboard/DashboardStatCard/index.ts';
import { FocusTimer } from '@/shared/components/Dashboard/FocusTimer/index.ts';
import { GlobalActivityMap } from '@/shared/components/Dashboard/GlobalActivityMap/index.ts';
import { HealthRadar } from '@/shared/components/Dashboard/HealthRadar/index.ts';
import { MiniGantt } from '@/shared/components/Dashboard/MiniGantt/index.ts';
import { PlanUsageMeters } from '@/shared/components/Dashboard/PlanUsageMeters/index.ts';
import { TimelineStrip } from '@/shared/components/Dashboard/TimelineStrip/index.ts';
import { TrendStrip } from '@/shared/components/Dashboard/TrendStrip/index.ts';
import { UsageRanking } from '@/shared/components/Dashboard/UsageRanking/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { Boxes, Building, ShieldCheck, Zap } from '@/shared/icons/index.ts';
import type { MeContext, OrganizationSummary } from '@/shared/tenancy/me-context.ts';

import { DASHBOARD_KEYS, DASHBOARD_NS } from './dashboard.constants.ts';
import { buildDashboardQuickActions } from './dashboard-quick-actions.ts';

/** Small heading + optional description used by every dashboard section. */
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

/** Onboarding checklist, wrapped in its section error boundary. */
export function NextStepsSection({ ctx }: { ctx: MeContext }) {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.nextSteps.heading)}
      testId="dashboard-next-steps-error"
    >
      <DashboardNextSteps ctx={ctx} />
    </SectionErrorBoundary>
  );
}

/** KPI tile row (workspaces/permissions/type/billing), with error boundary.
 *  `accentFirst` inverts the lead tile onto the primary surface (variant flair). */
export function StatsSection({
  ctx,
  isTeam,
  accentFirst = false,
}: {
  ctx: MeContext;
  isTeam: boolean;
  accentFirst?: boolean;
}) {
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
          icon: Building,
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
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.overview.ariaLabel)}
      testId="dashboard-stats-error"
    >
      <section
        aria-label={t(DASHBOARD_KEYS.overview.ariaLabel)}
        className={dashboardKpiGrid}
        data-testid="dashboard-kpi-grid"
      >
        {tiles.map((tile, index) => (
          <DashboardKpiTile
            key={tile.testId}
            {...tile}
            emphasis={accentFirst && index === 0 ? 'accent' : 'default'}
          />
        ))}
      </section>
    </SectionErrorBoundary>
  );
}

/** Pastel washes cycled over tinted quick actions — the chart palette drives
 *  them so the Shuffle re-inks the cards (reference-board flair). */
const ACTION_TINTS = [
  'bg-chart-1/10 border-chart-1/25 hover:bg-chart-1/15 hover:border-chart-1/40',
  'bg-chart-2/10 border-chart-2/25 hover:bg-chart-2/15 hover:border-chart-2/40',
  'bg-chart-3/10 border-chart-3/25 hover:bg-chart-3/15 hover:border-chart-3/40',
] as const;

/** Permission-gated quick-action tiles; `dense` stacks them as a rail list and
 *  `tinted` washes each card with a rotating chart-palette pastel. */
export function ActionsSection({
  ctx,
  dense = false,
  tinted = false,
}: {
  ctx: MeContext;
  dense?: boolean;
  tinted?: boolean;
}) {
  const { t } = useTranslation(DASHBOARD_NS);
  const actions = buildDashboardQuickActions(ctx, t);

  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.quickActions.heading)}
      testId="dashboard-actions-error"
    >
      <section
        aria-label={t(DASHBOARD_KEYS.quickActions.ariaLabel)}
        className="space-y-3"
      >
        <SectionHeading title={t(DASHBOARD_KEYS.quickActions.heading)} />
        <div className={dense ? 'grid grid-cols-1 gap-2' : autoFitActionsGrid}>
          {actions.map((action, index) => (
            <DashboardActionCard
              key={action.testId}
              {...action}
              tintClassName={
                tinted ? ACTION_TINTS[index % ACTION_TINTS.length] : undefined
              }
            />
          ))}
        </div>
      </section>
    </SectionErrorBoundary>
  );
}

/** Dotted-world activity map, wrapped in its section error boundary. */
export function MapSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.map.heading)}
      testId="dashboard-map-error"
    >
      <GlobalActivityMap />
    </SectionErrorBoundary>
  );
}

/** Sparkline trend cards (usage deltas), wrapped in its error boundary. */
export function TrendsSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.trends.heading)}
      testId="dashboard-trends-error"
    >
      <TrendStrip />
    </SectionErrorBoundary>
  );
}

/**
 * Sessions-by-source donut (lazy chart). The boundary lives inside
 * `DeferredSourceDonut` — same testId — because only the one wired to the
 * lazy loader's `retry` can recover from a failed chunk (SHELL-3). Wrapping it
 * again here would just shadow that fallback with a dead retry button.
 */
export function SourceDonutSection() {
  return <DeferredSourceDonut />;
}

/** Feature-usage leaderboard, wrapped in its section error boundary. */
export function RankingSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.ranking.heading)}
      testId="dashboard-ranking-error"
    >
      <UsageRanking />
    </SectionErrorBoundary>
  );
}

/** Month timeline strip, wrapped in its section error boundary. */
export function TimelineSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.timeline.heading)}
      testId="dashboard-timeline-error"
    >
      <TimelineStrip />
    </SectionErrorBoundary>
  );
}

/** Weekly usage bars (lazy chart) — boundary inside, same reason as above. */
export function UsageBarsSection() {
  return <DeferredUsageBars />;
}

/** Contribution heatmap, wrapped in its section error boundary. */
export function HeatmapSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.heatmap.heading)}
      testId="dashboard-heatmap-error"
    >
      <ContributionHeatmap />
    </SectionErrorBoundary>
  );
}

/** Acquisition funnel, wrapped in its section error boundary. */
export function FunnelSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.funnel.heading)}
      testId="dashboard-funnel-error"
    >
      <ConversionFunnel />
    </SectionErrorBoundary>
  );
}

/** Workspace-health radar, wrapped in its section error boundary. */
export function RadarSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.radar.heading)}
      testId="dashboard-radar-error"
    >
      <HealthRadar />
    </SectionErrorBoundary>
  );
}

/** Automation leaderboard, wrapped in its section error boundary. */
export function LeaderboardSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.leaderboard.heading)}
      testId="dashboard-leaderboard-error"
    >
      <AutomationLeaderboard />
    </SectionErrorBoundary>
  );
}

/** Focus timer, wrapped in its section error boundary. */
export function FocusTimerSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.focus.heading)}
      testId="dashboard-focus-error"
    >
      <FocusTimer />
    </SectionErrorBoundary>
  );
}

/** Mini gantt, wrapped in its section error boundary. */
export function GanttSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.timeline.heading)}
      testId="dashboard-gantt-error"
    >
      <MiniGantt />
    </SectionErrorBoundary>
  );
}

/** Plan usage meters, wrapped in its section error boundary. */
export function MetersSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.meters.heading)}
      testId="dashboard-meters-error"
    >
      <PlanUsageMeters />
    </SectionErrorBoundary>
  );
}

/** Billing summary, wrapped in its section error boundary. */
export function BillingSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.billingCard.heading)}
      testId="dashboard-billing-error"
    >
      <BillingSummary />
    </SectionErrorBoundary>
  );
}

/** Command-palette assistant card, wrapped in its section error boundary. */
export function AiCardSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.ai.heading)}
      testId="dashboard-ai-error"
    >
      <AiAssistantCard />
    </SectionErrorBoundary>
  );
}

/** Recent-activity feed, wrapped in its section error boundary. */
export function ActivityFeedSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.activity.heading)}
      testId="dashboard-activity-error"
    >
      <DashboardActivityFeed />
    </SectionErrorBoundary>
  );
}

/** Highlights carousel, wrapped in its section error boundary. */
export function HighlightsSection() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.highlights.heading)}
      testId="dashboard-highlights-error"
    >
      <DeferredHighlightsCarousel />
    </SectionErrorBoundary>
  );
}

/** Insights shell — error boundary + labelled section + heading; variants fill
 *  it with the chart and whichever roster/schedule arrangement they use.
 *  `framed` tints the body as one primary-washed panel (variant flair). */
export function InsightsFrame({
  children,
  framed = false,
}: {
  children: ReactNode;
  framed?: boolean;
}) {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.insights.heading)}
      testId="dashboard-insights-error"
    >
      <section
        aria-label={t(DASHBOARD_KEYS.insights.ariaLabel)}
        className="flex flex-col gap-4 sm:gap-5"
      >
        <SectionHeading
          title={t(DASHBOARD_KEYS.insights.heading)}
          description={t(DASHBOARD_KEYS.analytics.description)}
        />
        {framed ? (
          <div
            data-slot="card"
            className="border-primary/20 from-primary/10 via-card to-card flex flex-col gap-4 rounded-2xl border bg-gradient-to-br p-3 sm:gap-5 sm:p-4"
          >
            {children}
          </div>
        ) : (
          children
        )}
      </section>
    </SectionErrorBoundary>
  );
}

/** Schedule calendar as a standalone rail panel, with its own boundary. */
export function SchedulePanel() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.schedule.heading)}
      testId="dashboard-schedule-error"
    >
      <DeferredScheduleCalendar />
    </SectionErrorBoundary>
  );
}

/** Workspace theme strip (Shuffle/Customize), with its own boundary. */
export function ThemePanel() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <SectionErrorBoundary
      title={t(DASHBOARD_KEYS.overview.ariaLabel)}
      testId="dashboard-theme-error"
    >
      <DeferredThemeShowcase />
    </SectionErrorBoundary>
  );
}

/** Org-switcher card grid; renders nothing with fewer than two organizations. */
export function OrgsPanel({ ctx }: { ctx: MeContext }) {
  const { t } = useTranslation(DASHBOARD_NS);
  if (ctx.organizations.length <= 1) return null;

  return (
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
            <Card key={o.id} className="gap-0 py-0" data-testid="dashboard-org-item">
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
  );
}
