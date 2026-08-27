import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const {
  establishSessionMock,
  silentRefreshMock,
  stashMfaHandoffMock,
  skipAutoGoogleSignInMock,
  routeParamsHolder,
} = vi.hoisted(() => ({
  establishSessionMock: vi.fn().mockResolvedValue(undefined),
  silentRefreshMock: vi.fn().mockResolvedValue(undefined),
  stashMfaHandoffMock: vi.fn(),
  skipAutoGoogleSignInMock: vi.fn(),
  routeParamsHolder: { value: {} as Record<string, string> },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // The test router mounts the page at '/', so the $provider param is
    // injected here instead of via a real /callback/$provider match.
    useParams: () => routeParamsHolder.value,
  };
});

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
