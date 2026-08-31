import { lazy, type ReactNode, Suspense } from 'react';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';

const LazyAnalyticsChart = lazy(() =>
  import('./AnalyticsChart/index.ts').then((m) => ({ default: m.AnalyticsChart })),
);
const LazyMembersTable = lazy(() =>
  import('./MembersTable/index.ts').then((m) => ({ default: m.MembersTable })),
);
const LazyScheduleCalendar = lazy(() =>
  import('./ScheduleCalendar/index.ts').then((m) => ({ default: m.ScheduleCalendar })),
);
const LazyHighlightsCarousel = lazy(() =>
  import('./HighlightsCarousel/index.ts').then((m) => ({
    default: m.HighlightsCarousel,
  })),
);
const LazyThemeShowcase = lazy(() =>
  import('@/shared/components/ThemeShowcase/index.ts').then((m) => ({
    default: m.ThemeShowcase,
  })),
);
const LazySourceDonut = lazy(() =>
  import('./SourceDonut/index.ts').then((m) => ({ default: m.SourceDonut })),
);
const LazyUsageBars = lazy(() =>
  import('./UsageBars/index.ts').then((m) => ({ default: m.UsageBars })),
);

function DeferredSection({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

export function DeferredAnalyticsChart() {
  return (
    <DeferredSection
      fallback={<SkeletonShimmer className="h-[360px] w-full rounded-xl" />}
    >
      <LazyAnalyticsChart />
    </DeferredSection>
  );
}

export function DeferredMembersTable() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-72 w-full rounded-xl" />}>
      <LazyMembersTable />
    </DeferredSection>
  );
}

export function DeferredScheduleCalendar() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-80 w-full rounded-xl" />}>
      <LazyScheduleCalendar />
    </DeferredSection>
  );
}

export function DeferredHighlightsCarousel() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-44 w-full rounded-xl" />}>
      <LazyHighlightsCarousel />
    </DeferredSection>
  );
}

export function DeferredThemeShowcase() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-56 w-full rounded-xl" />}>
      <LazyThemeShowcase />
    </DeferredSection>
  );
}

/** Lazily loads the weekly usage bars (recharts stays off first paint). */
export function DeferredUsageBars() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-72 w-full rounded-xl" />}>
      <LazyUsageBars />
    </DeferredSection>
  );
}

/** Lazily loads the sessions-by-source donut (recharts stays off first paint). */
export function DeferredSourceDonut() {
  return (
    <DeferredSection fallback={<SkeletonShimmer className="h-80 w-full rounded-xl" />}>
      <LazySourceDonut />
    </DeferredSection>
  );
}
