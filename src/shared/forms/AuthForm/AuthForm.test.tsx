import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { signInWithPasskey } from '@/shared/auth/passkey-sign-in.ts';

import { AuthForm } from './AuthForm.tsx';

const turnstileReadyRef = vi.hoisted(() => ({ value: true }));
vi.mock('@/shared/auth/captcha/useTurnstileReady/index.ts', () => ({
  useTurnstileReady: () => turnstileReadyRef.value,
}));

vi.mock('@/core/config/auth-methods.ts', () => ({
  enabledOAuthProviders: vi.fn(() => ['google', 'github', 'apple']),
}));

const authMethodsRef = vi.hoisted(() => ({
  defaults: {
    email: true,
    oauth: { google: true, github: true, apple: true },
    passkey: true,
    oauthAutoGoogle: false,
  },
  value: {
    email: true,
    oauth: { google: true, github: true, apple: true },
    passkey: true,
    oauthAutoGoogle: false,
  },
}));
vi.mock('@/shared/hooks/useAuthMethods/index.ts', () => ({
  useAuthMethods: vi.fn(() => authMethodsRef.value),
}));

vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: {
    oauthStart: vi.fn().mockResolvedValue('https://oauth.example/redirect'),
    emailVerificationCodeSend: vi.fn().mockResolvedValue({}),
    emailLogin: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
  },
  MfaRequiredError: class MfaRequiredError extends Error {
    mfaSessionToken = '';
  },
}));

vi.mock('@/shared/auth/passkey-sign-in.ts', () => ({
  signInWithPasskey: vi.fn().mockResolvedValue(undefined),
  // The suite exercises the passkey method, so it stands in for a wired
  // backend. Production returns false until /auth/webauthn/login/* exists.
  isPasskeySignInAvailable: vi.fn(() => true),
}));

vi.mock('@/shared/auth/service.ts', () => ({
  establishSession: vi.fn().mockResolvedValue(undefined),
}));

function createTestRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <AuthForm />,
  });
  const tree = rootRoute.addChildren([indexRoute]);
  const history = createMemoryHistory({ initialEntries: ['/'] });
  return createRouter({ routeTree: tree, history });
}

