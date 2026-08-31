import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { resolveDashboardGantt } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { useRevealOnMount } from '@/shared/components/Dashboard/dashboard-motion.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { GitBranch } from '@/shared/icons/index.ts';

const VIEW_W = 320;
const ROW_H = 26;
const BAR_H = 12;
const BAR_COLORS = [
  'text-chart-1',
  'text-chart-2',
  'text-chart-3',
  'text-chart-4',
] as const;

/**
 * "This month" as a mini gantt — the schedule's seeded events stretched into
 * ranged bars on a shared month track with a today line. Bars grow in from
 * their start on mount; pure SVG, no gantt library, sample-badged.
 */
export function MiniGantt() {
  const { t } = useTranslation(DASHBOARD_NS);
  const revealed = useRevealOnMount();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const items = resolveDashboardGantt(now);
  const viewH = items.length * ROW_H + 8;
  const xForDay = (day: number) => ((day - 1) / daysInMonth) * VIEW_W;
  const todayX = xForDay(now.getDate() + 0.5);

  return (
    <Card data-testid="dashboard-mini-gantt" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <GitBranch className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.timeline.heading)}
              </CardTitle>
              {/* Ranged reading of the same seeded schedule events. */}
              <Badge variant="outline" data-testid="dashboard-gantt-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.timeline.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-[auto_1fr] items-center gap-x-3 p-4 sm:p-5">
        <div className="flex flex-col justify-around" dir="auto">
          {items.map((item) => (
            <p
              key={item.id}
              className="text-foreground h-[26px] max-w-32 truncate text-xs leading-[26px]"
            >
              {t(item.labelKey)}
            </p>
          ))}
        </div>
        <div dir="ltr">
          <svg
            viewBox={`0 0 ${VIEW_W} ${viewH}`}
            className="h-auto w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={VIEW_W * ratio}
                y1={0}
                x2={VIEW_W * ratio}
                y2={viewH}
                className="text-border stroke-current"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.6}
              />
            ))}
            {items.map((item, index) => {
              const startDay = item.date.getDate();
              const x = xForDay(startDay);
              const width = Math.min(
                (item.durationDays / daysInMonth) * VIEW_W,
                VIEW_W - x,
              );
              const y = index * ROW_H + (ROW_H - BAR_H) / 2 + 4;
              return (
                <g
                  key={item.id}
                  className={BAR_COLORS[index % BAR_COLORS.length]}
                  data-testid={`dashboard-gantt-bar-${item.id}`}
                >
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={BAR_H}
                    rx={BAR_H / 2}
                    fill="currentColor"
                    opacity={0.25}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={revealed ? width * 0.62 : 0}
                    height={BAR_H}
                    rx={BAR_H / 2}
                    fill="currentColor"
                    className="transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  />
                </g>
              );
            })}
            <g className="text-primary">
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={viewH}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <circle cx={todayX} cy={4} r={3} fill="currentColor" />
            </g>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
