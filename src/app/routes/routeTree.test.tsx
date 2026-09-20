import { beforeEach, describe, expect, it, vi } from 'vitest';

import { manifest as suspendedManifest } from '@/pages/organization/$organizationSlug/suspended/suspended.manifest.ts';

import { router } from './routeTree.tsx';

const gatewayExecutor = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const gatewayFromManifest = vi.hoisted(() =>
  vi.fn(() => gatewayExecutor as (context: unknown) => Promise<void>),
);
const requireAuth = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const shellLoads = vi.hoisted(() => ({ auth: vi.fn(), public: vi.fn() }));

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

  describe('cold entry routes show their pending state immediately (X-6)', () => {
    // `defaultPendingMs: 3000` keeps the CURRENT screen during in-app
    // navigation. On a cold load there is no current screen — `/` renders null,
    // the boot splash has faded, and the user gets a blank page with a 2px bar
    // for three seconds. The routes a cold visit can land on override it.
    type RouteOptions = {
      id: string;
      options: { pendingMs?: number; pendingComponent?: unknown };
    };
    const allRoutes = Object.values(router.routesById) as unknown as RouteOptions[];
    // Pathless routes carry a prefixed id, so match on the suffix.
    const routeEndingWith = (suffix: string) =>
      allRoutes.find((route) => route.id.endsWith(suffix));

    it('keeps the 3s default for in-app navigation', () => {
      expect(router.options.defaultPendingMs).toBe(3000);
    });

    it.each(['auth-shell', '/onboarding', '/organization'])(
      '%s renders its pending component at once',
      (suffix) => {
        const route = routeEndingWith(suffix);
        expect(route, `route ${suffix} is missing`).toBeDefined();
        expect(route?.options.pendingMs, `route ${suffix}`).toBe(0);
        expect(route?.options.pendingComponent, `route ${suffix}`).toBeDefined();
      },
    );

    it('the `/` resolver does too — it renders null, so 3s of it is a blank page', () => {
      const index = allRoutes.find((route) => route.id === '/');
      expect(index?.options.pendingMs).toBe(0);
      expect(index?.options.pendingComponent).toBeDefined();
    });

    it('leaves every other route on the default', () => {
      const immediate = allRoutes.filter((route) => route.options.pendingMs === 0);
      expect(immediate).toHaveLength(4);
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
  });

  it('suspended leaf runs the standard gateway on navigation', async () => {
    await beforeLoadOf('/organization/$organizationSlug/suspended')(gateArgs(false));
    expect(gatewayFromManifest).toHaveBeenCalledWith(suspendedManifest);
    expect(gatewayExecutor).toHaveBeenCalledWith({ kind: 'gate-context-sentinel' });
  });

  it('suspended leaf short-circuits on preload (no gateway side effects)', async () => {
    await beforeLoadOf('/organization/$organizationSlug/suspended')(gateArgs(true));
    expect(gatewayFromManifest).not.toHaveBeenCalled();
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
