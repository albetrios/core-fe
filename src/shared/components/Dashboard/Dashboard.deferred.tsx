import { type ComponentType, type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { onceAsync, useRetryableLazy } from '@/lib/lazy-module.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { ThemeShowcase } from '@/shared/components/ThemeShowcase/index.ts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';

// Every factory goes through `onceAsync`: one shared in-flight promise per
// chunk, and — the point — a rejection is NOT cached, so a retry refetches
// rather than replaying the failure for the rest of the session (SHELL-3).
// Fallback heights are the widgets' MEASURED natural heights, not round numbers.
// A placeholder that is the wrong height is a layout jump the moment the chunk
// lands: `h-44` under the highlights carousel pushed everything below it down
// 100px on arrival, `h-80` under the schedule calendar 238px, and `h-56` under
// the theme showcase yanked it UP 126px. Measured at the default density on the
// dashboard variant that renders them; a widget whose content varies by variant
// cannot be pixel-exact everywhere, but these remove the visible shift.
const loadAnalyticsChart = onceAsync(() =>
  import('./AnalyticsChart/index.ts').then((m) => ({ default: m.AnalyticsChart })),
);
const loadMembersTable = onceAsync(() =>
  import('./MembersTable/index.ts').then((m) => ({ default: m.MembersTable })),
);
const loadScheduleCalendar = onceAsync(() =>
  import('./ScheduleCalendar/index.ts').then((m) => ({ default: m.ScheduleCalendar })),
);
const loadHighlightsCarousel = onceAsync(() =>
  import('./HighlightsCarousel/index.ts').then((m) => ({
    default: m.HighlightsCarousel,
  })),
);
const loadSourceDonut = onceAsync(() =>
  import('./SourceDonut/index.ts').then((m) => ({ default: m.SourceDonut })),
);
const loadUsageBars = onceAsync(() =>
  import('./UsageBars/index.ts').then((m) => ({ default: m.UsageBars })),
);

/**
 * One deferred dashboard widget: skeleton while its chunk loads, contained
 * failure surface if the chunk never arrives, and a Retry that actually
 * retries.
 *
 * `React.lazy` caches a rejection permanently — its factory is never called
 * again — so resetting the boundary alone re-renders straight back into the
 * same error. `attempt` is therefore part of the memo key: a retry builds a
 * NEW lazy component, which is the only way back out.
 */
function DeferredSection({
  load,
  fallback,
  title,
  testId,
}: {
  load: () => Promise<{ default: ComponentType }>;
  fallback: ReactNode;
  title: string;
  testId: string;
}) {
  const { Component: Widget, retry } = useRetryableLazy(load);

  return (
    <SectionErrorBoundary title={title} testId={testId} onReset={retry}>
      <Suspense fallback={fallback}>
        <Widget />
      </Suspense>
    </SectionErrorBoundary>
  );
}

/** The widget's label and surface stay visible; only its content is pending. */
function WidgetLoading({ title, className }: { title: string; className: string }) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <output className="sr-only">{t(LOCALE_KEYS.loading)}</output>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <SkeletonShimmer className="h-4 w-3/4" />
          <SkeletonShimmer className="h-4 w-full" />
          <SkeletonShimmer className="h-4 w-5/6" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Load chart code while retaining the widget heading and reserved space. */
export function DeferredAnalyticsChart() {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tDashboard } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadAnalyticsChart}
      fallback={
        <WidgetLoading
          title={tDashboard(DASHBOARD_KEYS.analytics.heading)}
          className="h-[360px]"
        />
      }
      title={t(ERRORS_KEYS.widget.analytics)}
      testId="dashboard-analytics-error"
    />
  );
}

/** Defer the roster body without replacing the widget surface. */
export function DeferredMembersTable() {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tDashboard } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadMembersTable}
      fallback={
        <WidgetLoading
          title={tDashboard(DASHBOARD_KEYS.members.heading)}
          className="h-72"
        />
      }
      title={t(ERRORS_KEYS.widget.members)}
      testId="dashboard-members-error"
    />
  );
}

/** Load the calendar with local retry and a stable titled placeholder. */
export function DeferredScheduleCalendar() {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tDashboard } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadScheduleCalendar}
      fallback={
        <WidgetLoading
          title={tDashboard(DASHBOARD_KEYS.schedule.heading)}
          className="h-140"
        />
      }
      title={t(ERRORS_KEYS.widget.schedule)}
      testId="dashboard-schedule-error"
    />
  );
}

/** Load highlight content inside its reserved dashboard slot. */
export function DeferredHighlightsCarousel() {
  const { t } = useTranslation(ERRORS_NS);
  const { t: tDashboard } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadHighlightsCarousel}
      fallback={
        <WidgetLoading
          title={tDashboard(DASHBOARD_KEYS.highlights.heading)}
          className="h-69"
        />
      }
      title={t(ERRORS_KEYS.widget.highlights)}
      testId="dashboard-highlights-error"
    />
  );
}

/** Theme controls use local state, so render them with the dashboard immediately. */
export function DeferredThemeShowcase() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <SectionErrorBoundary
      title={t(ERRORS_KEYS.widget.themeShowcase)}
      testId="dashboard-theme-error"
    >
      <ThemeShowcase />
    </SectionErrorBoundary>
  );
}

/**
 * Weekly usage bars (recharts stays off first paint).
 *
 * Carries its own boundary like every other widget in this file, rather than
 * borrowing one from the section around it: only a boundary wired to
 * `useRetryableLazy`'s `retry` can actually recover from a failed chunk, and
 * `React.lazy` caches a rejection for the rest of the session (SHELL-3).
 */
export function DeferredUsageBars() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadUsageBars}
      fallback={
        <WidgetLoading title={t(DASHBOARD_KEYS.usageBars.heading)} className="h-72" />
      }
      title={t(DASHBOARD_KEYS.usageBars.heading)}
      testId="dashboard-usage-bars-error"
    />
  );
}

/** Sessions-by-source donut (recharts stays off first paint), same contract. */
export function DeferredSourceDonut() {
  const { t } = useTranslation(DASHBOARD_NS);
  return (
    <DeferredSection
      load={loadSourceDonut}
      fallback={
        <WidgetLoading title={t(DASHBOARD_KEYS.donut.heading)} className="h-80" />
      }
      title={t(DASHBOARD_KEYS.donut.heading)}
      testId="dashboard-donut-error"
    />
  );
}
