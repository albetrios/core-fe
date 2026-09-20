import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

import { DASHBOARD_TEST_IDS } from '@/shared/components/Dashboard/dashboard.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { HighlightsCarousel } from './HighlightsCarousel.tsx';

describe('HighlightsCarousel', () => {
  it('renders a spotlight card with tabs, progress rail, and navigation', async () => {
    renderWithProviders(<HighlightsCarousel />);

    expect(
      await screen.findByTestId(DASHBOARD_TEST_IDS.highlightsCarousel),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Curated ways to get more from your workspace'),
    ).toBeInTheDocument();
    expect(screen.getByTestId(DASHBOARD_TEST_IDS.highlightsTabs)).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-highlights-tab-appearance')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-highlights-prev')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-highlights-next')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-highlights-dot-security')).toBeInTheDocument();
    expect(screen.getByText('Make it yours')).toBeInTheDocument();
  });

  it('uses specific action labels and settings deep links', async () => {
    renderWithProviders(<HighlightsCarousel />);

    await screen.findByText('Make it yours');
    const appearance = screen.getByTestId('dashboard-highlight-action-appearance');
    expect(appearance.tagName).toBe('BUTTON');
    expect(appearance).not.toHaveAttribute('href');
    const user = userEvent.setup();
    useUIStore.setState({ appearanceOpen: false });
    await user.click(appearance);
    expect(useUIStore.getState().appearanceOpen).toBe(true);
    useUIStore.setState({ appearanceOpen: false });
    expect(screen.getByTestId('dashboard-highlight-action-appearance')).toHaveTextContent(
      'Open Appearance Settings',
    );
    expect(screen.getByTestId('dashboard-highlight-action-invite')).toHaveAttribute(
      'href',
      '#settings/organization/members',
    );
    expect(screen.getByTestId('dashboard-highlight-action-security')).toHaveAttribute(
      'href',
      '#settings/account/security',
    );
  });

  it('jumps to a slide when a tab is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HighlightsCarousel />);

    await screen.findByText('Make it yours');
    await user.click(screen.getByTestId('dashboard-highlights-tab-invite'));

    expect(screen.getByTestId('dashboard-highlights-tab-invite')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<HighlightsCarousel />);
    await screen.findByTestId(DASHBOARD_TEST_IDS.highlightsCarousel);
    expect(await axe(container)).toHaveNoViolations();
  });
});
