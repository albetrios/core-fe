import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { cn } from '@/lib/utils.ts';

/**
 * Basic pulse skeleton — loading placeholder.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLOutputElement>) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <output
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
      className={cn('animate-shimmer skeleton-shimmer-bg block rounded-md', className)}
      aria-label={t(LOCALE_KEYS.loading)}
      {...props}
    >
      <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
    </output>
  );
}
