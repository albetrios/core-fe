import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { buildDashboardHeatmap } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import {
  revealBaseClassName,
  revealHiddenClassName,
  revealShownClassName,
  staggerDelay,
  useRevealOnMount,
} from '@/shared/components/Dashboard/dashboard-motion.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { CalendarDays } from '@/shared/icons/index.ts';

/** Intensity levels 0..4 → chart-1 washes (re-inked by every Shuffle). */
const LEVEL_CLASSES = [
  'bg-muted',
  'bg-chart-1/25',
  'bg-chart-1/45',
  'bg-chart-1/70',
  'bg-chart-1',
] as const;

const HEATMAP = buildDashboardHeatmap().map((days, weekIndex) => ({
  id: `week-${weekIndex}`,
  weekIndex,
  days: days.map((level, dayIndex) => ({ id: `w${weekIndex}d${dayIndex}`, level })),
}));

/**
 * "Activity heatmap" — a GitHub-style weeks × days grid of seeded intensity
 * levels with a Less→More legend. Columns cascade in on mount and cells lift
 * on hover; the chart palette re-inks the whole grid on Shuffle.
 */
export function ContributionHeatmap() {
  const { t } = useTranslation(DASHBOARD_NS);
  const revealed = useRevealOnMount();

  return (
    <Card data-testid="dashboard-heatmap" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <CalendarDays className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.heatmap.heading)}
              </CardTitle>
              {/* Seeded levels, not real usage — keep the marker visible. */}
              <Badge variant="outline" data-testid="dashboard-heatmap-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.heatmap.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex justify-between gap-1" dir="ltr">
          {HEATMAP.map((week) => (
            <div
              key={week.id}
              data-testid={`dashboard-heatmap-week-${week.weekIndex}`}
              className={cn(
                'flex flex-1 flex-col gap-1',
                revealBaseClassName,
                revealed ? revealShownClassName : revealHiddenClassName,
                staggerDelay(Math.floor(week.weekIndex / 2)),
              )}
            >
              {week.days.map((day) => (
                <div
                  key={day.id}
                  className={cn(
                    'aspect-square w-full rounded-xs transition-transform duration-200 hover:scale-125 motion-reduce:transition-none',
                    LEVEL_CLASSES[day.level] ?? LEVEL_CLASSES[0],
                  )}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
          <span>{t(DASHBOARD_KEYS.heatmap.less)}</span>
          {LEVEL_CLASSES.map((level) => (
            <span key={level} className={cn('size-2.5 rounded-xs', level)} />
          ))}
          <span>{t(DASHBOARD_KEYS.heatmap.more)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
