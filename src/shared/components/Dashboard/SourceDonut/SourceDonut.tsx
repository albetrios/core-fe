import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pie, PieChart } from 'recharts';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { DASHBOARD_SOURCE_SEGMENTS } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/shared/components/ui/chart.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Boxes } from '@/shared/icons/index.ts';

const SEGMENT_FILLS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
] as const;

const SEGMENT_DOTS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3'] as const;

/**
 * "Sessions by source" — a donut of the week's sessions split by surface
 * (web / mobile / API) with the total in the middle, re-inked by the shuffled
 * chart palette. Data is placeholder until usage endpoints land, so the card
 * carries the shared sample badge like the analytics chart.
 */
export function SourceDonut() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();

  const data = useMemo(
    () =>
      DASHBOARD_SOURCE_SEGMENTS.map((segment, index) => ({
        id: segment.id,
        label: t(segment.labelKey),
        value: segment.value,
        // Per-slice colour on the datum — recharts 3 deprecated <Cell>.
        fill: SEGMENT_FILLS[index % SEGMENT_FILLS.length],
      })),
    [t],
  );
  const total = data.reduce((sum, segment) => sum + segment.value, 0);

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        data.map((segment, index) => [
          segment.id,
          { label: segment.label, color: SEGMENT_FILLS[index % SEGMENT_FILLS.length] },
        ]),
      ) satisfies ChartConfig,
    [data],
  );

  return (
    <Card data-testid="dashboard-source-donut" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Boxes className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.donut.heading)}
              </CardTitle>
              {/* No usage endpoints exist yet — the split is generated. Say so
                  on screen: an unmarked fake breakdown reads as real telemetry. */}
              <Badge variant="outline" data-testid="dashboard-donut-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.donut.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 p-4 sm:p-5">
        <div className="relative">
          <ChartContainer config={chartConfig} className="aspect-square h-44">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={3}
                cornerRadius={6}
                strokeWidth={0}
              />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="text-foreground text-xl font-semibold tracking-tight tabular-nums"
              data-testid="dashboard-donut-total"
            >
              {formatNumber(total)}
            </p>
            <p className="text-muted-foreground text-[10px] leading-tight">
              {t(DASHBOARD_KEYS.analytics.seriesSessions)}
            </p>
          </div>
        </div>
        <ul className="w-full space-y-2">
          {data.map((segment, index) => (
            <li
              key={segment.id}
              className="flex items-center gap-2 text-sm"
              data-testid={`dashboard-donut-segment-${segment.id}`}
            >
              <span
                className={cn(
                  'ring-border size-2.5 shrink-0 rounded-full ring-1',
                  SEGMENT_DOTS[index % SEGMENT_DOTS.length],
                )}
                aria-hidden="true"
              />
              <span className="text-foreground min-w-0 flex-1 truncate">
                {segment.label}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatNumber(segment.value)} ·{' '}
                {formatNumber((segment.value / total) * 100, {
                  maximumFractionDigits: 0,
                })}
                %
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
