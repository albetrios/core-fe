import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, lazy, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onceAsync } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reportError: reportErrorMock };
});

import { LazyOverlay } from './LazyOverlay.tsx';

function Loaded() {
  return <div data-testid="loaded-overlay">loaded</div>;
}

/** Never settles: a STALLED chunk fetch, which never rejects and so never
 *  reaches the error boundary's Close button. */
const stalledLoad = () => new Promise<{ default: ComponentType }>(() => {});

/**
 * Mirrors the real callers: the OWNER holds the open state and unmounts the
 * overlay. A dismiss that only hid its own scrim would leave the owner open —
 * and every trigger hides itself while open, so nothing could reopen it.
 */
function OverlayHost() {
  const [open, setOpen] = useState(true);
  if (!open) return <div data-testid="host-closed" />;
  return (
    <LazyOverlay
      load={stalledLoad}
      pending={<div data-testid="pending" />}
      title="Appearance"
      onDismiss={() => setOpen(false)}
    />
  );
}

describe('LazyOverlay', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    reportErrorMock.mockClear();
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

  it('lets Escape out of a STALLED chunk fetch', async () => {
    // A fetch that never settles never rejects, so the error boundary never
    // fires and its Close button never renders. The pending scrim is
    // `fixed inset-0` over the whole viewport, so without a handler here the
    // user is locked out of the app for as long as the request hangs.
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <LazyOverlay
        load={stalledLoad}
        pending={<div data-testid="pending" />}
        title="Appearance"
        onDismiss={onDismiss}
      />,
    );

    await screen.findByTestId('pending');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('the pending dismiss control closes the OWNER state, not just the scrim', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OverlayHost />);

    await screen.findByTestId('pending');
    await user.click(screen.getByTestId('lazy-overlay-pending-dismiss'));

    // The host swapped to its closed branch: the open state actually flipped.
    expect(await screen.findByTestId('host-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument();
  });

  it('reports a failed chunk load — containing a throw must not silence it', async () => {
    // Containing the failure is also what stopped it escalating to the route
    // boundary, which is where it used to be reported from. Users get a retry
    // card; without this, operators get nothing at all.
    const load = () => Promise.reject(new Error('chunk 404'));
    renderWithProviders(
      <LazyOverlay
        load={load}
        pending={<div data-testid="pending" />}
        title="Appearance"
      />,
    );

    await screen.findByTestId('lazy-overlay-error');
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ scope: 'lazy-overlay', widget: 'Appearance' }),
    );
  });
});
