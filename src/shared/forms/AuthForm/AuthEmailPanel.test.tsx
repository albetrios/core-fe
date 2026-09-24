import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const { emailVerificationCodeSend, emailLogin, establishSession } = vi.hoisted(() => ({
  emailVerificationCodeSend: vi.fn(async () => ({})),
  emailLogin: vi.fn(async () => ({ accessToken: 'mock-token' })),
  establishSession: vi.fn(async () => undefined),
}));

vi.mock('@/shared/auth/captcha/useTurnstileReady/index.ts', () => ({
  useTurnstileReady: () => true,
}));

vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: {
    emailVerificationCodeSend,
    emailLogin,
  },
  // Real class so the verify-error path's `err instanceof MfaRequiredError`
  // check is evaluable (the panel imports it from this module).
  MfaRequiredError: class MfaRequiredError extends Error {
    mfaSessionToken = 'mock-mfa-token';
  },
}));

vi.mock('@/shared/auth/service.ts', () => ({
  establishSession,
}));

vi.mock('@/core/http/queryClient.ts', () => ({
  queryClient: {
    getQueryData: vi.fn(() => ({
      user: {
        id: 'usr_1',
        email: 'user@example.com',
        isEmailVerified: true,
        isMfaEnabled: false,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        status: 'ACTIVE',
        createdAt: 't',
        updatedAt: 't',
      },
      activeOrganization: null,
      myPermissions: [],
      globalRole: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
      personalOrganizationId: null,
    })),
  },
}));

import { queryClient } from '@/core/http/queryClient.ts';
// The real auth-shell form slot the panel lives inside — see LOGIN-7 below.
import { AuthForm as AuthFormSlot } from '@/shared/layouts/AuthLayout/AuthLayout.shared.tsx';

import type { AuthContinuePending } from './auth-form-pending.ts';
import { AuthEmailPanel } from './AuthEmailPanel.tsx';

function createTestRouter(component: () => ReactNode = () => <AuthEmailPanel />) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component,
  });
  const tree = rootRoute.addChildren([indexRoute]);
  const history = createMemoryHistory({ initialEntries: ['/'] });
  return createRouter({ routeTree: tree, history });
}

/**
 * Router with the post-login destination routes mounted, so a successful verify
 * can navigate to a real target and we can assert the landing pathname. Each
 * destination renders a marker island (no `/login` chrome) so a bounce back
 * through the login screen would be observable.
 */
function createDestinationRouter(
  initialEntry = '/login',
  hangAt?: string,
  LoginComponent: () => ReactElement = () => <AuthEmailPanel />,
) {
  // `beforeLoad` that never settles keeps the navigation pending, so the screen
  // being left behind stays mounted — the LOGIN-5 handoff window, held open.
  const hold = (path: string) =>
    hangAt === path ? { beforeLoad: () => new Promise<void>(() => {}) } : {};
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginComponent,
  });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    ...hold('/dashboard'),
    component: () => <div data-testid="dest-dashboard" />,
  });
  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/onboarding',
    ...hold('/onboarding'),
    component: () => <div data-testid="dest-onboarding" />,
  });
  const orgDashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/organization/$organizationSlug/dashboard',
    component: () => <div data-testid="dest-org-dashboard" />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const tree = rootRoute.addChildren([
    indexRoute,
    loginRoute,
    dashboardRoute,
    onboardingRoute,
    orgDashboardRoute,
  ]);
  return createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

const TS = '2026-01-01T00:00:00.000Z';

async function verifyWith(router: ReturnType<typeof createDestinationRouter>) {
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
  await user.click(screen.getByTestId('auth-email-submit'));
  await screen.findByTestId('auth-email-verify-panel');
  await user.type(await screen.findByTestId('auth-email-code'), '123456');
}

