import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DeferredAnalyticsChart,
  DeferredHighlightsCarousel,
  DeferredMembersTable,
  DeferredScheduleCalendar,
  DeferredSourceDonut,
  DeferredThemeShowcase,
  DeferredUsageBars,
} from './Dashboard.deferred.tsx';

// Stub every lazy chunk: these tests prove each deferred wrapper mounts its
// child through Suspense — the widgets themselves have their own suites.
vi.mock('./AnalyticsChart/index.ts', () => ({
  AnalyticsChart: () => <div data-testid="stub-analytics" />,
}));
vi.mock('./MembersTable/index.ts', () => ({
  MembersTable: () => <div data-testid="stub-members" />,
}));
vi.mock('./ScheduleCalendar/index.ts', () => ({
  ScheduleCalendar: () => <div data-testid="stub-schedule" />,
}));
vi.mock('./HighlightsCarousel/index.ts', () => ({
  HighlightsCarousel: () => <div data-testid="stub-highlights" />,
}));
vi.mock('@/shared/components/ThemeShowcase/index.ts', () => ({
  ThemeShowcase: () => <div data-testid="stub-showcase" />,
}));
vi.mock('./SourceDonut/index.ts', () => ({
  SourceDonut: () => <div data-testid="stub-donut" />,
}));
vi.mock('./UsageBars/index.ts', () => ({
  UsageBars: () => <div data-testid="stub-bars" />,
}));

const CASES = [
  { name: 'DeferredAnalyticsChart', El: DeferredAnalyticsChart, stub: 'stub-analytics' },
  { name: 'DeferredMembersTable', El: DeferredMembersTable, stub: 'stub-members' },
  {
    name: 'DeferredScheduleCalendar',
    El: DeferredScheduleCalendar,
    stub: 'stub-schedule',
  },
  {
    name: 'DeferredHighlightsCarousel',
    El: DeferredHighlightsCarousel,
    stub: 'stub-highlights',
  },
  { name: 'DeferredThemeShowcase', El: DeferredThemeShowcase, stub: 'stub-showcase' },
  { name: 'DeferredSourceDonut', El: DeferredSourceDonut, stub: 'stub-donut' },
  { name: 'DeferredUsageBars', El: DeferredUsageBars, stub: 'stub-bars' },
] as const;

describe('Dashboard deferred shells', () => {
  it.each(CASES)('$name suspends into its lazy widget', async ({ El, stub }) => {
    render(<El />);
    expect(await screen.findByTestId(stub)).toBeInTheDocument();
  });
});
