import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { FocusTimer } from './FocusTimer.tsx';

describe('FocusTimer', () => {
  beforeEach(() => {
    // Auto-advancing fake timers keep provider async flows (i18n, queries)
    // alive while still letting the test advance the countdown deliberately.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 25:00, ticks while running, pauses, and resets', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<FocusTimer />);

    const clock = await screen.findByTestId('dashboard-focus-clock');
    expect(clock).toHaveTextContent('25:00');

    await user.click(screen.getByTestId('dashboard-focus-toggle'));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(clock).toHaveTextContent('24:57');

    // Pause holds the remaining time steady.
    await user.click(screen.getByTestId('dashboard-focus-toggle'));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(clock).toHaveTextContent('24:57');

    await user.click(screen.getByTestId('dashboard-focus-reset'));
    expect(clock).toHaveTextContent('25:00');
  });

  it('has no accessibility violations', async () => {
    vi.useRealTimers();
    const { container } = renderWithProviders(<FocusTimer />);
    await screen.findByTestId('dashboard-focus-timer');
    expect(await axe(container)).toHaveNoViolations();
  });
});
