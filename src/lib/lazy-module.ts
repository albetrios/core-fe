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
export interface ModuleLoader<T> {
  (): Promise<T>;
  /**
   * The already-resolved module, or `undefined` while pending or after a
   * failure. Lets a caller skip Suspense entirely for a module that is already
   * in memory — see {@link useRetryableLazy}.
   */
  peek: () => T | undefined;
}

export function onceAsync<T>(factory: () => Promise<T>): ModuleLoader<T> {
  let promise: Promise<T> | undefined;
  let settled: T | undefined;

  return Object.assign(
    (): Promise<T> => {
      promise ??= factory().then(
        (value) => {
          settled = value;
          return value;
        },
        (error: unknown) => {
          promise = undefined;
          throw error;
        },
      );
      return promise;
    },
    { peek: () => settled },
  );
}

/** The settled module behind a loader, for loaders that can report one. */
function peekModule<T>(load: () => Promise<T>): T | undefined {
  const peek = (load as Partial<ModuleLoader<T>>).peek;
  return typeof peek === 'function' ? peek() : undefined;
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
  const Component = useMemo(() => {
    // Already in memory: render the real component, no Suspense hop.
    //
    // `lazy()` memoizes on the object it returns, and this builds a NEW one on
    // every mount — so an overlay that unmounts when closed suspends again on
    // every reopen, even though the chunk never left memory. That one-tick
    // suspend is a full placeholder flash: the Appearance panel showed its
    // skeleton on the 2nd, 3rd, Nth open, not just the 1st.
    //
    // Only on `attempt === 0`: a retry must go back through `lazy()` so the
    // failed chunk is actually re-fetched (SHELL-3). `peek()` reports a module
    // only after a SUCCESSFUL load, so a rejection can never be cached here.
    if (attempt === 0) {
      const settled = peekModule(load);
      if (settled) return settled.default;
    }
    return lazy(load);
  }, [load, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { Component, retry };
}
