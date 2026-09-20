import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { cn } from '@/lib/utils.ts';

/**
 * Basic pulse skeleton — loading placeholder.
 *
 * @remarks
 * Carries `data-slot="skeleton"` like the vendored `ui/skeleton` primitive, so
 * the Shape axis reaches it: a placeholder must have the corners of the thing it
 * stands in for, or a Sharp app loads round and then snaps square.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLOutputElement>) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <output
      data-slot="skeleton"
      className={cn('bg-muted block animate-pulse rounded-md', className)}
      aria-label={t(LOCALE_KEYS.loading)}
      {...props}
    >
      <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
    </output>
  );
}

/**
 * Polished shimmer skeleton — uses the shimmer keyframe from index.css.
 * More visually appealing than the basic pulse.
 */
export function SkeletonShimmer({
  className,
  ...props
}: React.HTMLAttributes<HTMLOutputElement>) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <output
      data-slot="skeleton"
      className={cn('animate-shimmer skeleton-shimmer-bg block rounded-md', className)}
      aria-label={t(LOCALE_KEYS.loading)}
      {...props}
    >
      <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
    </output>
  );
}
