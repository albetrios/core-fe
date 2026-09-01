import { QueryErrorResetBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { AlertTriangle } from '@/shared/icons/index.ts';

/**
 * `card` is the default block fallback for panels and page sections. `inline`
 * is the compact one-line form for chrome-height surfaces — a 56px header, an
 * icon rail, a banner strip — where a 120px card would break the layout it is
 * supposed to be protecting.
 */
type SectionErrorVariant = 'card' | 'inline';

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Short label shown in the fallback (e.g. "Analytics"). */
  title: string;
  /** Optional test id for the fallback container. */
  testId?: string;
  /** Fallback shape — `card` (default) or `inline` for chrome-height surfaces. */
  variant?: SectionErrorVariant;
  /**
   * Ran when the user presses Retry, before the boundary re-renders its
   * children. Needed whenever re-rendering alone cannot recover — a rejected
   * `React.lazy` replays its cached error until a NEW lazy component is built.
   */
  onReset?: () => void;
}

type SectionErrorFallbackProps = FallbackProps & {
  title: string;
  testId?: string;
  variant: SectionErrorVariant;
};

function SectionErrorFallback({
  title,
  testId,
  variant,
  resetErrorBoundary,
}: SectionErrorFallbackProps) {
  const { t } = useTranslation(ERRORS_NS);
  const heading = t(ERRORS_KEYS.widget.unavailable, { title });

  if (variant === 'inline') {
    return (
      <div
        className="text-muted-foreground flex min-w-0 items-center gap-1.5 rounded-md border border-dashed px-2 py-1"
        data-testid={testId ?? 'widget-error'}
        role="alert"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate text-xs">{heading}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-2 text-xs"
          onClick={resetErrorBoundary}
        >
          {t(ERRORS_KEYS.widget.retry)}
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-dashed" data-testid={testId ?? 'widget-error'} role="alert">
      <CardContent className="flex min-h-[120px] flex-col items-center justify-center gap-3 p-4 text-center">
        <AlertTriangle className="text-muted-foreground size-7" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">{heading}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t(ERRORS_KEYS.widget.message)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
          {t(ERRORS_KEYS.widget.retry)}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Section-level error boundary so one failing widget does not blank the whole page.
 *
 * **It catches failed queries, not only render throws.** A React boundary sees a
 * `throw` during render and nothing else, so on its own it can never fire for the
 * thing these widgets actually do — fetch. A query that rejects just sets
 * `isError` on its observer, the widget renders its empty/placeholder branch, and
 * the boundary (with its translated "… unavailable" copy) sits there unreachable —
 * decoration, not protection (X-1). Two halves make it real:
 *
 * 1. The widget's query opts in with `throwOnError: true` (or renders its own
 *    `QueryBoundary`), so a rejected fetch reaches this boundary at all.
 * 2. `QueryErrorResetBoundary` wraps it, and `onReset` clears the failed query's
 *    error state — so **Retry** refetches instead of re-rendering the same dead
 *    observer and landing straight back on the fallback.
 *
 * Every throw is reported, so a contained failure is never a silent one.
 */
export function SectionErrorBoundary({
  children,
  title,
  testId,
  variant = 'card',
  onReset,
}: SectionErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={() => {
            // Clear the failed query's error state AND let the child undo
            // whatever else is pinned to the failure (a rejected `React.lazy`
            // keeps replaying its cached error until a new one is built).
            reset();
            onReset?.();
          }}
          fallbackRender={(props) => (
            <SectionErrorFallback
              {...props}
              title={title}
              testId={testId}
              variant={variant}
            />
          )}
          onError={(error, info) => {
            if (platformConfig.debugLogging) {
              console.error(`[SectionErrorBoundary:${title}]`, error, info);
            }
            reportError(error, {
              scope: 'section-error-boundary',
              widget: title,
              componentStack: info.componentStack,
            });
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
