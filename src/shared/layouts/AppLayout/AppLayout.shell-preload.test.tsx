import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const { sidebarChunk } = vi.hoisted(() => ({ sidebarChunk: { failuresLeft: 1 } }));

vi.mock('@/shared/layouts/AppLayout/variants/AppLayoutSidebar.tsx', async () => {
  if (sidebarChunk.failuresLeft > 0) {
    sidebarChunk.failuresLeft -= 1;
    // An async factory that REJECTS. A factory that throws synchronously makes the
    // module resolve to undefined instead — the preload then "succeeds", the shell
    // mounts, and React fails later with "Element type is invalid", which is a
    // different bug from the one under test.
    await Promise.reject(new Error('Failed to fetch dynamically imported module'));
  }
  // The recovery path, so a retry has something to succeed at. A stub and not
  // the real shell: this file is about whether the CHUNK arrives, and the real
  // sidebar's fetching children would drag their own failure modes into an
  // assertion that only has to say "the shell mounted". AppLayout.test.tsx is
  // where what is inside the shell gets asserted.
  return { SidebarShell: () => <div data-testid="sidebar" /> };
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
    // Every test starts from exactly one failed fetch. Only the retry test gets
    // as far as a second attempt, and that one is meant to succeed.
    //
    // This reset cannot rescue a test that runs AFTER the chunk has resolved
    // once: Vitest caches a mock factory's resolved exports and never calls the
    // factory again (it does not cache a rejection, which is why every test up
    // to that point does get a fresh failure). So the resolving test has to be
    // the last one in the file — a new test appended below it would silently
    // get a working shell and quietly stop testing the failure it named.
    sidebarChunk.failuresLeft = 1;
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

  /*
   * Retry was decoration. `onReset` cleared `shellError` and nothing else, but
   * the preload lives in an effect keyed on `[target, mounted]` and a reset
   * moves neither — `target` is derived from unchanged session context, and
   * `mounted` is still null precisely because the fetch failed. So nothing ever
   * called the loader again. The boundary handed back a render with `shellError`
   * null and `mounted` null, which is `LayoutVariantFallback`: no `<Outlet/>`,
   * no error, no button. Pressing Retry traded the error card for the permanent
   * skeleton this whole file exists to prevent.
   *
   * Asserting the shell MOUNTED, not just that the error card went away — the
   * broken version cleared the card too, on its way to the skeleton.
   *
   * Last in the file on purpose — see the caching note in `beforeEach`.
   */
  it('refetches on Retry and mounts the shell whose chunk had failed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppLayout />);
    await screen.findByTestId('app-shell-error');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('layout-variant-fallback')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
