import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AnalyticsChart/index.ts', () => ({
  AnalyticsChart: () => <div data-testid="analytics-chart-stub" />,
}));
/*
 * A chunk that fails once, then succeeds — the only way to exercise the RETRY
 * half. Stateful because Vitest caches a mock factory's RESOLVED exports and
 * never calls the factory again, while rejections are NOT cached; that is the
 * same mechanism `useRetryableLazy` + `onceAsync` rely on in production.
 */
const { scheduleChunk } = vi.hoisted(() => ({ scheduleChunk: { failuresLeft: 1 } }));
vi.mock('./ScheduleCalendar/index.ts', async () => {
  if (scheduleChunk.failuresLeft > 0) {
    scheduleChunk.failuresLeft -= 1;
    await Promise.reject(new Error('Failed to fetch dynamically imported module'));
  }
  return { ScheduleCalendar: () => <div data-testid="schedule-stub" /> };
});
vi.mock('./MembersTable/index.ts', () => ({
  MembersTable: vi.fn(() => <div data-testid="members-table-stub" />),
}));
vi.mock('@/shared/components/ThemeShowcase/index.ts', () => ({
  ThemeShowcase: () => <div data-testid="theme-showcase-stub" />,
}));
vi.mock('./HighlightsCarousel/index.ts', () => ({
  HighlightsCarousel: () => <div data-testid="highlights-stub" />,
}));
vi.mock('./SourceDonut/index.ts', () => ({
  SourceDonut: () => <div data-testid="donut-stub" />,
}));
vi.mock('./UsageBars/index.ts', () => ({
  UsageBars: () => <div data-testid="usage-stub" />,
}));

import {
  DeferredAnalyticsChart,
  DeferredHighlightsCarousel,
  DeferredMembersTable,
  DeferredScheduleCalendar,
  DeferredSourceDonut,
  DeferredThemeShowcase,
  DeferredUsageBars,
} from './Dashboard.deferred.tsx';

describe('Dashboard.deferred', () => {
  it.each([
    [DeferredHighlightsCarousel, 'highlights-stub'],
    [DeferredSourceDonut, 'donut-stub'],
    [DeferredUsageBars, 'usage-stub'],
  ] as const)(
    'keeps a real widget heading while content loads (%s)',
    async (Widget, id) => {
      const { container } = render(<Widget />);
      expect(container.querySelector('[data-slot="card-title"]')).toHaveTextContent(/\S/);
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(await screen.findByTestId(id)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );

  it('lazy-loads analytics chart', async () => {
    render(<DeferredAnalyticsChart />);
    expect(await screen.findByTestId('analytics-chart-stub')).toBeInTheDocument();
  });

  it('renders local theme controls immediately without a loading placeholder', () => {
    render(<DeferredThemeShowcase />);
    expect(screen.getByTestId('theme-showcase-stub')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /*
   * DASH-2 lives HERE, not in the dashboard layout: containment is per widget
   * because each Deferred* carries its own boundary. Dashboard.test.tsx asserts
   * that the neighbours survive given that contract; this asserts the contract
   * itself, so the two cannot both pass on a component that lost its boundary.
   */
  it('contains a throwing widget in its own boundary', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { MembersTable } = await import('./MembersTable/index.ts');
    // Not `mockImplementationOnce`: React throws away the suspended render and
    // retries synchronously, so a one-shot mock is spent before the pass that
    // actually commits — and the widget renders normally.
    vi.mocked(MembersTable).mockImplementation(() => {
      throw new Error('roster exploded');
    });
    try {
      render(<DeferredMembersTable />);
      expect(await screen.findByTestId('dashboard-members-error')).toBeInTheDocument();
    } finally {
      vi.mocked(MembersTable).mockImplementation(() => (
        <div data-testid="members-table-stub" />
      ));
      consoleError.mockRestore();
    }
  });

  /*
   * The containment test above proves a throw is CAUGHT. This proves the other
   * half — that Retry actually recovers. It matters because `React.lazy` caches
   * a rejection permanently: resetting the boundary alone re-renders straight
   * back into the same error. `useRetryableLazy` builds a NEW lazy component per
   * attempt and `onceAsync` does not cache rejections (lazy-module.ts:23-26), so
   * the refetch is real. Untested until now.
   */
  it('recovers when Retry is pressed after a failed chunk', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    try {
      render(<DeferredScheduleCalendar />);

      const retry = await screen.findByRole('button', { name: /retry/i });
      expect(screen.queryByTestId('schedule-stub')).not.toBeInTheDocument();

      await user.click(retry);

      expect(await screen.findByTestId('schedule-stub')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
