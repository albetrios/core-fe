import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useLoadingMessage } from '@/shared/hooks/useLoadingMessage/index.ts';

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Render the data once loaded. */
  children: (data: T) => ReactNode;
  /** Error message shown on failure. */
  errorMessage?: string;
  /** Optional custom loading element. */
  loading?: ReactNode;
  /**
   * What to render while the query is **disabled** (`enabled: false`) and has
   * never run. Defaults to nothing, which is almost always right: the caller
   * disabled it because there is nothing to show yet.
   */
  idle?: ReactNode;
  /**
   * Contain a throw from `children(data)` to this boundary instead of letting it
   * reach the route. Pass the section's short label (e.g. "Invoices"); omit to
   * render the data bare.
   */
  title?: string;
  /**
   * What this boundary is fetching, for the loading line — "Members", "Billing".
   * Omitted, the skeleton says a plain "Loading…", which is still better than
   * the bare grey bars it used to show.
   */
  label?: string;
}

/**
 * Calls the render-prop during ITS own render, not the boundary's. Invoking
 * `children(data)` inline would throw while building the element tree — before
 * the boundary below it exists — and escalate straight past it.
 */
function QueryData<T>({ data, render }: { data: T; render: (data: T) => ReactNode }) {
  return <>{render(data)}</>;
}

/**
 * The default pending state: a line naming what is being fetched, then the bars.
 *
 * The bars alone are ambiguous — on a slow connection they are indistinguishable
 * from a surface that has finished loading and is simply empty, and a screen
 * reader got nothing at all because `Skeleton` is decorative. `aria-live` on an
 * `<output>` announces the wait once, politely.
 */
function DefaultSkeleton({ label }: { label?: string }) {
  // Advances while the wait continues — a line that never changes reads as a
  // frozen screen, which is the thing a skeleton is supposed to rule out.
  const message = useLoadingMessage(label);
  return (
    <div className="space-y-3" data-testid="query-skeleton">
      <output
        aria-live="polite"
        className="text-muted-foreground block text-sm"
        data-testid="query-skeleton-label"
      >
        {message}
      </output>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Renders TanStack Query state: a skeleton while loading, a retry fallback on
 * error, or the data via render-prop. Centralizes the loading/error/data branch
 * so pages stay declarative.
 *
 * **A disabled query is not a loading one.** In TanStack Query v5 a query with
 * `enabled: false` sits at `status: 'pending'` **forever** — it has no data and
 * it is not going to get any. Branching on `isPending` alone therefore renders a
 * skeleton that never resolves, and every caller with a gated query
 * (`useOne(id)` with no id yet, `useMembers` before the org resolves, the
 * billing cards behind a subscription check) had to remember to early-return
 * around it. Two of them did; the trap was waiting for the third (X-5).
 *
 * `fetchStatus` is what separates the two: `'fetching'` means a request is in
 * flight, `'idle'` on a pending query means nothing is coming. The idle case
 * gets its own branch here, once, so no caller has to know that.
 */
export function QueryBoundary<T>({
  query,
  children,
  errorMessage,
  loading,
  idle,
  title,
  label,
}: QueryBoundaryProps<T>) {
  const { t } = useTranslation(ERRORS_NS);
  const resolvedErrorMessage = errorMessage ?? t(ERRORS_KEYS.frontend.query.loadFailed);

  // Pending + idle = disabled and never started. Not loading — nothing is coming.
  if (query.isPending && query.fetchStatus === 'idle') return <>{idle ?? null}</>;
  if (query.isPending)
    return <>{loading ?? <DefaultSkeleton label={label ?? title} />}</>;
  if (query.isError) {
    return (
      <RetryError
        message={resolvedErrorMessage}
        onRetry={() => {
          query.refetch().catch(() => undefined);
        }}
        isRetrying={query.isFetching}
      />
    );
  }
  if (title) {
    return (
      <SectionErrorBoundary title={title} testId="query-boundary-error">
        <QueryData data={query.data} render={children} />
      </SectionErrorBoundary>
    );
  }
  return <>{children(query.data)}</>;
}
