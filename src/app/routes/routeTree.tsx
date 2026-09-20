import {
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  lazyRouteComponent,
  notFound,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Suspense } from 'react';

import {
  requireOrgStatus,
  requirePersonalDashboardWorkspace,
  requirePersonalDeployment,
  requireProvisionedWorkspace,
  requireTeamDeployment,
  resolveActiveOrg,
} from '@/app/guards/org-gates.ts';
import { requireOnboardingWorkspace } from '@/app/guards/route-guards.ts';
import { redirectIfAuthenticated, requireAuth } from '@/core/rbac/guards.ts';
import { toGateContext } from '@/core/security/gate-context.ts';
import { gatewayFromManifest } from '@/core/security/gateway.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { ensureNamespace } from '@/lib/i18n/load-namespace.ts';
import { I18N_NAMESPACES, type I18nNamespace } from '@/lib/i18n/namespaces.ts';
import {
  APP_DESCRIPTION,
  APP_TITLE,
  composePageTitle,
  manifestHead,
} from '@/lib/routes/page-head.ts';
import { parseInvitationIdParam, parseOAuthProviderParam } from '@/lib/routes/params.ts';
import { manifest as acceptInviteManifest } from '@/pages/accept-invite/accept-invite.manifest.ts';
import { manifest as callbackManifest } from '@/pages/callback/callback.manifest.ts';
import { validateCallbackSearch } from '@/pages/callback/callback.search.ts';
import { manifest as loginManifest } from '@/pages/login/login.manifest.ts';
import { validateLoginSearch } from '@/pages/login/login.search.ts';
import { manifest as mfaManifest } from '@/pages/mfa/mfa.manifest.ts';
import { manifest as onboardingManifest } from '@/pages/onboarding/onboarding.manifest.ts';
import { validateOnboardingSearch } from '@/pages/onboarding/onboarding.search.ts';
import { manifest as dashboardManifest } from '@/pages/organization/$organizationSlug/dashboard/dashboard.manifest.ts';
import { manifest as organizationShellManifest } from '@/pages/organization/$organizationSlug/organization-slug.manifest.ts';
import { manifest as suspendedManifest } from '@/pages/organization/$organizationSlug/suspended/suspended.manifest.ts';
import { manifest as organizationPickerManifest } from '@/pages/organization/organization.manifest.ts';
import { AppearanceDialogLazy } from '@/shared/components/AppearanceDialog/index.ts';
import { ConsentBanner } from '@/shared/components/ConsentBanner/index.ts';
import { FloatingEdgeControls } from '@/shared/components/FloatingEdgeControls/index.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';
import { OfflineIndicator } from '@/shared/components/OfflineIndicator/index.ts';
import { RouteAnnouncer } from '@/shared/components/RouteAnnouncer/index.ts';
import { RouteErrorBoundary } from '@/shared/components/RouteErrorBoundary/index.ts';
import { RouteProgressBar } from '@/shared/components/RouteProgressBar/index.ts';
import { SettingsModalLazy } from '@/shared/components/SettingsModal/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { AppToaster } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';
import { resolveRootRedirect } from '@/shared/tenancy/organization-resolver.ts';

import { ErrorBoundary } from './ErrorBoundary.tsx';

// ── Lazy components ──
// lazyRouteComponent (not React.lazy): the router can call `.preload()` on
// these, which is what makes `defaultPreload: 'intent'` actually fetch the
// island's chunk on hover/touch. Suspension is handled by the router's
// defaultPendingComponent.
function localizedRoute<T>(namespaces: readonly I18nNamespace[], load: () => Promise<T>) {
  return async () => {
    const locale = useLocaleStore.getState().locale;
    const [, module] = await Promise.all([
      Promise.all(namespaces.map((ns) => ensureNamespace(locale, ns))),
      load(),
    ]);
    return module;
  };
}

