import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireOrgStatus, requireSuspendedOrgStatus } from '@/app/guards/org-gates.ts';
import { manifest as suspendedManifest } from '@/pages/organization/$organizationSlug/suspended/suspended.manifest.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import {
  BOOT_PENDING_POLICY,
  createAppRouter,
  IN_APP_PENDING_POLICY,
  preloadBootRoutes,
  preloadSignedInShell,
  router,
} from './routeTree.tsx';

const gatewayExecutor = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const gatewayFromManifest = vi.hoisted(() =>
  vi.fn(() => gatewayExecutor as (context: unknown) => Promise<void>),
);
const requireAuth = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const shellLoads = vi.hoisted(() => ({ auth: vi.fn(), public: vi.fn() }));
const preloadAuthLayoutVariant = vi.hoisted(() =>
  vi.fn((_variant: number) => Promise.resolve()),
);
const preloadSessionAppShell = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/shared/layouts/AuthLayout/auth-layout-variants.ts', () => ({
  preloadAuthLayoutVariant,
}));
vi.mock('@/shared/layouts/AppLayout/app-layout-variants.ts', () => ({
  preloadSessionAppShell,
}));

vi.mock('@/shared/layouts/AuthLayout/index.ts', () => {
  shellLoads.auth();
  return { AuthLayout: () => null };
});
vi.mock('@/shared/layouts/PublicLayout/index.ts', () => {
  shellLoads.public();
  return { PublicLayout: () => null };
});

vi.mock('@/core/security/gateway.ts', () => ({ gatewayFromManifest }));
vi.mock('@/core/security/gate-context.ts', () => ({
  toGateContext: vi.fn(() => ({ kind: 'gate-context-sentinel' })),
}));
vi.mock('@/core/rbac/guards.ts', () => ({
  requireAuth,
  redirectIfAuthenticated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/guards/org-gates.ts', () => ({
  requireOrgStatus: vi.fn(),
  requirePersonalDashboardWorkspace: vi.fn().mockResolvedValue(undefined),
  requirePersonalDeployment: vi.fn(),
  requireProvisionedWorkspace: vi.fn().mockResolvedValue(undefined),
  requireSuspendedOrgStatus: vi.fn(),
  requireTeamDeployment: vi.fn(),
  resolveActiveOrg: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/guards/route-guards.ts', () => ({
  requireOnboardingWorkspace: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/tenancy/organization-resolver.ts', () => ({
  resolveRootRedirect: vi.fn().mockResolvedValue('/organization'),
}));

type BeforeLoad = (context: {
  location: { href: string };
  params: Record<string, string>;
  preload: boolean;
}) => Promise<void> | void;

function beforeLoadOf(routeId: string): BeforeLoad {
  const route = (
    router.routesById as Record<string, { options: { beforeLoad?: unknown } }>
  )[routeId];
  expect(route, `route ${routeId} must be registered`).toBeDefined();
  expect(
    route?.options.beforeLoad,
    `route ${routeId} must have beforeLoad`,
  ).toBeDefined();
  return route?.options.beforeLoad as BeforeLoad;
}

const gateArgs = (preload: boolean) => ({
  location: { href: '/organization/acme/suspended' },
  params: { organizationSlug: 'acme' },
  preload,
});

/**
 * Guards the router's performance/correctness contract:
 * - intent preloading is what makes lazy island chunks fetch on hover;
 * - zero preload staleness is what forces the side-effectful guard chain
 *   (org context sync, permission refetch) to re-run on real navigation
 *   instead of being satisfied by a hover preload.
 */
