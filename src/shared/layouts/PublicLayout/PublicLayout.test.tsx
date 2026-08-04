import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { PublicLayout } from './PublicLayout.tsx';

function renderInRouter() {
  const rootRoute = createRootRoute({ component: PublicLayout });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="child">child content</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('PublicLayout', () => {
  // Preload lazy shells so Suspense doesn't flake under full-suite contention.
  beforeAll(async () => {
    await Promise.all([
      import('./variants/PublicLayoutCentered.tsx'),
      import('./variants/PublicLayoutCard.tsx'),
      import('./variants/PublicLayoutBrand.tsx'),
    ]);
  }, 30_000);

  beforeEach(() => {
    useThemeStore.setState({ publicVariant: 0 });
  });

  it('renders centered chrome with the routed child via <Outlet>', async () => {
    renderInRouter();
    expect(
      await screen.findByTestId('public-layout', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('child content');
  });

  it('renders the card preview variant (1)', async () => {
    useThemeStore.setState({ publicVariant: 1 });
    renderInRouter();
    expect(
      await screen.findByTestId('public-layout', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('child content');
  });
});
