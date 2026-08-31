import { useTranslation } from 'react-i18next';

import { useAnimeCountUp } from '@/lib/animations/useAnimeCountUp.ts';
import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DASHBOARD_PULSE_METRICS,
  dashboardPulseRatio,
  dashboardPulseScore,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Zap } from '@/shared/icons/index.ts';

/** Ring + legend colours per metric — the shuffled chart palette drives them. */
const PULSE_COLORS = [
  { ring: 'text-chart-1', dot: 'bg-chart-1' },
  { ring: 'text-chart-2', dot: 'bg-chart-2' },
  { ring: 'text-chart-3', dot: 'bg-chart-3' },
] as const;

const RING_CENTER = 60;
const RING_RADII = [52, 41, 30] as const;
const RING_WIDTH = 9;

function ringStyle(radius: number, ratio: number) {
  const circumference = 2 * Math.PI * radius;
  return {
    strokeDasharray: circumference,
    strokeDashoffset: circumference * (1 - ratio),
  };
}

/**
 * "Workspace pulse" — a concentric radial gauge (one ring per weekly metric,
 * tinted by the chart palette so the Shuffle re-inks it) with the mean
 * completion as the headline score. Data is placeholder until usage endpoints
 * land, so the card carries the shared sample badge like the analytics chart.
 */
export function DashboardPulseGauge() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const score = dashboardPulseScore(DASHBOARD_PULSE_METRICS);
  const formatScore = (count: number) => `${formatNumber(Math.round(count))}%`;
  const scoreRef = useAnimeCountUp<HTMLParagraphElement>(score, formatScore, 720);

  return (
    <Card
      data-testid="dashboard-pulse-gauge"
      className="relative gap-0 overflow-hidden py-0"
    >
      <div
        className="bg-chart-2/15 pointer-events-none absolute -end-10 -bottom-14 h-36 w-36 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Zap className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.pulse.heading)}
              </CardTitle>
              {/* No usage endpoints exist yet — the metrics are generated. Say
                  so on screen: unmarked fabricated numbers read as real. */}
              <Badge variant="outline" data-testid="dashboard-pulse-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.pulse.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative flex flex-col items-center gap-4 p-4 sm:p-5">
        <div className="relative">
          <svg
            viewBox="0 0 120 120"
            className="size-40"
            aria-hidden="true"
            focusable="false"
          >
            {DASHBOARD_PULSE_METRICS.map((metric, index) => {
              const radius = RING_RADII[index] ?? RING_RADII[0];
              const color = PULSE_COLORS[index] ?? PULSE_COLORS[0];
              return (
                <g
                  key={metric.id}
                  transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
                >
                  <circle
                    cx={RING_CENTER}
                    cy={RING_CENTER}
                    r={radius}
                    fill="none"
                    strokeWidth={RING_WIDTH}
                    className="text-muted stroke-current"
                  />
                  <circle
                    cx={RING_CENTER}
                    cy={RING_CENTER}
                    r={radius}
                    fill="none"
                    strokeWidth={RING_WIDTH}
                    strokeLinecap="round"
                    className={cn('stroke-current', color.ring)}
                    {...ringStyle(radius, dashboardPulseRatio(metric))}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              ref={scoreRef}
              data-testid="dashboard-pulse-score"
              className="text-foreground text-xl font-semibold tracking-tight tabular-nums"
            >
              {formatScore(score)}
            </p>
            <p className="text-muted-foreground max-w-20 text-center text-[10px] leading-tight">
              {t(DASHBOARD_KEYS.pulse.score)}
            </p>
          </div>
        </div>
        <ul className="w-full space-y-2">
          {DASHBOARD_PULSE_METRICS.map((metric, index) => {
            const color = PULSE_COLORS[index] ?? PULSE_COLORS[0];
            return (
              <li
                key={metric.id}
                className="flex items-center gap-2 text-sm"
                data-testid={`dashboard-pulse-metric-${metric.id}`}
              >
                <span
                  className={cn(
                    'ring-border size-2.5 shrink-0 rounded-full ring-1',
                    color.dot,
                  )}
                  aria-hidden="true"
                />
                <span className="text-foreground min-w-0 flex-1 truncate">
                  {t(metric.labelKey)}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatNumber(metric.value)}/{formatNumber(metric.target)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
