import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useUnsavedChangesGuard } from './useUnsavedChangesGuard.tsx';

function GuardedPage({ dirty }: { dirty: boolean }) {
  const { guardDialog, isBlocked } = useUnsavedChangesGuard({ when: dirty });
  return (
    <div>
      <span data-testid="home">home</span>
      <span data-testid="blocked-state">{isBlocked ? 'blocked' : 'idle'}</span>
      <Link to="/other" data-testid="leave-link">
        leave
      </Link>
      {guardDialog}
    </div>
  );
}

function renderWithRouter(dirty: boolean) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <GuardedPage dirty={dirty} />,
  });
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => <div data-testid="other-page">elsewhere</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('useUnsavedChangesGuard', () => {
  it('lets navigation through when there are no unsaved changes', async () => {
    renderWithRouter(false);
    await screen.findByTestId('home');

    fireEvent.click(screen.getByTestId('leave-link'));

    expect(await screen.findByTestId('other-page')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('blocks navigation while dirty and opens the confirm dialog', async () => {
    renderWithRouter(true);
    await screen.findByTestId('home');

    fireEvent.click(screen.getByTestId('leave-link'));

    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-state')).toHaveTextContent('blocked');
    // Still on the guarded page.
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('other-page')).not.toBeInTheDocument();
  });

  it('confirming discards the changes and completes the navigation', async () => {
    renderWithRouter(true);
    await screen.findByTestId('home');

    fireEvent.click(screen.getByTestId('leave-link'));
    await screen.findByTestId('confirm-dialog');

    fireEvent.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('other-page')).toBeInTheDocument();
  });

  it('cancelling keeps the user on the page and clears the blocked state', async () => {
    renderWithRouter(true);
    await screen.findByTestId('home');

    fireEvent.click(screen.getByTestId('leave-link'));
    await screen.findByTestId('confirm-dialog');

    fireEvent.click(screen.getByTestId('confirm-cancel'));

    await waitFor(() =>
      expect(screen.getByTestId('blocked-state')).toHaveTextContent('idle'),
    );
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('other-page')).not.toBeInTheDocument();
  });
});
