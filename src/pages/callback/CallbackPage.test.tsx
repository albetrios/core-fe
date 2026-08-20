import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AuthApiModule from '@/shared/api/auth-api.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { silentRefreshMock, establishSessionMock, oauthCallbackMock, navigateMock } =
  vi.hoisted(() => ({
    silentRefreshMock: vi.fn().mockResolvedValue(undefined),
    establishSessionMock: vi.fn().mockResolvedValue(undefined),
    oauthCallbackMock: vi.fn(),
    navigateMock: vi.fn(),
  }));

vi.mock('@/shared/auth/service.ts', () => ({
  silentRefresh: silentRefreshMock,
  establishSession: establishSessionMock,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<Record<string, unknown>>)();
  return { ...actual, useNavigate: () => navigateMock };
});

// MfaRequiredError must stay a real class — CallbackPage branches on `instanceof`.
vi.mock('@/shared/api/auth-api.ts', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof AuthApiModule>)();
  return {
    ...actual,
    authApi: { ...actual.authApi, oauthCallback: oauthCallbackMock },
  };
});

import { MfaRequiredError } from '@/shared/api/auth-api.ts';
import {
  popOauthProvider,
  stashOauthProvider,
} from '@/shared/auth/oauth-provider-handoff.ts';
import { stashReturnTo } from '@/shared/auth/redirect-safety.ts';

import { CallbackPage } from './CallbackPage.tsx';

/** Puts the page in the state the identity provider leaves it in on return. */
function arriveFromProvider(search: string, provider = 'google') {
  window.history.pushState({}, '', `/callback${search}`);
  stashOauthProvider(provider);
}

beforeEach(() => {
  vi.clearAllMocks();
  oauthCallbackMock.mockResolvedValue({ accessToken: 'access-token-value' });
  window.history.pushState({}, '', '/callback');
  sessionStorage.clear();
});

afterEach(() => {
  window.history.pushState({}, '', '/callback');
  sessionStorage.clear();
});

describe('CallbackPage', () => {
  it('renders the spinner container while resolving the OAuth return', async () => {
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
  });

  it('exchanges the HttpOnly refresh cookie via silentRefresh on return', async () => {
    renderWithProviders(<CallbackPage />);
    await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
  });

  it('does not read an email OTP token from the URL (code-entry flow only)', async () => {
    window.history.pushState({}, '', '/callback?token=should_be_ignored');
    renderWithProviders(<CallbackPage />);
    expect(await screen.findByTestId('callback-page')).toBeInTheDocument();
  });

  describe('authorization-code exchange', () => {
    it('redeems code/state against the stashed provider and establishes the session', async () => {
      arriveFromProvider('?code=auth-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(oauthCallbackMock).toHaveBeenCalledWith(
          'google',
          'auth-code',
          'state-token',
        ),
      );
      await waitFor(() =>
        expect(establishSessionMock).toHaveBeenCalledWith('access-token-value'),
      );
      expect(silentRefreshMock).not.toHaveBeenCalled();
    });

    it('lands on the dashboard once the session is established', async () => {
      arriveFromProvider('?code=auth-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith({ to: '/', replace: true }),
      );
    });

    it('honours a stashed returnTo over the dashboard default', async () => {
      arriveFromProvider('?code=auth-code&state=state-token');
      stashReturnTo('/settings');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith({ to: '/settings', replace: true }),
      );
    });

    it('clears the stashed provider so a reload cannot replay the grant', async () => {
      arriveFromProvider('?code=auth-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() => expect(oauthCallbackMock).toHaveBeenCalledTimes(1));
      expect(popOauthProvider()).toBeUndefined();
    });

    it('completes github as well as google', async () => {
      arriveFromProvider('?code=gh-code&state=gh-state', 'github');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(oauthCallbackMock).toHaveBeenCalledWith('github', 'gh-code', 'gh-state'),
      );
    });
  });

  describe('fallbacks and failures', () => {
    it('falls back to silentRefresh when the provider id is missing', async () => {
      window.history.pushState({}, '', '/callback?code=auth-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
      expect(oauthCallbackMock).not.toHaveBeenCalled();
    });

    it('falls back to silentRefresh when state is absent (no partial grant)', async () => {
      arriveFromProvider('?code=auth-code');
      renderWithProviders(<CallbackPage />);

      await waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
      expect(oauthCallbackMock).not.toHaveBeenCalled();
    });

    it('sends the user back to /login when the exchange fails', async () => {
      oauthCallbackMock.mockRejectedValue(new Error('invalid_grant'));
      arriveFromProvider('?code=bad-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith({ to: '/login', replace: true }),
      );
    });

    it('routes to /mfa when the account requires a second factor', async () => {
      oauthCallbackMock.mockRejectedValue(new MfaRequiredError('mfa-session-token'));
      arriveFromProvider('?code=auth-code&state=state-token');
      renderWithProviders(<CallbackPage />);

      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith({ to: '/mfa', replace: true }),
      );
      expect(establishSessionMock).not.toHaveBeenCalled();
    });
  });
});