describe('router configuration', () => {
  it.each([
    ['auth-shell', 'auth'],
    ['public-shell', 'public'],
  ] as const)('preloads nested %s content through its route loader', async (id, key) => {
    const route = Object.values(router.routesById).find((item) => item.id.endsWith(id));
    const loader = route?.options.loader as (() => Promise<void> | undefined) | undefined;
    expect(loader).toBeTypeOf('function');
    expect(shellLoads[key]).not.toHaveBeenCalled();
    await loader?.();
    expect(shellLoads[key]).toHaveBeenCalledOnce();
    // TanStack removes the preload method after the component is cached.
    await loader?.();
    expect(shellLoads[key]).toHaveBeenCalledOnce();
  });

  it('preloads route chunks on intent', () => {
    expect(router.options.defaultPreload).toBe('intent');
  });

  it('treats preloaded matches as immediately stale (guards re-run on navigation)', () => {
    expect(router.options.defaultPreloadStaleTime).toBe(0);
  });

  it('has a pending component for suspended lazy islands', () => {
    expect(router.options.defaultPendingComponent).toBeDefined();
  });

  describe('pending policy — boot, then in-app (X-6)', () => {
    type RouteOptions = {
      id: string;
      options: { pendingMs?: number; pendingMinMs?: number; loader?: unknown };
    };
    const allRoutes = Object.values(router.routesById) as unknown as RouteOptions[];

    /** The event the router emits for the navigation that actually commits. */
    function resolveFirstNavigation(target: ReturnType<typeof createAppRouter>) {
      target.emit({ type: 'onResolved' } as Parameters<typeof target.emit>[0]);
    }

    it('boots showing the pending component at once — there is no screen to keep', () => {
      // The pending component is FullPageSpinner, which renders nothing on boot
      // but HOLDS the HTML splash. Deferring it 3s let the splash fade to a blank
      // page while a guard awaited the network.
      const fresh = createAppRouter();
      expect(fresh.options.defaultPendingMs).toBe(0);
      expect(fresh.options.defaultPendingComponent).toBeDefined();
    });

    it('does not hold the boot for the router’s built-in 500ms pending minimum', () => {
      // Regression: `defaultPendingMinMs` is 500 unless overridden, counted from
      // the moment the fallback renders. On boot the "spinner" is the splash the
      // user is already looking at, so there is nothing to flash — it just parked
      // every cold load for half a second (refresh answered at ~130ms, the login
      // screen's chunks not even requested until ~650ms).
      const fresh = createAppRouter();
      expect(fresh.options.defaultPendingMinMs).toBe(0);
      expect(BOOT_PENDING_POLICY).toEqual({
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
      });
    });

    it('settles into the in-app policy once the first navigation resolves', () => {
      // Now there IS a current screen: keep it for up to 3s while guards run, and
      // if the spinner does have to show, keep it long enough not to flash.
      const fresh = createAppRouter();

      resolveFirstNavigation(fresh);

      expect(fresh.options.defaultPendingMs).toBe(3000);
      expect(fresh.options.defaultPendingMinMs).toBe(500);
      expect(IN_APP_PENDING_POLICY).toEqual({
        defaultPendingMs: 3000,
        defaultPendingMinMs: 500,
      });
    });

    it('keeps every other router option across that switch', () => {
      const fresh = createAppRouter();
      const before = { ...fresh.options };

      resolveFirstNavigation(fresh);

      expect(fresh.options.routeTree).toBe(before.routeTree);
      expect(fresh.options.defaultPreload).toBe('intent');
      expect(fresh.options.defaultPreloadStaleTime).toBe(0);
      expect(fresh.options.defaultPendingComponent).toBe(before.defaultPendingComponent);
    });

    it('switches once — later navigations do not touch the options again', () => {
      const fresh = createAppRouter();
      const update = vi.spyOn(fresh, 'update');

      resolveFirstNavigation(fresh);
      resolveFirstNavigation(fresh);
      resolveFirstNavigation(fresh);

      expect(update).toHaveBeenCalledOnce();
    });

    it('no route opts out: the policy is the router’s, so every cold URL is covered', () => {
      // It used to be opted into by four routes (`/`, the auth shell,
      // `/onboarding`, `/organization`) — but a cold visit lands just as often on
      // a bookmarked dashboard or an emailed invite, which got the blank page.
      const overriding = allRoutes.filter(
        (route) =>
          route.options.pendingMs !== undefined ||
          route.options.pendingMinMs !== undefined,
      );
      expect(overriding.map((route) => route.id)).toEqual([]);
    });
  });

  describe('chunk warm-up', () => {
    type Loadable = { id: string; options: { loader?: () => unknown } };
    const routeEndingWith = (suffix: string) =>
      (Object.values(router.routesById) as unknown as Loadable[]).find((route) =>
        route.id.endsWith(suffix),
      );

    beforeEach(() => {
      preloadAuthLayoutVariant.mockClear();
      preloadSessionAppShell.mockClear();
    });

    it('the auth shell loader fetches the active layout variant with the layout', async () => {
      // The layout lazy-loads its variant only AFTER mounting, which cost a second
      // round trip (skeleton → variant → form) on the way to the login screen.
      useThemeStore.setState({ authVariant: 2 });

      await routeEndingWith('auth-shell')?.options.loader?.();

      expect(preloadAuthLayoutVariant).toHaveBeenCalledExactlyOnceWith(2);
      useThemeStore.setState({ authVariant: 0 });
    });

    it.each([['/organization/$organizationSlug'], ['personal-app']])(
      'the %s shell loader fetches the app shell the session calls for',
      async (suffix) => {
        // By the time a loader runs, `beforeLoad` has put me/context in the store,
        // so the shell can be fetched alongside the route's own chunks instead of
        // after AppLayout mounts.
        await routeEndingWith(suffix)?.options.loader?.();

        expect(preloadSessionAppShell).toHaveBeenCalledOnce();
      },
    );

    it('warms the sign-in side for a likely guest, in parallel with the auth bootstrap', async () => {
      preloadBootRoutes({ likelySignedIn: false });

      // The variant loaders are imported dynamically (they must stay out of the
      // entry chunk), so the call lands a tick after the warm-up starts.
      await vi.waitFor(() => expect(preloadAuthLayoutVariant).toHaveBeenCalledOnce());
      expect(preloadSessionAppShell).not.toHaveBeenCalled();
    });

    it('warms the app side for a likely signed-in user, not the sign-in side', async () => {
      preloadBootRoutes({ likelySignedIn: true });
      // Give a wrongly-started sign-in warm-up the same tick to show itself.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(preloadAuthLayoutVariant).not.toHaveBeenCalled();
      // The shell VARIANT is not guessed at boot: it depends on the session's
      // deployment flags, so the shell route's loader fetches it once me/context
      // is in the store.
      expect(preloadSessionAppShell).not.toHaveBeenCalled();
    });

    // Called on INTENT (an email submitted, an OAuth redirect started), not only
    // at boot — so it has to settle cleanly on its own rather than only as a
    // fire-and-forget branch of `preloadBootRoutes`.
    it('resolves when the signed-in shell is warmed directly', async () => {
      await expect(preloadSignedInShell()).resolves.toBeUndefined();

      // Same side as the signed-in boot hint: never the sign-in variant loaders.
      expect(preloadAuthLayoutVariant).not.toHaveBeenCalled();
    });

    it('never imports the variant loaders statically — the route tree IS the entry chunk', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const source = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'routeTree.tsx'),
        'utf8',
      );
      const staticImports = source
        .split('\n')
        .filter(
          (line) => line.startsWith('import ') && line.includes('-layout-variants'),
        );

      expect(staticImports).toEqual([]);
    });

    it('swallows a failed warm-up — the router loads the same chunk again, with a Retry', async () => {
      preloadAuthLayoutVariant.mockRejectedValueOnce(new Error('chunk 404'));

      expect(() => preloadBootRoutes({ likelySignedIn: false })).not.toThrow();
      // Let the rejection settle: an unhandled one would fail the run.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('wires an error component on every routed island (root handles the rest)', () => {
    const routes = Object.values(router.routesById).filter(
      (route) => route.id !== '__root__' && route.id !== '/',
    );
    for (const route of routes) {
      expect(route.options.errorComponent, `route ${route.id}`).toBeDefined();
    }
  });
});

