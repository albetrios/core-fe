import { beforeEach, describe, expect, it, vi } from 'vitest';

import { manifest as suspendedManifest } from '@/pages/organization/$organizationSlug/suspended/suspended.manifest.ts';

import { router } from './routeTree.tsx';

const gatewayExecutor = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const gatewayFromManifest = vi.hoisted(() =>
  vi.fn(() => gatewayExecutor as (context: unknown) => Promise<void>),
);
const requireAuth = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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
  it('preloads route chunks on intent', () => {
    expect(router.options.defaultPreload).toBe('intent');
  });

  it('treats preloaded matches as immediately stale (guards re-run on navigation)', () => {
    expect(router.options.defaultPreloadStaleTime).toBe(0);
  });

  it('has a pending component for suspended lazy islands', () => {
    expect(router.options.defaultPendingComponent).toBeDefined();
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
