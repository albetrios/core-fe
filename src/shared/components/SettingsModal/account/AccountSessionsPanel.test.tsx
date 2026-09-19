import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';
import { ensureLocale } from '@/lib/i18n/load-namespace.ts';

const { useSessionsMock, revokeMutateAsync } = vi.hoisted(() => ({
  useSessionsMock: vi.fn(),
  revokeMutateAsync: vi.fn(),
}));
vi.mock('@/shared/hooks/useSessions/index.ts', () => ({
  useSessions: useSessionsMock,
  useRevokeSession: () => ({ mutateAsync: revokeMutateAsync }),
}));

import { SETTINGS_KEYS, SETTINGS_NS } from '../settings.constants.ts';
import { AccountSessionsPanel } from './AccountSessionsPanel.tsx';

const KEYS = SETTINGS_KEYS.panels.sessions;

/** The panel's copy as the bundle renders it — never the English literal. */
const copy = (key: string, lng = 'en') => i18n.t(key, { ns: SETTINGS_NS, lng });

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

afterEach(async () => {
  // The locale is process-wide — a test that switches it must hand English
  // back, or every suite after this one renders in the last language used.
  if (i18n.language === 'en') return;
  await act(async () => {
    await i18n.changeLanguage('en');
  });
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
    // `device` is data, the badge is copy — assert the badge through the bundle.
    expect(screen.getByText(copy(KEYS.currentBadge))).toBeInTheDocument();
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

  // ── X-9: copy comes from the locale bundle, not from the component ───────

  describe('localization', () => {
    it('renders the session row sentence around the relative time', () => {
      // The meta line is a <Trans> slot: the browser/IP details and the
      // FormattedDate element must both survive the substitution.
      useSessionsMock.mockReturnValue({
        data: [{ ...OTHER, ipAddress: '203.0.113.7' }],
        isLoading: false,
        isError: false,
      });
      const { container } = render(<AccountSessionsPanel />);

      // The <time> is the FormattedDate slot — its presence proves the
      // component survived the substitution rather than being flattened away.
      const time = container.querySelector('[data-testid="sessions-list"] time');
      expect(time).not.toBeNull();
      const meta = time?.parentElement;
      expect(meta?.textContent).toContain('Safari');
      expect(meta?.textContent).toContain('203.0.113.7');
      expect(meta?.textContent).toContain('active');
    });

    it('follows the active locale instead of shipping English literals', async () => {
      // Regression (X-9): this panel hardcoded "Sessions", "No active
      // sessions", "Sessions appear here once you sign in on a device.",
      // "This device" and "Sign out" — every one of them stayed English in a
      // multi-locale app.
      useSessionsMock.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      });
      await ensureLocale('es');
      await act(async () => {
        await i18n.changeLanguage('es');
      });
      render(<AccountSessionsPanel />);

      for (const key of [KEYS.title, KEYS.emptyTitle, KEYS.emptyDescription]) {
        // A Spanish value that merely copies English would not be a translation.
        expect(copy(key, 'es')).not.toBe(copy(key, 'en'));
        expect(screen.getByText(copy(key, 'es'))).toBeInTheDocument();
      }
      expect(screen.queryByText(copy(KEYS.emptyTitle, 'en'))).not.toBeInTheDocument();
    });

    it('names the device in the revoke confirmation', async () => {
      useSessionsMock.mockReturnValue({
        data: [CURRENT, OTHER],
        isLoading: false,
        isError: false,
      });
      const user = userEvent.setup();
      render(<AccountSessionsPanel />);
      await user.click(screen.getByTestId('session-revoke-ses_other'));

      expect(screen.getByText(copy(KEYS.revokeTitle))).toBeInTheDocument();
      expect(
        screen.getByText(
          i18n.t(KEYS.revokeDescription, { ns: SETTINGS_NS, device: OTHER.device }),
        ),
      ).toBeInTheDocument();
    });
  });
});
