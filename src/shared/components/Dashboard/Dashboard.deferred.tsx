import { type ComponentType, type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { onceAsync, useRetryableLazy } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';

// Every factory goes through `onceAsync`: one shared in-flight promise per
// chunk, and — the point — a rejection is NOT cached, so a retry refetches
// rather than replaying the failure for the rest of the session (SHELL-3).
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
const loadThemeShowcase = onceAsync(() =>
  import('@/shared/components/ThemeShowcase/index.ts').then((m) => ({
    default: m.ThemeShowcase,
  })),
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

export function DeferredAnalyticsChart() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <DeferredSection
      load={loadAnalyticsChart}
      fallback={<SkeletonShimmer className="h-[360px] w-full rounded-xl" />}
      title={t(ERRORS_KEYS.widget.analytics)}
      testId="dashboard-analytics-error"
    />
  );
}

export function DeferredMembersTable() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <DeferredSection
      load={loadMembersTable}
      fallback={<SkeletonShimmer className="h-72 w-full rounded-xl" />}
      title={t(ERRORS_KEYS.widget.members)}
      testId="dashboard-members-error"
    />
  );
}

export function DeferredScheduleCalendar() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <DeferredSection
      load={loadScheduleCalendar}
      fallback={<SkeletonShimmer className="h-80 w-full rounded-xl" />}
      title={t(ERRORS_KEYS.widget.schedule)}
      testId="dashboard-schedule-error"
    />
  );
}

export function DeferredHighlightsCarousel() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <DeferredSection
      load={loadHighlightsCarousel}
      fallback={<SkeletonShimmer className="h-44 w-full rounded-xl" />}
      title={t(ERRORS_KEYS.widget.highlights)}
      testId="dashboard-highlights-error"
    />
  );
}

export function DeferredThemeShowcase() {
  const { t } = useTranslation(ERRORS_NS);
  return (
    <DeferredSection
      load={loadThemeShowcase}
      fallback={<SkeletonShimmer className="h-56 w-full rounded-xl" />}
      title={t(ERRORS_KEYS.widget.themeShowcase)}
      testId="dashboard-theme-error"
    />
  );
}
