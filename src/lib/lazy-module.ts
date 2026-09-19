import { type ComponentType, lazy, useCallback, useMemo, useState } from 'react';

/**
 * Memoize a dynamic-import factory so every caller shares one module promise.
 *
 * `React.lazy` and any preload helper must resolve the SAME promise, or the
 * chunk is requested twice and Suspense can flake. A module-scope `import()`
 * shares the promise too, but it fetches the moment the module evaluates —
 * which defeats the code-split it was meant to preserve. This keeps the shared
 * promise while deferring the fetch to the first call.
 *
 * A rejection is NOT cached: a chunk fetch that fails on a flaky network would
 * otherwise stay poisoned for the life of the page, leaving the layout
 * permanently unrenderable until a full reload. Clearing it lets the next
 * render — or a Suspense retry — fetch again.
 *
 * @param factory - Import thunk, called again only after a failed attempt.
 * @returns A loader returning the shared in-flight or resolved module promise.
 */
export function onceAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= factory().catch((error: unknown) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };
}

/**
 * A lazily-loaded component that can actually be retried after a failed fetch.
 *
 * `React.lazy` memoizes its outcome on the component object: once the factory
 * rejects, its status is `Rejected` and every later render rethrows the SAME
 * error without ever calling the factory again. So an error boundary's Retry —
 * which only re-renders the same lazy component — replays the failure forever,
 * which is why those buttons did nothing (SHELL-3). {@link onceAsync} clears the
 * cached *import* promise; this clears the cached *component*. Both are needed.
 *
 * @param load - Import thunk, ideally wrapped in {@link onceAsync}.
 * @returns The current lazy component and a `retry` that builds a fresh one.
 */
export function useRetryableLazy(load: () => Promise<{ default: ComponentType }>): {
  Component: ComponentType;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const Component = useMemo(
    () => lazy(load),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` IS the retry key
    [load, attempt],
  );
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { Component, retry };
}
