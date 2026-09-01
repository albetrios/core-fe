import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useSessionsMock, revokeMutateAsync } = vi.hoisted(() => ({
  useSessionsMock: vi.fn(),
  revokeMutateAsync: vi.fn(),
}));
vi.mock('@/shared/hooks/useSessions/index.ts', () => ({
  useSessions: useSessionsMock,
  useRevokeSession: () => ({ mutateAsync: revokeMutateAsync }),
}));

import { AccountSessionsPanel } from './AccountSessionsPanel.tsx';

const CURRENT = {
  id: 'ses_current',
  device: 'MacBook Pro',
  browser: 'Chrome',
  location: 'SF',
  lastActiveAt: '2026-06-24T00:00:00.000Z',
  current: true,
};
const OTHER = {
  id: 'ses_other',
  device: 'iPhone 15',
  browser: 'Safari',
  location: 'SF',
  lastActiveAt: '2026-06-23T00:00:00.000Z',
  current: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  revokeMutateAsync.mockResolvedValue(undefined);
});

describe('AccountSessionsPanel', () => {
  it('shows a loading state', () => {
    useSessionsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<AccountSessionsPanel />);
    expect(screen.getByTestId('sessions-loading')).toBeInTheDocument();
  });

  it('lists sessions; the current device is badged and not revocable', () => {
    useSessionsMock.mockReturnValue({
      data: [CURRENT, OTHER],
      isLoading: false,
      isError: false,
    });
    render(<AccountSessionsPanel />);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    // current session has no revoke control; the other one does
    expect(screen.queryByTestId('session-revoke-ses_current')).not.toBeInTheDocument();
    expect(screen.getByTestId('session-revoke-ses_other')).toBeInTheDocument();
  });

  it('confirms and revokes another session', async () => {
    useSessionsMock.mockReturnValue({
      data: [CURRENT, OTHER],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<AccountSessionsPanel />);
    await user.click(screen.getByTestId('session-revoke-ses_other'));
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(revokeMutateAsync).toHaveBeenCalledWith('ses_other'));
  });

  // ── SET-20 / SET-21: a failure you can act on, an empty list you can read ──

  it('offers a retry when the sessions fetch fails', async () => {
    // Regression: a plain sentence. The only way to try again was to close
    // Settings and open it again.
    const refetch = vi.fn();
    const user = userEvent.setup();
    useSessionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    render(<AccountSessionsPanel />);

    expect(screen.getByTestId('sessions-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('retry-button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('disables the retry while the refetch is in flight', () => {
    // The retry is a request like any other — it says so, and cannot be
    // hammered while it runs.
    useSessionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: true,
      refetch: vi.fn(),
    });
    render(<AccountSessionsPanel />);

    const retry = screen.getByTestId('retry-button');
    expect(retry).toBeDisabled();
    expect(retry.querySelector('.animate-spin')).not.toBeNull();
  });

  it('says the list is empty instead of rendering nothing', () => {
    // Regression: the skeleton handed over to blank space, which reads as
    // "still loading" forever (SET-21).
    useSessionsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<AccountSessionsPanel />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('sessions-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sessions-loading')).not.toBeInTheDocument();
  });

  // ── SET-22: a skeleton the size of the thing it stands in for ────────────

  it('renders the skeleton in the same row shell as the real list', () => {
    // Regression: two 56px bars stood in for rows that render ~66px inside a
    // card, so the panel jumped when the data landed.
    useSessionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    });
    const { container } = render(<AccountSessionsPanel />);

    const skeletonRows = container.querySelectorAll(
      '[data-testid="sessions-loading"] li',
    );
    expect(skeletonRows).toHaveLength(2);
    // Same shell as a rendered row: the p-3 list item inside the card.
    expect(skeletonRows[0]?.className).toContain('p-3');
    expect(
      container.querySelector('[data-testid="sessions-loading"] ul.divide-y'),
    ).not.toBeNull();
  });
});
