import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ErrorHandlerModule from '@/shared/errors/errorHandler.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { useMeContextMock } = vi.hoisted(() => ({ useMeContextMock: vi.fn() }));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

/*
 * The failure this file exists for: the shell's chunk never arrives — a network
 * blip, or the stale hashed-chunk 404 that follows a deploy. Rejecting the
 * dynamic import is the faithful reproduction; a thrown render is a different
 * bug with a different path.
 *
 * Lives in its own file because the rejection has to be in place before
 * AppLayout's module-scope `onceAsync` loaders are created — a per-test toggle
 * would be memoised away by the first passing test.
 */
vi.mock('@/shared/layouts/AppLayout/variants/AppLayoutSidebar.tsx', async () => {
  // An async factory that REJECTS. A factory that throws synchronously makes the
  // module resolve to undefined instead — the preload then "succeeds", the shell
  // mounts, and React fails later with "Element type is invalid", which is a
  // different bug from the one under test.
  await Promise.reject(new Error('Failed to fetch dynamically imported module'));
  return {};
});

const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => ({
  ...(await importOriginal<ErrorHandlerModule>()),
  reportError: reportErrorMock,
}));

const { Component: AppLayout } = await import('@/shared/layouts/AppLayout/AppLayout.tsx');

describe('SHELL-2 — a shell chunk that never arrives', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportErrorMock.mockClear();
    // The shell is derived ONLY from a loaded context (SHELL-1), and it must
    // resolve to the SIDEBAR variant — that is the chunk mocked to reject above.
    useMeContextMock.mockReturnValue({
      data: {
        user: null,
        activeOrganization: null,
        myPermissions: [],
        globalRole: null,
        organizations: [],
        deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS,
        personalOrganizationId: null,
      },
      isSuccess: true,
      isLoading: false,
      isPending: false,
      isError: false,
    });
    useThemeStore.setState({ appVariant: 0 });
  });

  /*
   * Before: the preload was `void …then(setMounted)` with no rejection handler,
   * so `mounted` stayed null forever. That renders LayoutVariantFallback, which
   * has NO <Outlet/> — the whole authenticated app sat on a skeleton with no
   * content, no error, no retry, and nothing in Sentry. The effect deps never
   * changed again, so it never retried, and the boundary could not help because
   * nothing threw during render.
   */
  it('surfaces the failure in the shell boundary instead of holding a skeleton', async () => {
    renderWithProviders(<AppLayout />);

    expect(await screen.findByTestId('app-shell-error')).toBeInTheDocument();
    // The container survives — this is contained, not a whole-app crash.
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('reports the failure rather than leaving an unhandled rejection', async () => {
    renderWithProviders(<AppLayout />);
    await screen.findByTestId('app-shell-error');

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: 'app-shell-preload' }),
    );
    consoleError.mockRestore();
  });
});
