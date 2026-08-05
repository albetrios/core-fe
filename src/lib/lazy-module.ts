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
