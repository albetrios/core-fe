import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` have
 * elapsed without a further change. Used to throttle server-side list search so
 * a keystroke doesn't fire a request per character.
 *
 * @param value   The rapidly-changing source value (e.g. a search input).
 * @param delayMs Quiet period before the debounced value catches up (default 300ms).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/**
 * A debounced list search plus the half-second the debounce is still catching
 * up in.
 *
 * `keepPreviousData` already stops the rows from being swapped for a skeleton
 * once the new query starts (X-2) — but between the keystroke and the debounce
 * firing, the list is showing an answer to a question the user has already
 * changed, and says nothing about it. `isPending` covers exactly that window, so
 * a panel can dim from the first keypress instead of a beat later.
 */
export function useDebouncedSearch(
  value: string,
  delayMs = 300,
): { debounced: string; isPending: boolean } {
  const trimmed = value.trim();
  const debounced = useDebouncedValue(trimmed, delayMs);
  return { debounced, isPending: trimmed !== debounced };
}
