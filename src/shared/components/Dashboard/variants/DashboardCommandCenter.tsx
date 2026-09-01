import { gridCellMinWidth, splitMainAsideGrid } from '@/lib/responsive-grid.ts';
import { cn } from '@/lib/utils.ts';
import {
  DeferredAnalyticsChart,
  DeferredMembersTable,
} from '@/shared/components/Dashboard/Dashboard.deferred.tsx';
import {
  ActionsSection,
  ActivityFeedSection,
  FocusTimerSection,
  HighlightsSection,
  InsightsFrame,
  NextStepsSection,
  OrgsPanel,
  RankingSection,
  SchedulePanel,
  SourceDonutSection,
  StatsSection,
  ThemePanel,
  UsageBarsSection,
} from '@/shared/components/Dashboard/Dashboard.shared.tsx';
import {
  canReadRoster,
  type DashboardViewProps,
} from '@/shared/components/Dashboard/dashboard-view.ts';
import { DashboardHero } from '@/shared/components/Dashboard/DashboardHero/index.ts';
import { DashboardPulseGauge } from '@/shared/components/Dashboard/DashboardPulseGauge/index.ts';

const columnClassName = cn(gridCellMinWidth, 'flex flex-col gap-5 sm:gap-6');

/**
 * Variant 1 — "Command center": a dense two-column arrangement. The wide main
 * column carries the numbers (accent-led KPIs → chart → roster → highlights);
 * the side rail stacks the pulse gauge, to-dos, and tools (next steps, quick
 * actions as a list, the schedule, and the theme strip) so everything is
 * reachable near the fold.
 */
export function DashboardCommandCenter({
  ctx,
  isTeam,
  personalOnly,
  hero,
}: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6" data-testid="dashboard-page">
      <DashboardHero {...hero} />

      <div className={splitMainAsideGrid}>
        <div className={columnClassName}>
          <StatsSection ctx={ctx} isTeam={isTeam} accentFirst />

          <InsightsFrame>
            <DeferredAnalyticsChart />
            {canReadRoster(ctx, isTeam) ? (
              <div className={splitMainAsideGrid}>
                <div className={gridCellMinWidth}>
                  <DeferredMembersTable />
                </div>
                <div className={gridCellMinWidth}>
                  <SourceDonutSection />
                </div>
              </div>
            ) : (
              <SourceDonutSection />
            )}
          </InsightsFrame>

          <UsageBarsSection />

          {!personalOnly ? <HighlightsSection /> : null}
        </div>

        <div className={columnClassName}>
          <FocusTimerSection />

          <DashboardPulseGauge />

          <RankingSection />

          <NextStepsSection ctx={ctx} />

          {!personalOnly ? <ActionsSection ctx={ctx} dense /> : null}

          <SchedulePanel />

          <ActivityFeedSection />

          {!personalOnly ? <ThemePanel /> : null}
        </div>
      </div>

      {!personalOnly ? <OrgsPanel ctx={ctx} /> : null}
    </div>
  );
}