const AuthLayout = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.auth],
    () => import('@/shared/layouts/AuthLayout/index.ts'),
  ),
  'AuthLayout',
);
const LoginPage = lazyRouteComponent(
  localizedRoute([I18N_NAMESPACES.auth], () => import('@/pages/login/login.route.tsx')),
  'Component',
);
const MfaPage = lazyRouteComponent(
  localizedRoute([I18N_NAMESPACES.auth], () => import('@/pages/mfa/mfa.route.tsx')),
  'Component',
);
const CallbackPage = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.auth],
    () => import('@/pages/callback/callback.route.tsx'),
  ),
  'Component',
);
const OnboardingPage = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.onboarding, I18N_NAMESPACES.auth, I18N_NAMESPACES.settings],
    () => import('@/pages/onboarding/onboarding.route.tsx'),
  ),
  'Component',
);
const AcceptInvitePage = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.auth],
    () => import('@/pages/accept-invite/accept-invite.route.tsx'),
  ),
  'Component',
);
const UnauthorizedPage = lazyRouteComponent(
  () => import('@/app/routes/UnauthorizedPage.tsx'),
  'Component',
);
const OrganizationPickerPage = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.auth],
    () => import('@/pages/organization/organization.route.tsx'),
  ),
  'Component',
);
const OrganizationShell = lazyRouteComponent(
  () => import('@/pages/organization/$organizationSlug/organization-slug.route.tsx'),
  'Component',
);
const DashboardPage = lazyRouteComponent(
  localizedRoute(
    [I18N_NAMESPACES.dashboard],
    () => import('@/pages/organization/$organizationSlug/dashboard/dashboard.route.tsx'),
  ),
  'Component',
);
// Personal-org space reuses the shared AppLayout directly (no org param in URL).
const PersonalShell = lazyRouteComponent(
  () => import('@/shared/layouts/AppLayout/index.ts'),
  'Component',
);
const SuspendedPage = lazyRouteComponent(
  () => import('@/pages/organization/$organizationSlug/suspended/suspended.route.tsx'),
  'Component',
);
const NotFoundPage = lazyRouteComponent(
  () => import('@/app/routes/NotFoundPage.tsx'),
  'Component',
);
const PublicLayout = lazyRouteComponent(
  () => import('@/shared/layouts/PublicLayout/index.ts'),
  'PublicLayout',
);

// ── Root ──
const rootRoute = createRootRoute({
  head: () => ({
    meta: [{ title: APP_TITLE }, { name: 'description', content: APP_DESCRIPTION }],
  }),
  component: () => (
    <>
      <HeadContent />
      {/* Top progress bar for in-app navigations (e.g. org switch) — feedback
          without blanking the page to a full-screen spinner. */}
      <RouteProgressBar />
      <div className="bg-background text-foreground min-h-screen">
        {/* Settings is ready alongside every authenticated app outlet. */}
        <SettingsModalLazy />
      </div>
      {/* Right-edge handles: appearance (when unlocked) + language. Contains
          itself — see FloatingEdgeControls. */}
      <FloatingEdgeControls />
      {/* Dedicated Appearance dialog — its own surface, opened via useUIStore.
          A fixed-position overlay mounted at the ROOT: without its own boundary
          a throw in here reached the global fallback and replaced the entire
          app. Silent, because an overlay has nowhere in the layout to put an
          error card — the dialog just is not there, and the throw is reported. */}
      <SectionErrorBoundary
        title={i18n.t(ERRORS_KEYS.widget.appearance, { ns: ERRORS_NS })}
        variant="silent"
      >
        <AppearanceDialogLazy />
      </SectionErrorBoundary>
      {/* Dedicated Language & region dialog — mirrors Appearance, opened via useUIStore. */}
      <OfflineIndicator />
      {/* aria-live announcer: reads the new document.title on navigation. */}
      <RouteAnnouncer />
      {/* Cookie-consent gate for analytics (PostHog). */}
      <ConsentBanner />
      <AppToaster />
    </>
  ),
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: ({ error }) => <ErrorBoundary error={error} />,
});

// ── Auth shell ──
// Pathless layout route (`id`, not `path`): mounts the split-screen AuthLayout
// once over every auth page; the pages keep their top-level URLs (/login, …).
// AuthLayout is rendered inside a custom component (it wraps Outlet), so it
// keeps a local Suspense boundary — the router only manages route components.
/**
 * Pending config for the **network-gated entry routes** — `/`, the auth shell,
 * `/onboarding`, `/organization`.
 *
 * `defaultPendingMs: 3000` below is right for in-app navigation: it keeps the
 * current screen up while a guard runs, and the `RouteProgressBar` reports the
 * work. On a **cold load** there is no current screen — the `/` resolver renders
 * `null`, the boot splash has already faded out after first paint, and the user
 * sits in front of a blank page with a 2px bar for up to three seconds (X-6).
 * These four routes are exactly the ones a cold visit lands on, and every one of
 * them awaits the network before it can render anything, so they show the
 * spinner immediately instead.
 */
const COLD_ENTRY_PENDING = {
  pendingMs: 0,
  pendingComponent: () => <FullPageSpinner />,
} as const;

const authShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth-shell',
  // Guest-only gateway (FE-18): a signed-in user never sees any auth page —
  // one redirect here covers every child (login, register, reset, mfa, …).
  beforeLoad: async () => {
    await redirectIfAuthenticated();
  },
  // Nested layouts are invisible to the router's component preloader.
  loader: () => AuthLayout.preload?.(),
  // Cold entry: nothing is on screen to keep, so the 3s default leaves the user
  // looking at 2px of progress bar. Show the spinner immediately here (X-6).
  ...COLD_ENTRY_PENDING,

  component: () => (
    <Suspense fallback={<FullPageSpinner />}>
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    </Suspense>
  ),
  errorComponent: RouteErrorBoundary,
});

