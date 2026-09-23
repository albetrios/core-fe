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
  AiCardSection,
  HighlightsSection,
  InsightsFrame,
  MetersSection,
  NextStepsSection,
  OrgsPanel,
  StatsSection,
  ThemePanel,
  TrendsSection,
} from '@/shared/components/Dashboard/Dashboard.shared.tsx';
import {
  canReadRoster,
  type DashboardViewProps,
} from '@/shared/components/Dashboard/dashboard-view.ts';
import { DashboardHero } from '@/shared/components/Dashboard/DashboardHero/index.ts';

/**
 * Variant 0 — "Classic": the onboarding-first stack (hero → next steps → KPIs
 * → quick actions → highlights → insights → activity/theme footer → orgs).
 * Mirrors the original single-column dashboard, plus the common activity feed.
 */
export function DashboardClassic({
  ctx,
  isTeam,
  personalOnly,
  hero,
}: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8" data-testid="dashboard-page">
      <DashboardHero {...hero} />

      <NextStepsSection ctx={ctx} />

      <StatsSection ctx={ctx} isTeam={isTeam} />

      <TrendsSection />

      {!personalOnly ? <ActionsSection ctx={ctx} /> : null}

      {!personalOnly ? <HighlightsSection /> : null}

      <InsightsFrame>
        <DeferredAnalyticsChart />
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

      <div className={dashboardFooterGrid}>
        <ActivityFeedSection />
        <div className="flex flex-col gap-6 sm:gap-8">
          <MetersSection />
          {!personalOnly ? <ThemePanel /> : null}
        </div>
      </div>

      <AiCardSection />

      {!personalOnly ? <OrgsPanel /> : null}
    </div>
  );
}
