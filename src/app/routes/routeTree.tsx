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
import { ConsentBannerLazy } from '@/shared/components/ConsentBanner/index.ts';
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
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
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

/**
 * The variant loaders are imported DYNAMICALLY, never statically: this file is
 * the entry chunk, and the initial-JS budget has well under a kilobyte to spare.
 * A static import of either module costs more than that on every load, to save
 * one request on the loads that reach a shell. The import is a few hundred bytes
 * and runs alongside the route's own chunks, so nothing waits on it.
 */
function preloadAuthLayoutVariant(): Promise<unknown> {
  return import('@/shared/layouts/AuthLayout/auth-layout-variants.ts').then((m) =>
    m.preloadAuthLayoutVariant(useThemeStore.getState().authVariant),
  );
}

function preloadSessionAppShell(): Promise<unknown> {
  return import('@/shared/layouts/AppLayout/app-layout-variants.ts').then((m) =>
    m.preloadSessionAppShell(),
  );
}

/** The auth layout AND the variant it is about to lazy-load, side by side. */
function preloadAuthShell(): Promise<unknown> {
  return Promise.all([AuthLayout.preload?.(), preloadAuthLayoutVariant()]);
}

/**
 * Warm the chunks a cold load is about to need, WHILE the auth bootstrap is in
 * flight — called once from `main.tsx`.
 *
 * Every entry route awaits `/auth/refresh` in `beforeLoad` before the router
 * loads a single component, so the destination's chunks were requested only
 * after the network had answered: guard, THEN chunks, THEN (for the layouts) a
 * variant chunk. None of that depends on the answer. `likelySignedIn` is a hint,
 * not a decision — it only picks which side to warm first, and being wrong costs
 * a few idle kilobytes; the guards still decide where the user actually lands.
 *
 * Failures are swallowed on purpose: this is speculation. The router loads the
 * same chunks again through the normal path, where a failure has an error
 * boundary and a Retry (`onceAsync` and the route loaders do not cache a
 * rejection).
 */
export function preloadBootRoutes(hint: { likelySignedIn: boolean }): void {
  const warm = hint.likelySignedIn
    ? [
        PersonalShell.preload?.(),
        OrganizationShell.preload?.(),
        DashboardPage.preload?.(),
      ]
    : [preloadAuthShell(), LoginPage.preload?.()];
  Promise.all(warm).catch(() => undefined);
}

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
      {/* Cookie-consent gate for analytics (PostHog). Lazy: only an undecided
          visitor ever needs the card, so it stays out of the entry chunk. */}
      <ConsentBannerLazy />
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
const authShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth-shell',
  // Guest-only gateway (FE-18): a signed-in user never sees any auth page —
  // one redirect here covers every child (login, register, reset, mfa, …).
  beforeLoad: async () => {
    await redirectIfAuthenticated();
  },
  // Nested layouts are invisible to the router's component preloader — and so
  // is the variant the layout then lazy-loads, which used to cost one more round
  // trip AFTER the layout had mounted (skeleton → variant → form).
  loader: () => preloadAuthShell(),
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
  // The shell AppLayout will pick, fetched alongside the route's own chunks
  // rather than after the layout mounts (see preloadSessionAppShell).
  loader: () => preloadSessionAppShell(),
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
  loader: () => preloadSessionAppShell(),
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

/**
 * When the router shows its pending component, and for how long — two policies,
 * because "is anything on screen yet?" has two answers.
 *
 * **BOOT** — until the first navigation resolves. Nothing is on screen to keep:
 * the HTML splash is up, and the pending component (`FullPageSpinner`) renders
 * nothing of its own but HOLDS that splash. So it mounts at once (`pendingMs: 0`)
 * on EVERY cold URL — `/`, a bookmarked dashboard, an emailed invite link — which
 * is what makes the boot one continuous screen instead of a splash that fades to
 * a blank page while a guard awaits the network (X-6). It used to be opted into
 * by four routes; a cold visit can land on any of them.
 *
 * It is also not held for a minimum time. The router's built-in
 * `defaultPendingMinMs` is **500ms**, counted from the moment the fallback
 * renders. It exists so a spinner cannot flash — but on boot the "spinner" is the
 * splash the user is already looking at, so there is nothing to flash, and the
 * rule simply parked every cold load for half a second: a guest's `/auth/refresh`
 * was answered at ~130ms and the login screen's own chunks were not even
 * requested until ~650ms.
 *
 * **IN-APP** — from then on. There IS a current screen, so keep it for up to 3s
 * while guards run (the `RouteProgressBar` reports the work); if the full-page
 * spinner does have to appear, the 500ms minimum is right — it now would flash.
 * This also covers the hop after sign-in: `/login` → `/` used to swap the form
 * for a spinner immediately and then hold it for the same half second.
 */
export const BOOT_PENDING_POLICY = {
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
} as const;

/** After the first navigation resolves: keep the current screen; a spinner may not flash. */
export const IN_APP_PENDING_POLICY = {
  defaultPendingMs: 3000,
  defaultPendingMinMs: 500,
} as const;

/** Build the app router under the boot policy; it settles itself after first load. */
export function createAppRouter() {
  const appRouter = createRouter({
    routeTree,
    // Preload the destination island's chunk (and pure loaders) on hover/touch.
    defaultPreload: 'intent',
    // Preloaded guard results are immediately stale: beforeLoad re-runs on the
    // real navigation, so the side-effectful guard chain (org context sync,
    // permission refetch) is never satisfied by a hover.
    defaultPreloadStaleTime: 0,
    ...BOOT_PENDING_POLICY,
    defaultPendingComponent: () => <FullPageSpinner />,
  });

  // `onResolved` fires only for the navigation that actually commits — a `/` →
  // `/login` redirect is one boot, not two — so the policy flips exactly when
  // the first real screen is up.
  const unsubscribe = appRouter.subscribe('onResolved', () => {
    unsubscribe();
    appRouter.update({ ...appRouter.options, ...IN_APP_PENDING_POLICY });
  });

  return appRouter;
}

/** The app's one router — boots under {@link BOOT_PENDING_POLICY}, then settles itself. */
export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
