import type { UseQueryResult } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryBoundary } from './QueryBoundary.tsx';

function asQuery(partial: Record<string, unknown>): UseQueryResult<string> {
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    fetchStatus: 'idle',
    data: undefined,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...partial,
  } as unknown as UseQueryResult<string>;
}

describe('QueryBoundary', () => {
  it('shows the skeleton while pending', () => {
    render(
      <QueryBoundary query={asQuery({ isPending: true, fetchStatus: 'fetching' })}>
        {(data) => <p>{data}</p>}
      </QueryBoundary>,
    );
    expect(screen.getByTestId('query-skeleton')).toBeInTheDocument();
  });

  describe('a disabled query is not a loading one (X-5)', () => {
    // `enabled: false` parks a query at status 'pending' with fetchStatus
    // 'idle' — forever. Branching on isPending alone renders a skeleton that
    // never resolves, and every gated caller had to early-return around it.
    const disabled = { isPending: true, fetchStatus: 'idle' as const };

    it('renders nothing by default instead of a skeleton that never resolves', () => {
      const { container } = render(
        <QueryBoundary query={asQuery(disabled)}>
          {(data) => <p>{data}</p>}
        </QueryBoundary>,
      );
      expect(screen.queryByTestId('query-skeleton')).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the idle branch when the caller gives the state a shape', () => {
      render(
        <QueryBoundary query={asQuery(disabled)} idle={<p>Pick a plan first</p>}>
          {(data) => <p>{data}</p>}
        </QueryBoundary>,
      );
      expect(screen.getByText('Pick a plan first')).toBeInTheDocument();
      expect(screen.queryByTestId('query-skeleton')).not.toBeInTheDocument();
    });

    it('still shows the skeleton for a query that really is fetching', () => {
      render(
        <QueryBoundary query={asQuery({ isPending: true, fetchStatus: 'fetching' })}>
          {(data) => <p>{data}</p>}
        </QueryBoundary>,
      );
      expect(screen.getByTestId('query-skeleton')).toBeInTheDocument();
    });
  });

  describe('a crash in the data renderer', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => consoleError.mockRestore());

    it('is contained when the caller names the section', () => {
      render(
        <QueryBoundary query={asQuery({ data: 'loaded' })} title="Invoices">
          {() => {
            throw new Error('row exploded');
          }}
        </QueryBoundary>,
      );
      expect(screen.getByTestId('query-boundary-error')).toBeInTheDocument();
      expect(screen.getByText('Invoices unavailable')).toBeInTheDocument();
    });
  });

  it('shows the retry fallback with the message on error', () => {
    render(
      <QueryBoundary query={asQuery({ isError: true })} errorMessage="Boom">
        {(data) => <p>{data}</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders the data via the render prop on success', () => {
    render(
      <QueryBoundary query={asQuery({ data: 'loaded' })}>
        {(data) => <p>{data}</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText('loaded')).toBeInTheDocument();
  });
});
