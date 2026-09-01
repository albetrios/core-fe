import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { TimelineStrip } from './TimelineStrip.tsx';

describe('TimelineStrip', () => {
  it('renders the sample badge and every seeded event on the track', async () => {
    renderWithProviders(<TimelineStrip />);

    expect(await screen.findByTestId('dashboard-timeline-strip')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-timeline-sample')).toBeInTheDocument();
    for (const id of ['evt_1', 'evt_2', 'evt_3', 'evt_4']) {
      expect(screen.getByTestId(`dashboard-timeline-event-${id}`)).toBeInTheDocument();
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<TimelineStrip />);
    await screen.findByTestId('dashboard-timeline-strip');
    expect(await axe(container)).toHaveNoViolations();
  });
});
