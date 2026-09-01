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
  return isRefreshing
    ? 'opacity-60 transition-opacity duration-200'
    : 'transition-opacity duration-200';
}
