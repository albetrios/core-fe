/**
 * Memoize a dynamic-import factory so every caller shares one module promise.
 *
 * `React.lazy` and any preload helper must resolve the SAME promise, or the
 * chunk is requested twice and Suspense can flake. A module-scope `import()`
 * shares the promise too, but it fetches the moment the module evaluates —
 * which defeats the code-split it was meant to preserve. This keeps the shared
 * promise while deferring the fetch to the first call.
 *
 * @param factory - Import thunk, called at most once.
 * @returns A loader returning the cached module promise.
 */
export function onceAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => (promise ??= factory());
}
