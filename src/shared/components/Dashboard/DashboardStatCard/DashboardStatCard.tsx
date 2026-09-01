import { useAnimeCountUp } from '@/lib/animations/useAnimeCountUp.ts';
import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import type { LucideIcon } from '@/shared/icons/index.ts';

type DashboardKpiTileProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  testId: string;
  /** `accent` inverts the tile onto the primary surface (lead-tile flair). */
  emphasis?: 'default' | 'accent';
};

/** Diagonal hairline texture (currentColor) — the reference dashboards' hatch. */
const hatchOverlayClassName =
  'pointer-events-none absolute inset-0 opacity-[0.08] ' +
  'bg-[repeating-linear-gradient(135deg,currentColor_0,currentColor_1px,transparent_1px,transparent_7px)]';

/** Elevated KPI tile for the dashboard bento grid. */
export function DashboardKpiTile({
  icon: Icon,
  label,
  value,
  hint,
  testId,
  emphasis = 'default',
}: DashboardKpiTileProps) {
  const { formatNumber } = useLocaleFormat();
  const numericValue = typeof value === 'number' ? value : null;
  const formatCount = (count: number) => formatNumber(Math.round(count));
  // React renders the final value; the tween only overwrites the node while running.
  const countRef = useAnimeCountUp<HTMLParagraphElement>(numericValue, formatCount, 720);
  const displayValue = numericValue !== null ? formatCount(numericValue) : value;
  const accent = emphasis === 'accent';

  return (
    <article
      data-testid={testId}
      data-slot="card"
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-xl border p-4',
        accent
          ? 'border-primary/50 bg-primary text-primary-foreground'
          : 'border-border/70 bg-card text-card-foreground',
      )}
    >
      {accent ? <div className={hatchOverlayClassName} aria-hidden="true" /> : null}
      <div className="relative flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-xs font-medium',
            accent ? 'text-primary-foreground/85' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        <div
          data-slot="icon-chip"
          className={cn(
            'size-8',
            accent
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'bg-muted text-muted-foreground',
            iconChipClassName,
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div className="relative">
        <p
          ref={countRef}
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            accent ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          {displayValue}
        </p>
        {hint ? (
          <p
            className={cn(
              'mt-1 text-xs',
              accent ? 'text-primary-foreground/75' : 'text-muted-foreground',
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </article>
  );
}
