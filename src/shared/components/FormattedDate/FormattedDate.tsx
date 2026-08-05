import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';

type FormattedDateProps = {
  value: string | Date;
  /** When true, show relative time for recent dates (falls back to date for older). */
  relative?: boolean;
  className?: string;
};

/** Renders a date using the user's locale, timezone, and date-format preferences. */
export function FormattedDate({
  value,
  relative = false,
  className,
}: FormattedDateProps) {
  const { formatDate, formatRelativeTime } = useLocaleFormat();
  const text = relative ? formatRelativeTime(value) : formatDate(value);
  return (
    <time dateTime={machineDateAttr(value)} className={className}>
      {text}
    </time>
  );
}

/**
 * Machine-readable value for the `<time dateTime>` attribute. `formatDate` /
 * `formatRelativeTime` already guard NaN dates, but a `Date` that is Invalid
 * Date would make `toISOString()` throw RangeError — return `undefined` (omit
 * the attribute) instead of crashing the row.
 */
function machineDateAttr(value: string | Date): string | undefined {
  if (typeof value === 'string') return value;
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}
