import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_TITLE } from '@/lib/routes/page-head.ts';

// The component only needs router.subscribe — a hand-rolled stub keeps the
// test free of a full router (and of jsdom history plumbing).
type ResolvedHandler = (event: { pathChanged: boolean }) => void;
let resolvedHandler: ResolvedHandler | null = null;
const unsubscribe = vi.fn();
const subscribe = vi.fn((_event: string, handler: ResolvedHandler) => {
  resolvedHandler = handler;
  return unsubscribe;
});

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe }),
}));

import { RouteAnnouncer } from './RouteAnnouncer.tsx';

describe('RouteAnnouncer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolvedHandler = null;
    document.title = '';
  });

  afterEach(() => {
    document.title = '';
  });

  it('renders an empty polite live region before any navigation', () => {
    render(<RouteAnnouncer />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('');
    expect(subscribe).toHaveBeenCalledWith('onResolved', expect.any(Function));
  });

  it('announces the committed document title after a path change', async () => {
    render(<RouteAnnouncer />);

    document.title = `Dashboard · ${APP_TITLE}`;
    resolvedHandler?.({ pathChanged: true });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(`Dashboard · ${APP_TITLE}`),
    );
  });

  it('stays silent on hash-only navigations (settings modal)', async () => {
    render(<RouteAnnouncer />);

    document.title = `Sign in · ${APP_TITLE}`;
    resolvedHandler?.({ pathChanged: false });

    // Give a frame a chance to run — nothing should be announced.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('unsubscribes from router events on unmount', () => {
    const { unmount } = render(<RouteAnnouncer />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