describe('AuthEmailPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('advances to the verification step after sending a code', async () => {
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await waitFor(() =>
      expect(emailVerificationCodeSend).toHaveBeenCalledWith('user@example.com'),
    );
    expect(await screen.findByTestId('auth-email-verify-panel')).toBeInTheDocument();
    expect(screen.getByTestId('auth-email-code')).toBeInTheDocument();
  });

  it('prefills the verify code when the response echoes debug_verification_code', async () => {
    emailVerificationCodeSend.mockResolvedValueOnce({
      debug_verification_code: '135790',
    });
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await screen.findByTestId('auth-email-verify-panel');
    expect(await screen.findByTestId('auth-email-code')).toHaveValue('135790');
  });

  it('leaves the verify code empty when no debug code is echoed', async () => {
    emailVerificationCodeSend.mockResolvedValueOnce({});
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await screen.findByTestId('auth-email-verify-panel');
    expect(await screen.findByTestId('auth-email-code')).toHaveValue('');
  });

  it('verifies the code and establishes a session', async () => {
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-email-verify-panel');

    const codeInput = await screen.findByTestId('auth-email-code');
    await user.type(codeInput, '123456');

    await waitFor(() =>
      expect(emailLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        code: '123456',
      }),
    );
    expect(establishSession).toHaveBeenCalledWith('mock-token');
  });

  // Regression: a returning user with an active team org must land DIRECTLY on
  // that org's dashboard — not bounce through the `/` resolver, which re-fetches
  // me/context and keeps `/login` mounted for the round-trip (flash of login).
  it('navigates straight to the active org dashboard, not through `/`', async () => {
    vi.mocked(queryClient.getQueryData).mockReturnValueOnce({
      user: {
        id: 'usr_1',
        email: 'user@example.com',
        isEmailVerified: true,
        isMfaEnabled: false,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        status: 'ACTIVE',
        onboardingCompleted: true,
        createdAt: TS,
        updatedAt: TS,
      },
      activeOrganization: {
        id: 'org_abcdefghij0123456789x',
        name: 'Acme',
        slug: 'acme',
        type: 'TEAM',
        status: 'ACTIVE',
        logoUrl: null,
        createdAt: TS,
        updatedAt: TS,
      },
      // Member can read the team org → lands on its dashboard (not the picker).
      myPermissions: ['organization:read'],
      globalRole: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
      personalOrganizationId: null,
    });
    const router = createDestinationRouter();

    await verifyWith(router);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/organization/acme/dashboard'),
    );
    expect(screen.queryByTestId('auth-email-verify-panel')).not.toBeInTheDocument();
  });

  // Regression: a fresh signup (no active org, no memberships) lands on
  // onboarding directly.
  it('navigates a fresh signup straight to onboarding', async () => {
    vi.mocked(queryClient.getQueryData).mockReturnValueOnce({
      user: {
        id: 'usr_1',
        email: 'user@example.com',
        isEmailVerified: true,
        isMfaEnabled: false,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        status: 'ACTIVE',
        createdAt: TS,
        updatedAt: TS,
      },
      activeOrganization: null,
      myPermissions: [],
      globalRole: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
      personalOrganizationId: null,
    });
    const router = createDestinationRouter();

    await verifyWith(router);

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  // A deep link saved by requireAuth (?redirect=) must survive the onboarding
  // hop — the wizard forwards it and returns the user there after finishing.
  it('forwards the saved deep link onto /onboarding for a fresh signup', async () => {
    vi.mocked(queryClient.getQueryData).mockReturnValueOnce({
      user: {
        id: 'usr_1',
        email: 'user@example.com',
        isEmailVerified: true,
        isMfaEnabled: false,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        status: 'ACTIVE',
        createdAt: TS,
        updatedAt: TS,
      },
      activeOrganization: null,
      myPermissions: [],
      globalRole: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
      personalOrganizationId: null,
    });
    const router = createDestinationRouter(
      '/login?redirect=%2Forganization%2Facme%2Fsettings',
    );

    await verifyWith(router);

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    expect(router.state.location.search).toEqual({
      redirect: '/organization/acme/settings',
    });
  });

  it('shows inline resend and change-email helpers on the verify step', async () => {
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-email-verify-panel');

    expect(screen.getByText(/didn't receive a code/i)).toBeInTheDocument();
    expect(screen.getByTestId('auth-email-resend-countdown')).toHaveTextContent(/2:0/);
    expect(screen.getByText(/wrong email/i)).toBeInTheDocument();
    expect(screen.getByTestId('auth-email-change')).toHaveTextContent(
      /change email address/i,
    );
    expect(screen.queryByText(/use a different email/i)).not.toBeInTheDocument();
  });

  it('returns to the email step and clears any error when changing email', async () => {
    emailVerificationCodeSend.mockRejectedValueOnce(new Error('Send failed'));
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    // First send fails → banner shows on the email step.
    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));
    expect(await screen.findByTestId('auth-email-error-banner')).toBeInTheDocument();

    // A successful resend advances to verify, then change-email returns to the
    // email step with the error cleared.
    await user.click(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-email-verify-panel');
    await user.click(screen.getByTestId('auth-email-change'));

    expect(await screen.findByTestId('auth-email-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-email-error-banner')).not.toBeInTheDocument();
  });

  it('notifies the parent when the step changes', async () => {
    const onStepChange = vi.fn();
    const user = userEvent.setup();
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <AuthEmailPanel onStepChange={onStepChange} />,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(<RouterProvider router={router} />);

    // No mount-time echo: the parent already initialises to 'email', and the
    // effect that used to re-announce it is what made the step change land a
    // commit late (LOGIN-6). The contract is now "report transitions".
    expect(onStepChange).not.toHaveBeenCalled();

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await waitFor(() =>
      expect(onStepChange).toHaveBeenCalledWith('verify', 'user@example.com'),
    );
  });

  // Regression (LOGIN-6): the parent must learn about the step in the SAME
  // commit that renders it. When this was reported from an effect there was one
  // frame where the code boxes were on screen while the parent still showed the
  // welcome header and the OAuth picker, then the layout visibly collapsed.
  // Asserting "was told" is not enough — it has to be true by first paint.
  it('tells the parent about the verify step in the same commit that renders it', async () => {
    let sawVerifyInputBeforeParentWasTold = false;
    const onStepChange = vi.fn();
    const user = userEvent.setup();

    const Probe = () => {
      // Runs during the commit that first paints the verify step.
      const verifyPanelPainted = Boolean(
        document.querySelector('[data-testid="auth-email-verify-panel"]'),
      );
      if (verifyPanelPainted && onStepChange.mock.calls.length === 0) {
        sawVerifyInputBeforeParentWasTold = true;
      }
      return null;
    };

    const router = createTestRouter(() => (
      <>
        <AuthEmailPanel onStepChange={onStepChange} />
        <Probe />
      </>
    ));
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-email-verify-panel')).toBeInTheDocument(),
    );
    expect(onStepChange).toHaveBeenCalledWith('verify', 'user@example.com');
    expect(sawVerifyInputBeforeParentWasTold).toBe(false);
  });

  // Regression: a failed send-code must surface a VISIBLE error. Toasts fired
  // from the async catch can be dropped by sonner (created into history but
  // never made active), so the inline banner is the reliable feedback surface.
  // Without it the user pressed Continue and saw nothing.
  it('surfaces an inline error banner when sending the code fails', async () => {
    emailVerificationCodeSend.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));

    const banner = await screen.findByTestId('auth-email-error-banner');
    expect(banner).toHaveTextContent(/network error/i);
    expect(banner).toHaveAttribute('role', 'alert');
    // Stays on the email step (never advanced to verify).
    expect(screen.queryByTestId('auth-email-verify-panel')).not.toBeInTheDocument();
  });

  // Regression: a failed verify (wrong/expired code, backend error) must surface
  // a visible inline error on the verify step, not rely on a toast alone.
  it('surfaces an inline error banner when verifying the code fails', async () => {
    emailLogin.mockRejectedValueOnce(new Error('Bad code'));
    const user = userEvent.setup();
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
    await user.click(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-email-verify-panel');
    await user.type(await screen.findByTestId('auth-email-code'), '123456');

    const banner = await screen.findByTestId('auth-email-error-banner');
    expect(banner).toHaveTextContent(/bad code/i);
    expect(banner).toHaveAttribute('role', 'alert');
  });

  // ── LOGIN-5 ───────────────────────────────────────────────────────────────
  // navigateAfterEmailLogin was fire-and-forget and `pending` was cleared in a
  // `finally`, so the moment the code was ACCEPTED the verify screen handed the
  // button back — still mounted, still holding the code — while the destination
  // guards were only just starting. A second click then re-sent an already-used
  // code and painted a red error over a screen that was about to disappear.
  describe('post-login handoff (LOGIN-5)', () => {
    // `pending` is owned by AuthForm, not the panel — rendering the panel bare
    // means onPendingChange goes nowhere and the button can never lock. This
    // mirrors the parent's contract so the real lock is under test.
    function PanelWithPending() {
      const [pending, setPending] = useState<AuthContinuePending | null>(null);
      return <AuthEmailPanel pending={pending} onPendingChange={setPending} />;
    }

    // The default mocked context routes a fresh user to /onboarding, and that
    // branch is taken before any saved redirect — so that is the guard to hold.
    const pendingRouter = () =>
      createDestinationRouter('/login', '/onboarding', PanelWithPending);

    it('keeps the verify button locked while the navigation is still resolving', async () => {
      const user = userEvent.setup();
      render(<RouterProvider router={pendingRouter()} />);
      await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
      await user.click(screen.getByTestId('auth-email-submit'));
      await screen.findByTestId('auth-email-verify-panel');
      await user.type(await screen.findByTestId('auth-email-code'), '123456');

      await waitFor(() => expect(emailLogin).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(establishSession).toHaveBeenCalledTimes(1));

      // The screen is on its way out but still mounted: the guard has not resolved.
      expect(screen.getByTestId('auth-email-verify-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('dest-onboarding')).not.toBeInTheDocument();

      // It must not invite another attempt with a code that is already spent.
      const verify = screen.getByTestId('auth-email-verify');
      expect(verify).toBeDisabled();
      expect(verify).toHaveAttribute('aria-busy', 'true');
    });

    it('does not re-send an already-consumed code when the user clicks again', async () => {
      const user = userEvent.setup();
      render(<RouterProvider router={pendingRouter()} />);
      await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
      await user.click(screen.getByTestId('auth-email-submit'));
      await screen.findByTestId('auth-email-verify-panel');
      await user.type(await screen.findByTestId('auth-email-code'), '123456');

      await waitFor(() => expect(emailLogin).toHaveBeenCalledTimes(1));

      // The impatient second click, on a screen that is mid-handoff.
      await user.click(screen.getByTestId('auth-email-verify')).catch(() => undefined);

      expect(emailLogin).toHaveBeenCalledTimes(1);
      // ...and therefore no red "invalid code" banner over the departing screen.
      expect(screen.queryByTestId('auth-email-error-banner')).not.toBeInTheDocument();
    });
  });

  // ── LOGIN-7 ───────────────────────────────────────────────────────────────
  // Everything above renders the panel BARE, and that is how this shipped: in
  // the real app the panel sits inside the auth shell's form slot, which was
  // `key={pathname}` off `useLocation()`. That hook reports the PENDING
  // location, set the instant `navigate()` is called — so the key flipped while
  // `/login` was still the rendered match, React threw the slot away, and the
  // remounted panel came back at step one. The user, having just been told
  // their code was accepted, watched the "enter your email" screen fade back in
  // and sit there until the destination finished loading. Mount the real slot
  // around the panel and the whole defect is observable.
  describe('post-login handoff inside the auth shell (LOGIN-7)', () => {
    function PanelInAuthShell() {
      const [pending, setPending] = useState<AuthContinuePending | null>(null);
      return (
        <AuthFormSlot>
          <AuthEmailPanel pending={pending} onPendingChange={setPending} />
        </AuthFormSlot>
      );
    }

    async function verifyIntoHeldNavigation() {
      const user = userEvent.setup();
      render(
        <RouterProvider
          router={createDestinationRouter('/login', '/onboarding', PanelInAuthShell)}
        />,
      );
      await user.type(await screen.findByTestId('auth-email'), 'user@example.com');
      await user.click(screen.getByTestId('auth-email-submit'));
      await screen.findByTestId('auth-email-verify-panel');
      const slotBeforeNavigation = screen.getByTestId('auth-form-container');
      await user.type(await screen.findByTestId('auth-email-code'), '123456');

      await waitFor(() => expect(establishSession).toHaveBeenCalledTimes(1));
      return { slotBeforeNavigation };
    }

    it('never rewinds to the email step while the destination resolves', async () => {
      await verifyIntoHeldNavigation();

      // The router's pending location already reads /onboarding; the guard is
      // held open, so the auth screen is still the mounted match.
      expect(screen.getByTestId('auth-email-verify-panel')).toBeInTheDocument();
      // The regression itself: step one, back on screen, after a valid code.
      expect(screen.queryByTestId('auth-email')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dest-onboarding')).not.toBeInTheDocument();
    });

    it('keeps the same slot element, so no state below it is destroyed', async () => {
      const { slotBeforeNavigation } = await verifyIntoHeldNavigation();

      // Node identity is the direct test: the key lived on this element, so a
      // key change replaces it. Same node ⇒ nothing underneath remounted, which
      // is what preserves the step, the code, and the single-flight latches.
      expect(screen.getByTestId('auth-form-container')).toBe(slotBeforeNavigation);
      expect(screen.getByTestId('auth-email-verify')).toBeDisabled();
    });

    it('has no accessibility violations mid-handoff', async () => {
      await verifyIntoHeldNavigation();

      const results = await axe(screen.getByTestId('auth-form-container'));
      expect(results).toHaveNoViolations();
    });
  });

  it('has no accessibility violations on the email step', async () => {
    const router = createTestRouter();
    const { container } = render(<RouterProvider router={router} />);
    await screen.findByTestId('auth-email-panel');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
