import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, lazy, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { onceAsync } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { axeForDialog } from '@/tests/utils/axe-for-dialog.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reportError: reportErrorMock };
});

import { LazyOverlay, LazyOverlaySkeleton } from './LazyOverlay.tsx';

function Loaded() {
  return <div data-testid="loaded-overlay">loaded</div>;
}

/** Never settles: a STALLED chunk fetch, which never rejects and so never
 *  reaches the error boundary's Close button. */
const stalledLoad = () => new Promise<{ default: ComponentType }>(() => {});

/** Always rejects: the chunk 404 that puts the failure surface on screen. */
const failedLoad = () => Promise.reject(new Error('chunk 404'));

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

  /**
   * The failure surface has always announced itself as `role="alertdialog"` +
   * `aria-modal="true"` while providing none of what those claim: focus stayed
   * out on the trigger, Tab walked straight off into the page behind a scrim
   * that blocks every pointer route to it, and Escape did nothing. Dropping the
   * attributes would have been the other honest answer, but a `fixed inset-0`
   * scrim IS modal for everyone using a mouse — so the claim is kept and made
   * true instead.
   */
  describe('the failure surface is as modal as it claims to be', () => {
    it('moves focus into the card on mount', async () => {
      renderWithProviders(
        <LazyOverlay
          load={failedLoad}
          pending={<div data-testid="pending" />}
          title="Settings"
          onDismiss={vi.fn()}
        />,
      );

      const retry = await screen.findByTestId('lazy-overlay-retry');
      await waitFor(() => expect(retry).toHaveFocus());
    });

    it('traps Tab inside the card instead of letting it walk behind the scrim', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <button type="button" data-testid="behind-the-scrim">
            behind
          </button>
          <LazyOverlay
            load={failedLoad}
            pending={<div data-testid="pending" />}
            title="Settings"
            onDismiss={vi.fn()}
          />
        </>,
      );

      await screen.findByTestId('lazy-overlay-error');
      const retry = screen.getByTestId('lazy-overlay-retry');
      const dismiss = screen.getByTestId('lazy-overlay-dismiss');
      // Placed explicitly rather than leaning on the mount focus above: this
      // test is about what Tab does once focus is inside, and it should fail on
      // the trap alone, not on the other test's assertion.
      retry.focus();

      await user.tab();
      expect(dismiss).toHaveFocus();

      // Wraps back to the first control rather than escaping the card — the
      // page behind is covered by the scrim and unreachable by pointer, so it
      // must be unreachable by keyboard too. Untrapped, this second Tab leaves
      // the card for good.
      await user.tab();
      expect(retry).toHaveFocus();
      expect(screen.getByTestId('lazy-overlay-error')).toContainElement(
        document.activeElement as HTMLElement,
      );
    });

    it('wraps Shift+Tab from the first control to the last, not out of the card', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <button type="button" data-testid="behind-the-scrim">
            behind
          </button>
          <LazyOverlay
            load={failedLoad}
            pending={<div data-testid="pending" />}
            title="Settings"
            onDismiss={vi.fn()}
          />
        </>,
      );

      await screen.findByTestId('lazy-overlay-error');
      const retry = screen.getByTestId('lazy-overlay-retry');
      const dismiss = screen.getByTestId('lazy-overlay-dismiss');
      retry.focus();

      // Untrapped, Shift+Tab from the first control walks back to the button behind the scrim.
      await user.tab({ shift: true });
      expect(dismiss).toHaveFocus();
    });

    it('pulls focus that escaped the card back in, at the end Tab heads for', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <button type="button" data-testid="behind-the-scrim">
            behind
          </button>
          <LazyOverlay
            load={failedLoad}
            pending={<div data-testid="pending" />}
            title="Settings"
            onDismiss={vi.fn()}
          />
        </>,
      );

      await screen.findByTestId('lazy-overlay-error');
      const retry = screen.getByTestId('lazy-overlay-retry');
      const dismiss = screen.getByTestId('lazy-overlay-dismiss');
      const behind = screen.getByTestId('behind-the-scrim');

      behind.focus();
      await user.tab();
      expect(retry).toHaveFocus();

      behind.focus();
      await user.tab({ shift: true });
      expect(dismiss).toHaveFocus();
    });

    it('lets Escape out of the failure surface, not just the pending one', async () => {
      const onDismiss = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <LazyOverlay
          load={failedLoad}
          pending={<div data-testid="pending" />}
          title="Settings"
          onDismiss={onDismiss}
        />,
      );

      await screen.findByTestId('lazy-overlay-error');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    });

    it('hands focus back to the opener when it is dismissed', async () => {
      const user = userEvent.setup();
      // Starts closed and is opened by a click, like every real caller: that
      // click is what leaves focus on the trigger for the card to hand back.
      function DismissHost() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
              open
            </button>
            {open ? (
              <LazyOverlay
                load={failedLoad}
                pending={<div data-testid="pending" />}
                title="Settings"
                onDismiss={() => setOpen(false)}
              />
            ) : null}
          </>
        );
      }

      renderWithProviders(<DismissHost />);
      const opener = await screen.findByTestId('opener');
      await user.click(opener);
      await screen.findByTestId('lazy-overlay-error');

      await user.click(screen.getByTestId('lazy-overlay-dismiss'));

      // Moving focus into a card and then dropping it on <body> is its own
      // keyboard trap; the opener gets it back.
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it('has no axe violations on the failure surface', async () => {
      const { baseElement } = renderWithProviders(
        <LazyOverlay
          load={failedLoad}
          pending={<div data-testid="pending" />}
          title="Settings"
          onDismiss={vi.fn()}
        />,
      );

      await screen.findByTestId('lazy-overlay-error');
      expect(await axeForDialog(baseElement)).toHaveNoViolations();
    });

    it('has no axe violations on the pending surface', async () => {
      // The real skeleton, not a bare div: it carries the live region and the
      // `aria-busy` output that the floating dismiss control sits beside.
      // Plain `axe`, not `axeForDialog`: nothing here portals or marks siblings
      // `aria-hidden`, so the rule that helper relaxes should stay on.
      const { container } = renderWithProviders(
        <LazyOverlay
          load={stalledLoad}
          pending={<LazyOverlaySkeleton />}
          title="Settings"
          onDismiss={vi.fn()}
        />,
      );

      await screen.findByTestId('lazy-overlay-pending');
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
