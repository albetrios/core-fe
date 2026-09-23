import { useTranslation } from 'react-i18next';

import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DeferredAnalyticsChart,
  DeferredMembersTable,
} from '@/shared/components/Dashboard/Dashboard.deferred.tsx';
import {
  ActionsSection,
  ActivityFeedSection,
  AiCardSection,
  BillingSection,
  FocusTimerSection,
  FunnelSection,
  GanttSection,
  HeatmapSection,
  HighlightsSection,
  InsightsFrame,
  LeaderboardSection,
  MapSection,
  MetersSection,
  NextStepsSection,
  OrgsPanel,
  RadarSection,
  RankingSection,
  SchedulePanel,
  SourceDonutSection,
  StatsSection,
  ThemePanel,
  TimelineSection,
  TrendsSection,
  UsageBarsSection,
} from '@/shared/components/Dashboard/Dashboard.shared.tsx';
import {
  canReadRoster,
  type DashboardViewProps,
} from '@/shared/components/Dashboard/dashboard-view.ts';
import { DashboardHero } from '@/shared/components/Dashboard/DashboardHero/index.ts';
import { DashboardPulseGauge } from '@/shared/components/Dashboard/DashboardPulseGauge/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';

const wide = 'min-w-0 lg:col-span-8';
const narrow = 'min-w-0 lg:col-span-4';
const full = 'min-w-0 lg:col-span-12';

/**
 * Variant 3 — "Bento": the magazine grid. Every dashboard section at once on
 * a 12-column bento layout — trends beside the source donut, the chart beside
 * a gauge/leaderboard stack, the month timeline beside the schedule — for
 * people who want the whole workspace on one screen.
 */
export function DashboardBento({ ctx, isTeam, personalOnly, hero }: DashboardViewProps) {
  const { t } = useTranslation(DASHBOARD_NS);

  return (
    <div className="flex flex-col gap-4 sm:gap-5" data-testid="dashboard-page">
      <DashboardHero {...hero} />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <div className={wide}>
          <TrendsSection />
        </div>
        <div className={narrow}>
          <SourceDonutSection />
        </div>

        <div className={full}>
          <StatsSection ctx={ctx} isTeam={isTeam} accentFirst />
        </div>

        <div className={full}>
          <MapSection />
        </div>

        <div className={wide}>
          <UsageBarsSection />
        </div>
        <div className={narrow}>
          <FocusTimerSection />
        </div>

        <div className={wide}>
          <InsightsFrame>
            <DeferredAnalyticsChart />
          </InsightsFrame>
        </div>
        <div className={`${narrow} flex flex-col gap-4 sm:gap-5`}>
          <DashboardPulseGauge />
          <RankingSection />
        </div>

        <div className="min-w-0 lg:col-span-4">
          <FunnelSection />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <RadarSection />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <LeaderboardSection />
        </div>

        <div className={wide}>
          <GanttSection />
        </div>
        <div className={narrow}>
          <SchedulePanel />
        </div>

        <div className={wide}>
          <TimelineSection />
        </div>
        <div className={narrow}>
          <HeatmapSection />
        </div>

        <div className="min-w-0 lg:col-span-7">
          <NextStepsSection ctx={ctx} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ActivityFeedSection />
        </div>

        <div className="min-w-0 lg:col-span-4">
          <MetersSection />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <BillingSection />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <AiCardSection />
        </div>

        {canReadRoster(ctx, isTeam) ? (
          <div className={full}>
            <SectionErrorBoundary
              title={t(DASHBOARD_KEYS.members.heading)}
              testId="dashboard-roster-error"
            >
              <DeferredMembersTable />
            </SectionErrorBoundary>
          </div>
        ) : null}

        {!personalOnly ? (
          <>
            <div className={wide}>
              <ActionsSection ctx={ctx} tinted />
            </div>
            <div className={narrow}>
              <ThemePanel />
            </div>
            <div className={full}>
              <HighlightsSection />
            </div>
            <div className={full}>
              <OrgsPanel />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
