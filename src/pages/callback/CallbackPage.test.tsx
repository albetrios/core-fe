import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const {
  notifyErrorMock,
  captureAnalyticsMock,
  establishSessionMock,
  silentRefreshMock,
  stashMfaHandoffMock,
  skipAutoGoogleSignInMock,
  routeParamsHolder,
  navigateMock,
} = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
  captureAnalyticsMock: vi.fn(),
  establishSessionMock: vi.fn().mockResolvedValue(undefined),
  silentRefreshMock: vi.fn().mockResolvedValue(undefined),
  stashMfaHandoffMock: vi.fn(),
  skipAutoGoogleSignInMock: vi.fn(),
  routeParamsHolder: { value: {} as Record<string, string> },
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // The test router mounts the page at '/', so the $provider param is
    // injected here instead of via a real /callback/$provider match.
    useParams: () => routeParamsHolder.value,
    // The page is mounted at '/', so a real navigate would not move
    // window.location — capture the intent instead.
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/shared/notify/index.ts', () => ({
  notify: {
    error: notifyErrorMock,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/shared/analytics/capture.ts', () => ({
  captureAnalyticsEvent: captureAnalyticsMock,
}));

vi.mock('@/shared/auth/service.ts', () => ({
  establishSession: establishSessionMock,
  silentRefresh: silentRefreshMock,
}));

vi.mock('@/shared/auth/mfa-handoff.ts', () => ({
  stashMfaHandoff: stashMfaHandoffMock,
}));

vi.mock('@/shared/auth/auto-google-sign-in.ts', () => ({
  skipAutoGoogleSignIn: skipAutoGoogleSignInMock,
}));

import { authApi, MfaRequiredError } from '@/shared/api/auth-api.ts';

import { CallbackPage } from './CallbackPage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  routeParamsHolder.value = {};
  window.history.pushState({}, '', '/callback/google');
});

afterEach(() => {
  vi.restoreAllMocks();
  routeParamsHolder.value = {};
  window.history.pushState({}, '', '/callback/google');
});

/** A well-formed `state` — core-be mints 32 random bytes hex-encoded (64 hex chars). */
const TEST_STATE = 'deadbeef'.repeat(8);

/** Arrange the provider param + the code/state the provider redirect carries. */
function arrangeProviderReturn() {
  routeParamsHolder.value = { provider: 'google' };
  window.history.pushState({}, '', `/callback/google?code=auth-code&state=${TEST_STATE}`);
}

describe('CallbackPage', () => {
  it('renders the spinner container while resolving the OAuth return', async () => {
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
  });

  it('forwards code+state to the provider named by the route and establishes the session', async () => {
    arrangeProviderReturn();
    const oauthCallbackSpy = vi
      .spyOn(authApi, 'oauthCallback')
      .mockResolvedValue({ accessToken: 'oauth-access-token' });

    renderWithProviders(<CallbackPage />);

    await waitFor(() =>
      expect(oauthCallbackSpy).toHaveBeenCalledWith('google', {
        code: 'auth-code',
        state: TEST_STATE,
      }),
    );
    await waitFor(() =>
      expect(establishSessionMock).toHaveBeenCalledWith('oauth-access-token'),
    );
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('hands off to /mfa when the exchange reports a second factor is required', async () => {
    arrangeProviderReturn();
    vi.spyOn(authApi, 'oauthCallback').mockRejectedValue(
      new MfaRequiredError('mfa-session-token'),
    );

    renderWithProviders(<CallbackPage />);

    await waitFor(() =>
      expect(stashMfaHandoffMock).toHaveBeenCalledWith('mfa-session-token', '/'),
    );
    expect(establishSessionMock).not.toHaveBeenCalled();
  });

  it('skips auto-Google and bails to /login when the exchange fails', async () => {
    arrangeProviderReturn();
    vi.spyOn(authApi, 'oauthCallback').mockRejectedValue(new Error('state expired'));

    renderWithProviders(<CallbackPage />);

    await waitFor(() => expect(skipAutoGoogleSignInMock).toHaveBeenCalledTimes(1));
    expect(establishSessionMock).not.toHaveBeenCalled();
  });

  it('falls back to silentRefresh when code+state are absent', async () => {
    routeParamsHolder.value = { provider: 'google' };
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('falls back to silentRefresh when the route carries no provider param', async () => {
    window.history.pushState(
      {},
      '',
      `/callback/google?code=auth-code&state=${TEST_STATE}`,
    );
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('never forwards a malformed provider slug (falls back to silentRefresh)', async () => {
    routeParamsHolder.value = { provider: 'Not A Slug' };
    window.history.pushState(
      {},
      '',
      `/callback/google?code=auth-code&state=${TEST_STATE}`,
    );
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('never forwards a state that is not our 64-hex mint (falls back to silentRefresh)', async () => {
    routeParamsHolder.value = { provider: 'google' };
    window.history.pushState(
      {},
      '',
      '/callback/google?code=auth-code&state=forged-state',
    );
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('does not read an email OTP token from the URL (code-entry flow only)', async () => {
    routeParamsHolder.value = { provider: 'google' };
    window.history.pushState({}, '', '/callback/google?token=should_be_ignored');
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
  });
});

// ── CB-1 ────────────────────────────────────────────────────────────────────
// The failure path was a bare redirect out of an empty catch: the user watched a
// spinner, landed back on a plain login form with no toast, no banner and no clue
// that Google/GitHub had failed, and retried the same broken flow. Nothing was
// recorded either — the funnel only ever saw the two success events.
describe('CallbackPage failure reporting (CB-1)', () => {
  it('surfaces the failure and records it when the code exchange fails', async () => {
    routeParamsHolder.value = { provider: 'google' };
    window.history.pushState({}, '', `/callback/google?code=abc&state=${TEST_STATE}`);
    vi.spyOn(authApi, 'oauthCallback').mockRejectedValue(
      new Error('Token exchange failed'),
    );

    renderWithProviders(<CallbackPage />);

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
    expect(String(notifyErrorMock.mock.calls[0]?.[0])).toMatch(/token exchange failed/i);
    expect(captureAnalyticsMock).toHaveBeenCalledWith('auth_oauth_failed', {
      provider: 'google',
    });
    // ...and the login screen is told why, so it can say so in its own banner.
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/login',
        search: { error: 'oauth_failed' },
        replace: true,
      }),
    );
  });

  it('reports a failed silent refresh the same way', async () => {
    routeParamsHolder.value = { provider: 'google' };
    window.history.pushState({}, '', '/callback/google');
    silentRefreshMock.mockRejectedValueOnce(new Error('No session'));

    renderWithProviders(<CallbackPage />);

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
    expect(captureAnalyticsMock).toHaveBeenCalledWith('auth_oauth_failed', {
      provider: 'google',
    });
  });

  it('stays silent on the success path', async () => {
    routeParamsHolder.value = { provider: 'google' };
    window.history.pushState({}, '', `/callback/google?code=abc&state=${TEST_STATE}`);
    vi.spyOn(authApi, 'oauthCallback').mockResolvedValue({
      accessToken: 'oauth-access-token',
    } as never);

    renderWithProviders(<CallbackPage />);

    await waitFor(() => expect(establishSessionMock).toHaveBeenCalled());
    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(captureAnalyticsMock).not.toHaveBeenCalledWith(
      'auth_oauth_failed',
      expect.anything(),
    );
  });
});
