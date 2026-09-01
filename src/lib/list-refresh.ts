import { cn } from '@/lib/utils.ts';

/**
 * Presentation for a list whose rows belong to the PREVIOUS query params while
 * the new ones load.
 *
 * Search, sort and filter values live in the query key, so every keystroke
 * starts a fresh query. Swapping the rows for a skeleton on each one blanks the
 * list, collapses the container's height, and makes the page jump — then refills
 * (X-2). Holding the previous rows and dimming them keeps the layout still and
 * still says "this is not the answer yet".
 *
 * Pair with `keepPreviousData` on the query and `aria-busy` on the same element,
 * so assistive tech hears what the dim shows.
 */
export function listRefreshClass(isRefreshing: boolean): string {
  // Composed, not branched: the transition is unconditional so the dim fades in
  // BOTH directions, and `isRefreshing` only adds the dim. Returning one of two
  // whole class strings made the flag select an action rather than describe a
  // state (sonar typescript:S2301).
  return cn('transition-opacity duration-200', isRefreshing && 'opacity-60');
}