describe('guard wiring in beforeLoad', () => {
  beforeEach(() => {
    gatewayExecutor.mockClear();
    gatewayFromManifest.mockClear();
    requireAuth.mockClear();
    vi.mocked(requireOrgStatus).mockClear();
    vi.mocked(requireSuspendedOrgStatus).mockClear();
  });

  it('suspended leaf runs the standard gateway on navigation', async () => {
    await beforeLoadOf('/organization/$organizationSlug/suspended')(gateArgs(false));
    expect(gatewayFromManifest).toHaveBeenCalledWith(suspendedManifest);
    expect(gatewayExecutor).toHaveBeenCalledWith({ kind: 'gate-context-sentinel' });
  });

  it('suspended leaf runs the INVERSE status guard, never requireOrgStatus', async () => {
    // The leaf is exempt from `requireOrgStatus` so a suspended organization can
    // render without looping — but exempt is not unguarded: the inverse guard
    // sends an organization that is NOT suspended back to its dashboard.
    await beforeLoadOf('/organization/$organizationSlug/suspended')(gateArgs(false));
    expect(requireSuspendedOrgStatus).toHaveBeenCalledTimes(1);
    expect(requireOrgStatus).not.toHaveBeenCalled();
  });

  it('dashboard runs requireOrgStatus, never the inverse', async () => {
    await beforeLoadOf('/organization/$organizationSlug/dashboard')(gateArgs(false));
    expect(requireOrgStatus).toHaveBeenCalledTimes(1);
    expect(requireSuspendedOrgStatus).not.toHaveBeenCalled();
  });

  it('suspended leaf short-circuits on preload (no gateway side effects)', async () => {
    await beforeLoadOf('/organization/$organizationSlug/suspended')(gateArgs(true));
    expect(gatewayFromManifest).not.toHaveBeenCalled();
    expect(requireSuspendedOrgStatus).not.toHaveBeenCalled();
  });

  it('picker and org shell bail out before requireAuth on preload', async () => {
    await beforeLoadOf('/organization')(gateArgs(true));
    await beforeLoadOf('/organization/$organizationSlug')(gateArgs(true));
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it('picker and org shell run requireAuth on real navigation', async () => {
    await beforeLoadOf('/organization')(gateArgs(false));
    await beforeLoadOf('/organization/$organizationSlug')(gateArgs(false));
    expect(requireAuth).toHaveBeenCalledTimes(2);
  });

  // Regression (INV-4): the signed-out check used to live in a passive effect
  // inside the page, so the "Joining…" card painted for a frame and then
  // vanished — for the COMMON case, since an invite recipient is usually not
  // signed in yet. Deciding it in beforeLoad costs zero frames, and passing
  // location.href carries the invite token back through login.
  it('accept-invite requires auth before it renders, carrying the invite link', async () => {
    const href = '/accept-invite/inv_abc?token=tok_123';
    await beforeLoadOf('/public-shell/accept-invite/$invitationId')({
      location: { href },
      params: { invitationId: 'inv_abc' },
      preload: false,
    });
    expect(requireAuth).toHaveBeenCalledWith(href);
  });
});
