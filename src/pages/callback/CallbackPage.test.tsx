import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const {
  establishSessionMock,
  silentRefreshMock,
  stashMfaHandoffMock,
  skipAutoGoogleSignInMock,
} = vi.hoisted(() => ({
  establishSessionMock: vi.fn().mockResolvedValue(undefined),
  silentRefreshMock: vi.fn().mockResolvedValue(undefined),
  stashMfaHandoffMock: vi.fn(),
  skipAutoGoogleSignInMock: vi.fn(),
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
import { stashOAuthProvider } from '@/shared/auth/oauth-provider.ts';

import { CallbackPage } from './CallbackPage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/callback');
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/callback');
  sessionStorage.clear();
});

/** Seed the provider stash + the code/state the provider redirect would carry. */
function arrangeProviderReturn() {
  stashOAuthProvider('google');
  window.history.pushState({}, '', '/callback?code=auth-code&state=state-token');
}

describe('CallbackPage', () => {
  it('renders the spinner container while resolving the OAuth return', async () => {
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
  });

  it('forwards code+state to the stashed provider callback and establishes the session', async () => {
    arrangeProviderReturn();
    const oauthCallbackSpy = vi
      .spyOn(authApi, 'oauthCallback')
      .mockResolvedValue({ accessToken: 'oauth-access-token' });

    renderWithProviders(<CallbackPage />);

    await waitFor(() =>
      expect(oauthCallbackSpy).toHaveBeenCalledWith('google', {
        code: 'auth-code',
        state: 'state-token',
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

  it('falls back to silentRefresh when no code+state+provider are present', async () => {
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('falls back to silentRefresh when the provider stash is missing', async () => {
    window.history.pushState({}, '', '/callback?code=auth-code&state=state-token');
    const oauthCallbackSpy = vi.spyOn(authApi, 'oauthCallback');
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(oauthCallbackSpy).not.toHaveBeenCalled();
  });

  it('does not read an email OTP token from the URL (code-entry flow only)', async () => {
    window.history.pushState({}, '', '/callback?token=should_be_ignored');
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
  });
});
