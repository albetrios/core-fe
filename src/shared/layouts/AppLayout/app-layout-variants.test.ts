import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SHELL_VARIANT } from '@/shared/layouts/AppLayout/resolve-app-shell.ts';
import type * as OrganizationStoreModule from '@/shared/store/useOrganizationStore/index.ts';
import type * as ThemeStoreModule from '@/shared/store/useThemeStore/index.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';

import type * as VariantsModule from './app-layout-variants.ts';

const env = vi.hoisted(() => ({
  deploymentOverrides: null as null | {
    personalOrganizations: boolean | null;
    teamOrganizations: boolean | null;
  },
}));
vi.mock('@/core/config/env.ts', () => ({ platformConfig: env }));

vi.mock('./variants/AppLayoutSidebar.tsx', () => ({ SidebarShell: () => null }));
vi.mock('./variants/AppLayoutTopNav.tsx', () => ({ TopNavShell: () => null }));
vi.mock('./variants/AppLayoutRail.tsx', () => ({ RailShell: () => null }));
vi.mock('./variants/AppLayoutFocus.tsx', () => ({ FocusShell: () => null }));

type Variants = typeof VariantsModule;
type OrganizationStore = (typeof OrganizationStoreModule)['useOrganizationStore'];
type ThemeStore = (typeof ThemeStoreModule)['useThemeStore'];

/**
 * Which shell chunks have been FETCHED — the whole point of this module. Each
 * loader is a `onceAsync`, so `peek()` is defined exactly for the chunks that
 * were requested and have landed.
 */
function fetched(variants: Variants): string[] {
  return [
    ['sidebar', variants.loadSidebarShell],
    ['topNav', variants.loadTopNavShell],
    ['rail', variants.loadRailShell],
    ['focus', variants.loadFocusShell],
  ]
    .filter(([, load]) => (load as Variants['loadSidebarShell']).peek() !== undefined)
    .map(([name]) => name as string);
}

describe('app-layout-variants', () => {
  let variants: Variants;
  let useOrganizationStore: OrganizationStore;
  let useThemeStore: ThemeStore;

  beforeEach(async () => {
    // A fresh module instance per test: `onceAsync` remembers what it fetched.
    // The stores come from the same fresh registry — the instances this module
    // reads are not the ones a static import at the top of this file would see.
    vi.resetModules();
    env.deploymentOverrides = null;
    variants = await import('./app-layout-variants.ts');
    ({ useOrganizationStore } =
      await import('@/shared/store/useOrganizationStore/index.ts'));
    ({ useThemeStore } = await import('@/shared/store/useThemeStore/index.ts'));
    useThemeStore.setState({ appVariant: 0 });
    useOrganizationStore.setState({ deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS });
  });

  it('fetches nothing just by being imported — the entry chunk imports this module', () => {
    expect(fetched(variants)).toEqual([]);
  });

  it('preloadAppShellVariant fetches exactly the shell asked for', async () => {
    await variants.preloadAppShellVariant(APP_SHELL_VARIANT.rail);

    expect(fetched(variants)).toEqual(['rail']);
  });

  it('shares one module promise between a preload and the lazy() that follows', () => {
    // Two promises would request the chunk twice and let Suspense flake.
    expect(variants.loadSidebarShell()).toBe(variants.loadSidebarShell());
  });

  describe('preloadSessionAppShell — the shell THIS session will mount', () => {
    it('is the sidebar for a multi-org session on the default preview variant', async () => {
      await variants.preloadSessionAppShell();

      expect(fetched(variants)).toEqual(['sidebar']);
    });

    it('is the Focus shell for a personal-only session', async () => {
      useOrganizationStore.setState({
        deploymentFlags: { personalOrganizations: true, teamOrganizations: false },
      });

      await variants.preloadSessionAppShell();

      expect(fetched(variants)).toEqual(['focus']);
    });

    it('follows the shuffle preview variant, exactly as AppLayout does', async () => {
      useThemeStore.setState({ appVariant: 1 });

      await variants.preloadSessionAppShell();

      expect(fetched(variants)).toEqual(['topNav']);
    });

    it('lets pinned env overrides win over the session flags', async () => {
      // Same merge as `useDeploymentFlags` — the two must never disagree, or the
      // loader warms one shell and the layout mounts another.
      env.deploymentOverrides = { personalOrganizations: true, teamOrganizations: false };

      await variants.preloadSessionAppShell();

      expect(fetched(variants)).toEqual(['focus']);
    });
  });

  it('preloadAllAppShellVariants warms every shell (test harness)', async () => {
    await variants.preloadAllAppShellVariants();

    expect(fetched(variants)).toEqual(['sidebar', 'topNav', 'rail', 'focus']);
  });
});