// ── Public ──
const loginRoute = createRoute({
  getParentRoute: () => authShellRoute,
  path: '/login',
  head: manifestHead(loginManifest),
  validateSearch: validateLoginSearch,
  component: LoginPage,
  errorComponent: RouteErrorBoundary,
});

const mfaRoute = createRoute({
  getParentRoute: () => authShellRoute,
  path: '/mfa',
  head: manifestHead(mfaManifest),
  component: MfaPage,
  errorComponent: RouteErrorBoundary,
});

// One provider-specific OAuth return URL per third party (/callback/google,
// /callback/github, …) — the landing page forwards code+state to the backend.

// ── Public shell ──
// Pathless layout for callback, onboarding, accept-invite, and unauthorized —
// centered chrome without the auth split-screen or app sidebar.
const publicShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'public-shell',
  loader: () => PublicLayout.preload?.(),
  component: () => (
    <Suspense fallback={<FullPageSpinner />}>
      <PublicLayout />
    </Suspense>
  ),
  errorComponent: RouteErrorBoundary,
});

const callbackRoute = createRoute({
  getParentRoute: () => publicShellRoute,
  path: '/callback/$provider',
  head: manifestHead(callbackManifest),
  validateSearch: validateCallbackSearch,
  beforeLoad: ({ params }) => {
    if (!parseOAuthProviderParam(params.provider)) throw notFound();
  },
  component: CallbackPage,
  errorComponent: RouteErrorBoundary,
});

const onboardingRoute = createRoute({
  getParentRoute: () => publicShellRoute,
  path: '/onboarding',
  head: manifestHead(onboardingManifest),
  validateSearch: validateOnboardingSearch,
  beforeLoad: async ({ location }) => {
    await requireAuth(location.href);
    await requireOnboardingWorkspace();
  },
  // Cold entry: nothing is on screen to keep, so the 3s default leaves the user
  // looking at 2px of progress bar. Show the spinner immediately here (X-6).
  ...COLD_ENTRY_PENDING,

  component: OnboardingPage,
  errorComponent: RouteErrorBoundary,
});

const acceptInviteRoute = createRoute({
  getParentRoute: () => publicShellRoute,
  path: '/accept-invite/$invitationId',
  head: manifestHead(acceptInviteManifest),
  beforeLoad: async ({ params, location }) => {
    if (!parseInvitationIdParam(params.invitationId)) throw notFound();
    // Accepting needs a signed-in session whose email matches the invite, and
    // the recipient usually is NOT signed in yet — that is the common path, not
    // the edge case. The page used to check this in a passive effect, so the
    // "Joining…" card painted first and then vanished (INV-4). `requireAuth`
    // awaits the auth bootstrap before deciding, so a cold load of an emailed
    // link does not bounce an already-signed-in user, and `location.href`
    // carries the token back through login.
    await requireAuth(location.href);
  },
  component: AcceptInvitePage,
  errorComponent: RouteErrorBoundary,
});

const unauthorizedRoute = createRoute({
  getParentRoute: () => publicShellRoute,
  path: '/unauthorized',
  head: () => ({ meta: [{ title: composePageTitle('Unauthorized') }] }),
  component: UnauthorizedPage,
  errorComponent: RouteErrorBoundary,
});

// ── Index resolver ──
// `/` keeps no UI: last-used organization → its dashboard, else the
// `/organization` picker, else onboarding (routing-and-tenancy.md §2).
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ location, preload }) => {
    // Resolving `/` triggers fetches and always throws a redirect — pointless
    // (and side-effectful) for hover preloads.
    if (preload) return;
    await requireAuth(location.href);
    throw redirect(await resolveRootRedirect());
  },
  // Cold entry: nothing is on screen to keep, so the 3s default leaves the user
  // looking at 2px of progress bar. Show the spinner immediately here (X-6).
  ...COLD_ENTRY_PENDING,
  component: () => null,
});

// ── Organization picker (/organization) ──
const organizationPickerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/organization',
  head: manifestHead(organizationPickerManifest),
  beforeLoad: async ({ location, preload }) => {
    if (preload) return;
    await requireAuth(location.href);
    await requireProvisionedWorkspace({ params: {}, redirectFrom: location.href });
  },
  // Cold entry: nothing is on screen to keep, so the 3s default leaves the user
  // looking at 2px of progress bar. Show the spinner immediately here (X-6).
  ...COLD_ENTRY_PENDING,
  component: OrganizationPickerPage,
  errorComponent: RouteErrorBoundary,
});

