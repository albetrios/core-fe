import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reportError: reportErrorMock };
});

import { SectionErrorBoundary } from './WidgetErrorBoundary.tsx';

function Boom(): never {
  throw new Error('widget failed');
}

/** A widget whose data comes from a query that rethrows into the boundary. */
function QueryWidget({ queryFn }: { queryFn: () => Promise<string> }) {
  const { data } = useQuery({
    queryKey: ['widget-data'],
    queryFn,
    retry: false,
    throwOnError: true,
  });
  return <p>{data}</p>;
}

function withClient(ui: ReactNode) {
  // gcTime is deliberately left at its default: with `gcTime: 0` an unmounted
  // query is dropped and the remount always refetches, which would make the
  // Retry test below pass with or without the reset wiring.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  // React logs every caught boundary error; silence it so the suite stays readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('SectionErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <SectionErrorBoundary title="Test">
        <p>OK</p>
      </SectionErrorBoundary>,
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('shows a retryable fallback when a child throws', async () => {
    render(
      <SectionErrorBoundary title="Analytics" testId="widget-error-analytics">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(screen.getByTestId('widget-error-analytics')).toBeInTheDocument();
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  });

  it('reports the contained error instead of swallowing it', () => {
    render(
      <SectionErrorBoundary title="Analytics">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ scope: 'section-error-boundary', widget: 'Analytics' }),
    );
  });

  it('renders the compact fallback for chrome-height surfaces', () => {
    render(
      <SectionErrorBoundary title="Notifications" testId="chrome-error" variant="inline">
        <Boom />
      </SectionErrorBoundary>,
    );
    const fallback = screen.getByTestId('chrome-error');
    expect(fallback).toBeInTheDocument();
    // The card fallback's second line would blow out a 56px header.
    expect(
      screen.queryByText('Something went wrong loading this section. Try again.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  describe('the control fallback keeps the failed control shape', () => {
    it('names the failure in full to assistive tech, and briefly on screen', () => {
      render(
        <SectionErrorBoundary
          title="Organization switcher"
          testId="switcher-error"
          variant="control"
        >
          <Boom />
        </SectionErrorBoundary>,
      );

      // On screen the label is SHORT on purpose: the full string truncated
      // mid-word in a 220px sidebar ("Organization switc..."), which is what
      // made a contained failure look like damage.
      expect(screen.getByTestId('switcher-error')).toHaveTextContent('Unavailable');
      expect(
        screen.queryByText(/Organization switcher unavailable/),
      ).not.toBeInTheDocument();
      // Nothing is lost, though — the whole sentence is the accessible name.
      expect(
        screen.getByRole('button', {
          name: 'Organization switcher unavailable. Select to retry.',
        }),
      ).toBeInTheDocument();
    });

    it('is announced, and the whole control is the retry', async () => {
      const user = userEvent.setup();
      let shouldThrow = true;
      function Flaky() {
        if (shouldThrow) throw new Error('switcher failed');
        return <p>switcher</p>;
      }
      render(
        <SectionErrorBoundary title="Organization switcher" variant="control">
          <Flaky />
        </SectionErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      shouldThrow = false;
      // No separate "Retry" button to hunt for — the control itself is it.
      await user.click(screen.getByRole('button'));
      expect(await screen.findByText('switcher')).toBeInTheDocument();
    });

    it('has no accessibility violations', async () => {
      const { container } = render(
        <SectionErrorBoundary title="Organization switcher" variant="control">
          <Boom />
        </SectionErrorBoundary>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  it('renders nothing for an overlay, and still reports it', () => {
    // A fixed-position handle has nowhere in the layout to put a card.
    const { container } = render(
      <SectionErrorBoundary title="Appearance" variant="silent">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ widget: 'Appearance' }),
    );
  });

  describe('a failing query, not a render throw (X-1)', () => {
    it('catches it — a rejected fetch reaches the fallback', async () => {
      const queryFn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('502'));

      withClient(
        <SectionErrorBoundary title="Organization switcher" testId="org-error">
          <QueryWidget queryFn={queryFn} />
        </SectionErrorBoundary>,
      );

      expect(await screen.findByTestId('org-error')).toBeInTheDocument();
      expect(screen.getByText('Organization switcher unavailable')).toBeInTheDocument();
    });

    it('Retry refetches the query rather than re-rendering the dead observer', async () => {
      const queryFn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('502'))
        .mockResolvedValue('switcher loaded');

      withClient(
        <SectionErrorBoundary title="Organization switcher" testId="org-error">
          <QueryWidget queryFn={queryFn} />
        </SectionErrorBoundary>,
      );

      await screen.findByTestId('org-error');
      expect(queryFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      });

      // Without QueryErrorResetBoundary the query stays in its error state and
      // the fallback comes straight back — this is the assertion that fails.
      await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('switcher loaded')).toBeInTheDocument();
      expect(screen.queryByTestId('org-error')).not.toBeInTheDocument();
    });
  });

  it('has no accessibility violations in fallback state', async () => {
    const { container } = render(
      <SectionErrorBoundary title="Stats">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations in the inline fallback', async () => {
    const { container } = render(
      <SectionErrorBoundary title="Stats" variant="inline">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
