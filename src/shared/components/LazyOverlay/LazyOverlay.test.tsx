import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, lazy, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onceAsync } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { LazyOverlay } from './LazyOverlay.tsx';

function Loaded() {
  return <div data-testid="loaded-overlay">loaded</div>;
}

describe('LazyOverlay', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the pending surface while the chunk is in flight (SHELL-4)', async () => {
    // Held open: `fallback={null}` turned the click that opened an overlay into
    // a dead click, so what renders in THIS window is the whole point.
    const load = () => new Promise<{ default: ComponentType }>(() => {});
    renderWithProviders(
      <LazyOverlay
        load={load}
        pending={<div data-testid="pending" />}
        title="Settings"
      />,
    );

    expect(await screen.findByTestId('pending')).toBeInTheDocument();
    expect(screen.queryByTestId('loaded-overlay')).not.toBeInTheDocument();
  });

  it('contains a failed chunk instead of letting it blank the page (SHELL-3)', async () => {
    const load = () => Promise.reject(new Error('chunk 404'));
    renderWithProviders(
      <SectionErrorBoundary title="Page content" testId="outer-boundary">
        <LazyOverlay
          load={load}
          pending={<div data-testid="pending" />}
          title="Settings"
        />
      </SectionErrorBoundary>,
    );

    expect(await screen.findByTestId('lazy-overlay-error')).toBeInTheDocument();
    // It never reached the surface above it — that escalation is what replaced
    // the whole page with "Something went wrong".
    expect(screen.queryByTestId('outer-boundary')).not.toBeInTheDocument();
  });

  it('Retry actually refetches and recovers — React.lazy caches the rejection', async () => {
    // `onceAsync` clears the cached import promise; `useRetryableLazy` builds a
    // NEW lazy component. Without the second half, React replays the cached
    // rejection forever and the Retry button does nothing.
    let attempt = 0;
    const factory = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('flaky chunk'))
        : Promise.resolve({ default: Loaded as ComponentType });
    });
    const load = onceAsync(factory);

    const user = userEvent.setup();
    renderWithProviders(
      <LazyOverlay
        load={load}
        pending={<div data-testid="pending" />}
        title="Settings"
      />,
    );

    await screen.findByTestId('lazy-overlay-error');
    expect(factory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('lazy-overlay-retry'));

    expect(await screen.findByTestId('loaded-overlay')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('lazy-overlay-error')).not.toBeInTheDocument();
  });

  it('offers a way out when the chunk will not load', async () => {
    const onDismiss = vi.fn();
    const load = () => Promise.reject(new Error('chunk 404'));
    const user = userEvent.setup();
    renderWithProviders(
      <LazyOverlay
        load={load}
        pending={<div data-testid="pending" />}
        title="Settings"
        onDismiss={onDismiss}
      />,
    );

    await user.click(await screen.findByTestId('lazy-overlay-dismiss'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('control: a bare React.lazy can NEVER recover — the rejection is cached', async () => {
    // This is the whole reason the fix has two halves. Re-rendering a rejected
    // `React.lazy` replays its cached error and never calls the factory again,
    // so a Retry wired only to an error boundary reset is a dead button.
    let attempt = 0;
    const factory = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('flaky chunk'))
        : Promise.resolve({ default: Loaded as ComponentType });
    });
    const Bare = lazy(onceAsync(factory));

    function BareHarness() {
      const [nonce, setNonce] = useState(0);
      return (
        <SectionErrorBoundary
          key={nonce}
          title="Bare"
          testId="bare-boundary"
          onReset={() => setNonce((n) => n + 1)}
        >
          <Suspense fallback={<div data-testid="pending" />}>
            <Bare />
          </Suspense>
        </SectionErrorBoundary>
      );
    }

    const user = userEvent.setup();
    renderWithProviders(<BareHarness />);
    await screen.findByTestId('bare-boundary');

    // Even remounting the boundary cannot help: the SAME lazy component object
    // carries the cached rejection.
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('bare-boundary')).toBeInTheDocument();
    expect(screen.queryByTestId('loaded-overlay')).not.toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
