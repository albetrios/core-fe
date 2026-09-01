import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import type { LucideIcon } from '@/shared/icons/index.ts';
import { ChevronRight } from '@/shared/icons/index.ts';

type DashboardActionCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  testId: string;
  /** Optional wash (e.g. `bg-chart-1/10 border-chart-1/25`) — variant flair. */
  tintClassName?: string;
};

/** Quick-action tile — elevated surface with icon chip and hover affordance. */
export function DashboardActionCard({
  href,
  icon: Icon,
  title,
  description,
  testId,
  tintClassName,
}: DashboardActionCardProps) {
  return (
    <a
      href={href}
      data-testid={testId}
      data-slot="card"
      title={description}
      className={cn(
        'border-border/60 bg-card text-card-foreground hover:border-border hover:bg-muted/30 group flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 transition-[background-color,border-color]',
        tintClassName,
      )}
    >
      <div
        data-slot="icon-chip"
        className={cn(
          'bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary size-9 shrink-0 transition-colors',
          iconChipClassName,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="text-card-foreground block truncate text-sm leading-tight font-semibold">
          {title}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
          {description}
        </span>
      </span>
      <ChevronRight
        className="text-muted-foreground size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
        aria-hidden="true"
      />
    </a>
  );
}