// ── Organization shell (/organization/$organizationSlug) ──
// The URL is the single source of truth for organization context: the guard
// chain validates the param, confirms membership (404 otherwise), syncs the
// derived store, and refetches per-organization permissions on change.
const organizationShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/organization/$organizationSlug',
  head: manifestHead(organizationShellManifest),
  beforeLoad: async ({ location, params, preload }) => {
    if (preload) return;
    await requireAuth(location.href);
    requireTeamDeployment({ params });
    await requireProvisionedWorkspace({ params, redirectFrom: location.href });
    await resolveActiveOrg({ params });
  },
  component: function OrganizationShellRoute() {
    const isLoading = useAuthStore((s) => s.isLoading);
    if (isLoading) return <FullPageSpinner />;
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <OrganizationShell />
      </Suspense>
    );
  },
  errorComponent: RouteErrorBoundary,
});

const organizationDashboardRoute = createRoute({
  getParentRoute: () => organizationShellRoute,
  path: 'dashboard',
  head: manifestHead(dashboardManifest),
  beforeLoad: async ({ params, preload, location }) => {
    if (preload) return;
    await gatewayFromManifest(dashboardManifest)(toGateContext(location, params));
    requireOrgStatus({ params });
  },
  component: DashboardPage,
  errorComponent: RouteErrorBoundary,
});

// Runs the standard leaf gateway (session → module → permission) but stays
// OUTSIDE `requireOrgStatus` on purpose: a suspended organization must still
// be able to render its blocked state without redirect-looping.
const organizationSuspendedRoute = createRoute({
  getParentRoute: () => organizationShellRoute,
  path: 'suspended',
  head: manifestHead(suspendedManifest),
  beforeLoad: async ({ params, preload, location }) => {
    if (preload) return;
    await gatewayFromManifest(suspendedManifest)(toGateContext(location, params));
  },
  component: SuspendedPage,
  errorComponent: RouteErrorBoundary,
});

// ── Personal space (/dashboard) ──
// Personal organizations land on root URLs — no `$organizationSlug` in the path.
// The active org comes from the session context (me/context / JWT), not the URL,
// so this shell only requires an authenticated session. (Dual-URL, research/11
// §3.3.) The org-scoped team space remains `/organization/$organizationSlug/*`.
const personalShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'personal-app',
  beforeLoad: async ({ location, preload }) => {
    if (preload) return;
    await requireAuth(location.href);
    requirePersonalDeployment({});
    await requirePersonalDashboardWorkspace({ redirectFrom: location.href });
  },
  component: function PersonalShellRoute() {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <PersonalShell />
      </Suspense>
    );
  },
  errorComponent: RouteErrorBoundary,
});

const personalDashboardRoute = createRoute({
  getParentRoute: () => personalShellRoute,
  path: '/dashboard',
  head: manifestHead(dashboardManifest),
  beforeLoad: async ({ preload, location, params }) => {
    if (preload) return;
    await gatewayFromManifest(dashboardManifest)(toGateContext(location, params));
  },
  component: DashboardPage,
  errorComponent: RouteErrorBoundary,
});

// Settings is no longer a route space: the global SettingsModal (mounted on
// the root route) is driven by the URL hash — #settings/<scope>/<section> —
// so it overlays any page without unmounting it. See
// shared/components/SettingsModal/ and routing-and-tenancy.md §7.

// ── 404 ──
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  head: () => ({ meta: [{ title: composePageTitle('Page not found') }] }),
  component: NotFoundPage,
  errorComponent: RouteErrorBoundary,
});

// ── Tree ──
const routeTree = rootRoute.addChildren([
  indexRoute,
  authShellRoute.addChildren([loginRoute, mfaRoute]),
  publicShellRoute.addChildren([
    callbackRoute,
    onboardingRoute,
    acceptInviteRoute,
    unauthorizedRoute,
  ]),
  organizationPickerRoute,
  organizationShellRoute.addChildren([
    organizationDashboardRoute,
    organizationSuspendedRoute,
  ]),
  personalShellRoute.addChildren([personalDashboardRoute]),
  notFoundRoute,
]);

export const router = createRouter({
  routeTree,
  // Preload the destination island's chunk (and pure loaders) on hover/touch.
  defaultPreload: 'intent',
  // Preloaded guard results are immediately stale: beforeLoad re-runs on the
  // real navigation, so the side-effectful guard chain (org context sync,
  // permission refetch) is never satisfied by a hover.
  defaultPreloadStaleTime: 0,
  // Keep the current screen rendered during in-app navigations (e.g. switching
  // org) instead of blanking to a full-page spinner — the RouteProgressBar gives
  // feedback. The full-page spinner only appears if a navigation is genuinely
  // stuck (> 3s); the initial boot still shows it via the shell's isLoading gate.
  defaultPendingMs: 3000,
  defaultPendingComponent: () => <FullPageSpinner />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