describe('AuthForm', () => {
  const renderForm = () => {
    const router = createTestRouter();
    return render(<RouterProvider router={router} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    turnstileReadyRef.value = true;
    authMethodsRef.value = {
      ...authMethodsRef.defaults,
      oauth: { ...authMethodsRef.defaults.oauth },
    };
    // shouldAttemptAutoGoogleSignIn() reads sessionStorage; a prior test that
    // cancelled auto-Google would otherwise suppress it for the whole file.
    sessionStorage.clear();
  });

  it('opens the email panel by default', async () => {
    renderForm();
    expect(await screen.findByTestId('auth-form')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-email-panel')).toBeInTheDocument();
  });

  it('lists social sign-in before the email credential slot', async () => {
    renderForm();
    const social = await screen.findByTestId('auth-social-methods');
    const email = await screen.findByTestId('auth-email-panel');
    expect(
      social.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(await screen.findByTestId('auth-method-divider')).toBeInTheDocument();
  });

  it('renders OAuth and passkey continue buttons', async () => {
    renderForm();
    expect(await screen.findByTestId('auth-continue-google')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-continue-apple')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-continue-passkey')).toBeInTheDocument();
  });

  // GitHub is deliberately withheld until the deployment has credentials for it:
  // enabled upstream (the mock returns it), filtered out in AuthForm. Everything
  // else about GitHub stays wired, so this is the only thing keeping it off screen.
  it('hides the GitHub button even when the provider is enabled upstream', async () => {
    renderForm();
    await screen.findByTestId('auth-continue-google');
    expect(screen.queryByTestId('auth-continue-github')).not.toBeInTheDocument();
  });

  it('hides method picker after the user submits their email', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-form')).toHaveAttribute('data-email-verify'),
    );
    expect(screen.queryByTestId('auth-social-methods')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-method-divider')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Check your email' }),
    ).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(
      screen.queryByText(/one account for sign-in and sign-up/i),
    ).not.toBeInTheDocument();
  });

  it('disables other continue actions while email submit is in flight', async () => {
    const user = userEvent.setup();
    let resolveSend: (() => void) | undefined;
    const { authApi } = await import('@/shared/api/auth-api.ts');
    vi.mocked(authApi.emailVerificationCodeSend).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = () => resolve({});
        }),
    );

    renderForm();
    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-continue-google')).toBeDisabled();
      expect(screen.getByTestId('auth-continue-passkey')).toBeDisabled();
    });

    resolveSend?.();
    await waitFor(() =>
      expect(screen.getByTestId('auth-email-verify-panel')).toBeInTheDocument(),
    );
  });

  it('invokes passkey sign-in and disables other methods while loading', async () => {
    const user = userEvent.setup();
    let resolvePasskey: (() => void) | undefined;
    vi.mocked(signInWithPasskey).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePasskey = resolve;
        }),
    );

    renderForm();
    await user.click(await screen.findByTestId('auth-continue-passkey'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-continue-google')).toBeDisabled();
      expect(screen.getByTestId('auth-email')).toBeDisabled();
    });

    resolvePasskey?.();
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledOnce());
  });

  it('keeps the provider label while OAuth is in flight and isolates the clicked method', async () => {
    const user = userEvent.setup();
    let resolveOauth: ((url: string) => void) | undefined;
    const { authApi } = await import('@/shared/api/auth-api.ts');
    vi.mocked(authApi.oauthStart).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveOauth = resolve;
        }),
    );

    renderForm();
    await user.click(await screen.findByTestId('auth-continue-google'));

    await waitFor(() => {
      const google = screen.getByTestId('auth-continue-google');
      // Label stays put — no swap to "Continuing…" (the spinner conveys progress).
      expect(google).toHaveTextContent(/continue with google/i);
      expect(google).not.toHaveTextContent(/continuing/i);
      expect(google).toHaveAttribute('aria-busy', 'true');
      // Only the clicked method processes; everything else is disabled.
      expect(screen.getByTestId('auth-continue-apple')).toBeDisabled();
      expect(screen.getByTestId('auth-continue-passkey')).toBeDisabled();
      expect(screen.getByTestId('auth-email')).toBeDisabled();
    });

    resolveOauth?.('https://oauth.example/redirect');
  });

  it('does not spin idle OAuth buttons once another method is pending (single-use captcha)', async () => {
    // Captcha token not yet minted (or consumed by the in-flight method).
    turnstileReadyRef.value = false;
    const user = userEvent.setup();
    vi.mocked(signInWithPasskey).mockImplementation(
      () => new Promise<void>(() => {}), // stays pending
    );

    renderForm();
    await user.click(await screen.findByTestId('auth-continue-passkey'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-continue-passkey')).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });

    // Every other method is disabled but MUST NOT show a spinner.
    for (const id of ['auth-continue-google', 'auth-continue-apple']) {
      const btn = screen.getByTestId(id);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'false');
      expect(btn.querySelector('.animate-spin')).toBeNull();
    }
  });

  // Regression: a failed OAuth start must surface a VISIBLE inline error. A toast
  // fired from the async catch can be dropped by sonner, leaving the user with no
  // feedback after clicking a provider.
  it('surfaces an inline error banner when OAuth start fails', async () => {
    const user = userEvent.setup();
    const { authApi } = await import('@/shared/api/auth-api.ts');
    vi.mocked(authApi.oauthStart).mockRejectedValueOnce(new Error('OAuth down'));

    renderForm();
    await user.click(await screen.findByTestId('auth-continue-google'));

    const banner = await screen.findByTestId('auth-method-error-banner');
    expect(banner).toHaveTextContent(/oauth down/i);
    expect(banner).toHaveAttribute('role', 'alert');
  });

  // Regression: a failed passkey sign-in must surface a visible inline error too
  // (same silently-dropped-toast class as OAuth).
  it('surfaces an inline error banner when passkey sign-in fails', async () => {
    const user = userEvent.setup();
    vi.mocked(signInWithPasskey).mockRejectedValueOnce(new Error('Passkey failed'));

    renderForm();
    await user.click(await screen.findByTestId('auth-continue-passkey'));

    const banner = await screen.findByTestId('auth-method-error-banner');
    expect(banner).toHaveTextContent(/passkey failed/i);
    expect(banner).toHaveAttribute('role', 'alert');
  });

  // ── LOGIN-1 ────────────────────────────────────────────────────────────────
  // The auto-Google screen used to be raised in an effect, so the method picker
  // was committed first and then replaced. With a captcha gate holding the effect
  // back, that swap was on screen for well over a second.
  describe('auto Google sign-in (LOGIN-1)', () => {
    const enableAutoGoogle = () => {
      authMethodsRef.value = { ...authMethodsRef.value, oauthAutoGoogle: true };
    };

    it('commits the auto-Google screen first — the method picker never renders', async () => {
      enableAutoGoogle();
      renderForm();

      // Present on the very first paint, with no waitFor: the decision is made in
      // the useState initialiser, not in an effect.
      expect(await screen.findByTestId('auth-auto-google-pending')).toBeInTheDocument();
      expect(screen.queryByTestId('auth-social-methods')).not.toBeInTheDocument();
      expect(screen.queryByTestId('auth-continue-google')).not.toBeInTheDocument();
    });

    it('still shows the auto-Google screen while the captcha token is minting', async () => {
      // The gate that made the flicker long enough to see: the effect cannot start
      // OAuth yet, but the intent to auto-start is already known.
      turnstileReadyRef.value = false;
      enableAutoGoogle();
      renderForm();

      expect(await screen.findByTestId('auth-auto-google-pending')).toBeInTheDocument();
      expect(screen.queryByTestId('auth-social-methods')).not.toBeInTheDocument();
    });

    it('leaves the "use email instead" escape hatch clickable', async () => {
      const user = userEvent.setup();
      enableAutoGoogle();
      renderForm();

      await screen.findByTestId('auth-auto-google-pending');
      // FullPageSpinner is `fixed inset-0` with an opaque background; rendered as a
      // sibling here it painted over the skip button and swallowed its clicks.
      expect(screen.queryByTestId('full-page-spinner')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('auth-skip-auto-google'));

      // Cancelling drops back to the picker, and it stays there.
      expect(await screen.findByTestId('auth-social-methods')).toBeInTheDocument();
      expect(screen.queryByTestId('auth-auto-google-pending')).not.toBeInTheDocument();
    });

    it('does not flash the method picker back while the OAuth start is in flight', async () => {
      vi.useFakeTimers();
      try {
        const { authApi } = await import('@/shared/api/auth-api.ts');
        vi.mocked(authApi.oauthStart).mockImplementation(
          () => new Promise<string>(() => {}), // never settles: mid-redirect
        );
        enableAutoGoogle();
        renderForm();

        await vi.waitFor(() =>
          expect(screen.getByTestId('auth-auto-google-pending')).toBeInTheDocument(),
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000); // past AUTO_GOOGLE_DELAY_MS
        });

        expect(authApi.oauthStart).toHaveBeenCalledWith('google');
        // startOAuth used to call cancelAutoGoogle() here, putting the disabled
        // picker back on screen until the redirect resolved.
        expect(screen.getByTestId('auth-auto-google-pending')).toBeInTheDocument();
        expect(screen.queryByTestId('auth-social-methods')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    // LOGIN-3: the arming effect held autoGoogleStartedRef for the whole component
    // lifetime, but its cleanup only cleared the timer. Any teardown before the
    // timer fired therefore lost the timer AND kept the guard, so every later run
    // bailed and the sign-in never started — with autoGooglePending stuck true, the
    // user sat on the spinner forever.
    it('still starts sign-in when the effect is torn down before the timer fires', async () => {
      vi.useFakeTimers();
      try {
        const { authApi } = await import('@/shared/api/auth-api.ts');
        vi.mocked(authApi.oauthStart).mockImplementation(
          () => new Promise<string>(() => {}), // never settles: mid-redirect
        );
        enableAutoGoogle();

        // StrictMode runs mount -> cleanup -> mount, which is exactly the teardown
        // that used to strand the flow. This is the app's real dev configuration.
        const router = createTestRouter();
        render(
          <StrictMode>
            <RouterProvider router={router} />
          </StrictMode>,
        );

        await vi.waitFor(() =>
          expect(screen.getByTestId('auth-auto-google-pending')).toBeInTheDocument(),
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000); // past AUTO_GOOGLE_DELAY_MS
        });

        // Started, and started exactly once — the guard still does its job.
        expect(authApi.oauthStart).toHaveBeenCalledTimes(1);
        // The other trigger for the same teardown — the captcha token expiring
        // inside the 800ms window — is not reachable from here: TanStack Router
        // does not propagate a parent rerender to the route component, so the
        // effect never actually tears down and such a test would pass against the
        // bug. That path is covered end to end in the browser instead.
      } finally {
        vi.useRealTimers();
      }
    });

    it('falls back to the method picker with an error when the OAuth start fails', async () => {
      vi.useFakeTimers();
      try {
        const { authApi } = await import('@/shared/api/auth-api.ts');
        vi.mocked(authApi.oauthStart).mockRejectedValue(new Error('OAuth down'));
        enableAutoGoogle();
        renderForm();

        await vi.waitFor(() =>
          expect(screen.getByTestId('auth-auto-google-pending')).toBeInTheDocument(),
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });

        expect(screen.getByTestId('auth-social-methods')).toBeInTheDocument();
        expect(screen.getByTestId('auth-method-error-banner')).toHaveTextContent(
          /oauth down/i,
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('resilience', () => {
    // Regression (house rule §1): `disabled={pending}` only lands on the NEXT
    // render, so for one frame after the first click the handler is still
    // reachable. Both clicks go out in a single act() batch — the real
    // double-click window — because fireEvent/userEvent flush React between
    // calls and would pass even with no guard at all.
    it('starts only one OAuth request when the button is double-clicked', async () => {
      const { authApi } = await import('@/shared/api/auth-api.ts');
      vi.mocked(authApi.oauthStart).mockImplementationOnce(
        () => new Promise<string>(() => {}),
      );

      renderForm();
      const google = await screen.findByTestId('auth-continue-google');

      act(() => {
        google.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        google.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => expect(google).toHaveAttribute('aria-busy', 'true'));
      expect(authApi.oauthStart).toHaveBeenCalledTimes(1);
    });

    it('starts only one passkey ceremony when the button is double-clicked', async () => {
      authMethodsRef.value = { ...authMethodsRef.defaults, passkey: true };
      vi.mocked(signInWithPasskey).mockImplementationOnce(
        () => new Promise<void>(() => {}),
      );

      renderForm();
      const passkey = await screen.findByTestId('auth-continue-passkey');

      act(() => {
        passkey.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        passkey.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => expect(passkey).toHaveAttribute('aria-busy', 'true'));
      expect(signInWithPasskey).toHaveBeenCalledTimes(1);
    });

    // Regression (LOGIN-9): the OAuth failure banner used to be cleared by
    // `onInteract`, which fires on focus — so moving to the email field to try
    // another way wiped the explanation before it could be read.
    it('keeps the OAuth error banner when the user focuses the email field', async () => {
      const user = userEvent.setup();
      const { authApi } = await import('@/shared/api/auth-api.ts');
      vi.mocked(authApi.oauthStart).mockRejectedValueOnce(new Error('OAuth down'));

      renderForm();
      await user.click(await screen.findByTestId('auth-continue-google'));
      const banner = await screen.findByTestId('auth-method-error-banner');
      expect(banner).toHaveTextContent(/.+/);

      await user.click(screen.getByTestId('auth-email'));

      expect(screen.getByTestId('auth-method-error-banner')).toHaveTextContent(/.+/);
    });

    // Regression (LOGIN-10): `window.location.assign` neither resolves nor
    // throws when the navigation is blocked, so the form sat disabled behind a
    // spinner forever with no way back.
    it('hands the form back if the OAuth redirect never happens', async () => {
      const { authApi } = await import('@/shared/api/auth-api.ts');
      vi.mocked(authApi.oauthStart).mockResolvedValue('https://oauth.example/go');

      renderForm();
      const google = await screen.findByTestId('auth-continue-google');

      vi.useFakeTimers();
      try {
        act(() => {
          google.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // Let oauthStart resolve and location.assign run (a no-op in jsdom).
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByTestId('auth-continue-google')).toBeDisabled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(8000);
        });

        expect(screen.getByTestId('auth-continue-google')).not.toBeDisabled();
        expect(screen.getByTestId('auth-method-error-banner')).toHaveTextContent(/.+/);
      } finally {
        vi.useRealTimers();
      }
    });

    /*
     * The other half of LOGIN-10. The watchdog fixed a redirect that never
     * happens; it then broke the redirect that is merely SLOW. Past 8s the
     * document is still on screen, so the timer fired on a WORKING sign-in:
     * "sign-in failed" mid-navigation, and because the watchdog also releases
     * `methodStartedRef`, a second oauthStart could go out for one click.
     *
     * `pagehide` is the document actually leaving. Once it fires, the watchdog
     * must never speak again however long the navigation takes.
     */
    it('stays quiet when the page is genuinely leaving, however slow', async () => {
      const { authApi } = await import('@/shared/api/auth-api.ts');
      vi.mocked(authApi.oauthStart).mockResolvedValue('https://oauth.example/go');

      renderForm();
      const google = await screen.findByTestId('auth-continue-google');

      vi.useFakeTimers();
      try {
        act(() => {
          google.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByTestId('auth-continue-google')).toBeDisabled();

        // The navigation commits — slowly, but it commits.
        act(() => {
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30000);
        });

        // No false failure...
        expect(screen.queryByTestId('auth-method-error-banner')).not.toBeInTheDocument();
        // ...and the control is NOT handed back, so no second oauthStart.
        expect(screen.getByTestId('auth-continue-google')).toBeDisabled();
        expect(vi.mocked(authApi.oauthStart)).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();
    await screen.findByTestId('auth-form');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
