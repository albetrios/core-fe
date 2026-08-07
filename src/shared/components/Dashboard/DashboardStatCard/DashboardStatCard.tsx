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
};

/** Elevated KPI tile for the dashboard bento grid. */
export function DashboardKpiTile({
  icon: Icon,
  label,
  value,
  hint,
  testId,
}: DashboardKpiTileProps) {
  const { formatNumber } = useLocaleFormat();
  const numericValue = typeof value === 'number' ? value : null;
  const formatCount = (count: number) => formatNumber(Math.round(count));
  // React renders the final value; the tween only overwrites the node while running.
  const countRef = useAnimeCountUp<HTMLParagraphElement>(numericValue, formatCount, 720);
  const displayValue = numericValue !== null ? formatCount(numericValue) : value;

  return (
    <article
      data-testid={testId}
      data-slot="card"
      className="border-border/70 bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div
          data-slot="icon-chip"
          className={cn('bg-muted text-muted-foreground size-8', iconChipClassName)}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div>
        <p
          ref={countRef}
          className="text-foreground text-2xl font-semibold tracking-tight tabular-nums"
        >
          {displayValue}
        </p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </div>
    </article>
  );
}
