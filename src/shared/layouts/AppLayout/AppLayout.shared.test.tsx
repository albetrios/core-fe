import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { AppMain } from './AppLayout.shared.tsx';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// The verification banner is a sibling of the scrolling region and has nothing
// to do with it; stubbing it keeps this file off the me/context + captcha graph.
vi.mock('@/shared/components/EmailVerificationBanner/index.ts', () => ({
  EmailVerificationBanner: () => null,
}));

const userA: AuthUser = { id: 'user-a', email: 'ada@example.com', role: 'user' };
const userB: AuthUser = { id: 'user-b', email: 'bo@example.com', role: 'user' };

function signIn(user: AuthUser) {
  act(() => {
    useAuthStore.getState().setUser(user);
  });
}

/** What every local logout path does here: `clearLocalAuthState() → clearAuth()`. */
function signOut() {
  act(() => {
    useAuthStore.getState().clearAuth();
  });
}

/** Mount the scrolling content region and hand back its `<main>`. */
async function mountMain() {
  const view = renderWithProviders(<AppMain />);
  return { view, main: await view.findByTestId('main-content') };
}

/**
 * Scroll `<main>` and let the layout record the offset. The writer is throttled
 * to an animation frame on purpose, so dispatching the event is not enough —
 * the frame has to actually run.
 */
async function scrollMainTo(main: HTMLElement, top: number) {
  main.scrollTop = top;
  await act(async () => {
    main.dispatchEvent(new Event('scroll'));
    // Queued after the component's own callback, so it resolves behind it.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe('AppMain — scroll restore across a shell swap', () => {
  beforeEach(() => {
    // Reset the carried offset the way the app does, then start a session.
    signOut();
    signIn(userA);
  });

  it('sanity: jsdom stores a written scrollTop', () => {
    const { container } = render(<div data-testid="probe" />);
    const el = container.firstElementChild as HTMLElement;
    el.scrollTop = 120;
    expect(el.scrollTop).toBe(120);
  });

  it('SHELL-1 — carries the offset onto the replacement <main>', async () => {
    const first = await mountMain();
    await scrollMainTo(first.main, 240);
    first.view.unmount();

    // A shell swap mounts a DIFFERENT <main>; the browser has nothing of its
    // own to restore, so the position has to come from the layout. Breaking
    // this is the regression the module-level offset exists to prevent.
    const second = await mountMain();
    expect(second.main.scrollTop).toBe(240);
  });

  describe('the offset belongs to the session, not to the tab', () => {
    it('does not chase the previous user to their position after a re-login', async () => {
      const first = await mountMain();
      await scrollMainTo(first.main, 360);
      first.view.unmount();

      signOut();
      signIn(userB);

      // Ada scrolled; Bo did not. Without the reset, Bo's first 1.5s on a page
      // he has never scrolled are spent being dragged to Ada's offset.
      const second = await mountMain();
      expect(second.main.scrollTop).toBe(0);
    });

    it('does not survive a re-login as the same user either', async () => {
      const first = await mountMain();
      await scrollMainTo(first.main, 180);
      first.view.unmount();

      signOut();
      signIn(userA);

      // A new session is a new session. Keying the offset to the user id would
      // pass the test above and quietly fail this one.
      const second = await mountMain();
      expect(second.main.scrollTop).toBe(0);
    });
  });
});
