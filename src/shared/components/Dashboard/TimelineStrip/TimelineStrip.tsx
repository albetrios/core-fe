import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { resolveDashboardEvents } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import {
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
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { CalendarDays } from '@/shared/icons/index.ts';

const VIEW_W = 320;
const VIEW_H = 64;
const TRACK_Y = 26;
const DOT_CLASSES = [
  'text-chart-1',
  'text-chart-2',
  'text-chart-3',
  'text-chart-4',
] as const;

/**
 * "This month" — the schedule's seeded events on a horizontal month track with
 * a "today" marker, gantt-strip style (the timeline reading of the same data
 * the calendar card shows). Sample-badged like every placeholder widget.
 */
export function TimelineStrip() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate } = useLocaleFormat();
  const revealed = useRevealOnMount();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const events = resolveDashboardEvents(now);
  const xForDay = (day: number) => ((day - 0.5) / daysInMonth) * VIEW_W;
  const todayX = xForDay(now.getDate());

  return (
    <Card data-testid="dashboard-timeline-strip" className="gap-0 py-0">
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
                {t(DASHBOARD_KEYS.timeline.heading)}
              </CardTitle>
              {/* Same seeded events as the schedule card — keep the sample
                  marker so the strip never reads as a real calendar. */}
              <Badge variant="outline" data-testid="dashboard-timeline-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.timeline.description)}</CardDescription>
          </div>
          <span className="text-primary inline-flex items-center gap-1.5 text-xs font-medium">
            <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
            {t(DASHBOARD_KEYS.timeline.today)} ·{' '}
            {formatDate(now, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5" dir="ltr">
        {/* Time axes read left→right in every locale; explicit x coordinates
            keep the SVG LTR regardless of the document direction. */}
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-20 w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="timeline-track" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-chart-1)" />
              <stop offset="50%" stopColor="var(--color-chart-2)" />
              <stop offset="100%" stopColor="var(--color-chart-3)" />
            </linearGradient>
          </defs>
          <line
            x1={0}
            y1={TRACK_Y}
            x2={VIEW_W}
            y2={TRACK_Y}
            stroke="url(#timeline-track)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.5}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={revealed ? 0 : 1}
            className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
          />
          <g className="text-primary">
            <line
              x1={todayX}
              y1={4}
              x2={todayX}
              y2={VIEW_H - 4}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <circle
              cx={todayX}
              cy={TRACK_Y}
              r={9}
              fill="currentColor"
              opacity={0.2}
              className="motion-safe:animate-pulse"
            />
            <circle cx={todayX} cy={TRACK_Y} r={4.5} fill="currentColor" />
          </g>
          {events.map((event, index) => {
            const x = xForDay(event.date.getDate());
            const labelY = index % 2 === 0 ? TRACK_Y + 16 : TRACK_Y + 30;
            return (
              <g
                key={event.id}
                className={cn(
                  DOT_CLASSES[index % DOT_CLASSES.length],
                  'transition-opacity duration-700 motion-reduce:transition-none',
                  revealed ? 'opacity-100' : 'opacity-0',
                  staggerDelay(index),
                )}
                data-testid={`dashboard-timeline-event-${event.id}`}
              >
                <circle
                  cx={x}
                  cy={TRACK_Y}
                  r={6.5}
                  fill="currentColor"
                  className="opacity-20"
                />
                <circle cx={x} cy={TRACK_Y} r={3} fill="currentColor" />
                <rect
                  x={x - 9}
                  y={2}
                  width={18}
                  height={13}
                  rx={4}
                  fill="currentColor"
                  opacity={0.14}
                />
                <text
                  x={x}
                  y={11.5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  className="fill-foreground tabular-nums"
                >
                  {formatDate(event.date, { day: 'numeric' })}
                </text>
                <text
                  x={x}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={9}
                  className="fill-foreground"
                >
                  {t(event.labelKey)}
                </text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
