import {
  dashboardFooterGrid,
  gridCellMinWidth,
  splitMainAsideGrid,
} from '@/lib/responsive-grid.ts';
import {
  DeferredAnalyticsChart,
  DeferredMembersTable,
  DeferredScheduleCalendar,
} from '@/shared/components/Dashboard/Dashboard.deferred.tsx';
import {
  ActionsSection,
  ActivityFeedSection,
  HeatmapSection,
  HighlightsSection,
  InsightsFrame,
  NextStepsSection,
  OrgsPanel,
  StatsSection,
  ThemePanel,
  TimelineSection,
} from '@/shared/components/Dashboard/Dashboard.shared.tsx';
import {
  canReadRoster,
  type DashboardViewProps,
} from '@/shared/components/Dashboard/dashboard-view.ts';
import { DashboardHero } from '@/shared/components/Dashboard/DashboardHero/index.ts';
import { DashboardPulseGauge } from '@/shared/components/Dashboard/DashboardPulseGauge/index.ts';

/**
 * Variant 2 — "Pulse": the analytics-first read. KPIs sit right under the
 * hero, the insights block leads the page inside a primary-washed frame
 * (chart + roster/schedule), and a gauge-led band pairs the pulse ring with
 * the quick actions and next steps. Highlights and the theme/org footer
 * trail for people who land here to check the numbers, not to onboard.
 */
export function DashboardPulse({ ctx, isTeam, personalOnly, hero }: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8" data-testid="dashboard-page">
      <DashboardHero {...hero} />

      <StatsSection ctx={ctx} isTeam={isTeam} />

      <InsightsFrame framed>
        <DeferredAnalyticsChart />
        <TimelineSection />
        <HeatmapSection />
        {canReadRoster(ctx, isTeam) ? (
          <div className={splitMainAsideGrid}>
            <div className={gridCellMinWidth}>
              <DeferredMembersTable />
            </div>
            <div className={gridCellMinWidth}>
              <DeferredScheduleCalendar />
            </div>
          </div>
        ) : (
          <DeferredScheduleCalendar />
        )}
      </InsightsFrame>

      <div className={splitMainAsideGrid}>
        <div className={`${gridCellMinWidth} flex flex-col gap-6 sm:gap-8`}>
          {!personalOnly ? <ActionsSection ctx={ctx} tinted /> : null}

          <NextStepsSection ctx={ctx} />
        </div>
        <div className={`${gridCellMinWidth} flex flex-col gap-6 sm:gap-8`}>
          <DashboardPulseGauge />

          <ActivityFeedSection />
        </div>
      </div>

      {!personalOnly ? <HighlightsSection /> : null}

      {!personalOnly ? (
        <div className={dashboardFooterGrid}>
          <ThemePanel />
          <OrgsPanel />
        </div>
      ) : null}
    </div>
  );
}
