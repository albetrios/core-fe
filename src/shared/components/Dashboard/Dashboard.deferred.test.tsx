import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AnalyticsChart/index.ts', () => ({
  AnalyticsChart: () => <div data-testid="analytics-chart-stub" />,
}));
vi.mock('./MembersTable/index.ts', () => ({
  MembersTable: vi.fn(() => <div data-testid="members-table-stub" />),
}));
vi.mock('@/shared/components/ThemeShowcase/index.ts', () => ({
  ThemeShowcase: () => <div data-testid="theme-showcase-stub" />,
}));

import {
  DeferredAnalyticsChart,
  DeferredMembersTable,
  DeferredThemeShowcase,
} from './Dashboard.deferred.tsx';

describe('Dashboard.deferred', () => {
  it('lazy-loads analytics chart', async () => {
    render(<DeferredAnalyticsChart />);
    expect(await screen.findByTestId('analytics-chart-stub')).toBeInTheDocument();
  });

  it('lazy-loads theme showcase', async () => {
    render(<DeferredThemeShowcase />);
    expect(await screen.findByTestId('theme-showcase-stub')).toBeInTheDocument();
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
});
