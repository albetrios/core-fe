import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { DASHBOARD_RADAR_AXES } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { useRevealOnMount } from '@/shared/components/Dashboard/dashboard-motion.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { LayoutDashboard } from '@/shared/icons/index.ts';

// Sized with margin so vertex labels ("Engagement", locale variants) never
// clip at the viewBox edge.
const SIZE = 264;
const CENTER = SIZE / 2;
const RADIUS = 78;
const LABEL_RADIUS = 98;
const GRID_LEVELS = [0.33, 0.66, 1] as const;

function polarPoint(index: number, ratio: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / DASHBOARD_RADAR_AXES.length - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * ratio,
    y: CENTER + Math.sin(angle) * RADIUS * ratio,
  };
}

function ringPoints(ratio: number): string {
  return DASHBOARD_RADAR_AXES.map((_, index) => {
    const { x, y } = polarPoint(index, ratio);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/**
 * "Workspace health" — a pure-SVG radar across five seeded dimensions
 * (sample-badged). The data polygon draws itself in on mount and the accent
 * palette re-inks it on every Shuffle.
 */
export function HealthRadar() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const revealed = useRevealOnMount();

  const dataPoints = DASHBOARD_RADAR_AXES.map((axis, index) =>
    polarPoint(index, axis.value / 100),
  );
  const dataPolygon = dataPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <Card data-testid="dashboard-radar" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <LayoutDashboard className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.radar.heading)}
              </CardTitle>
              {/* Seeded scores, not a real audit — keep the marker visible. */}
              <Badge variant="outline" data-testid="dashboard-radar-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.radar.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2 p-4 sm:p-5">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-52 w-52"
          aria-hidden="true"
          focusable="false"
        >
          <g className="text-border">
            {GRID_LEVELS.map((level) => (
              <polygon
                key={level}
                points={ringPoints(level)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.7}
              />
            ))}
            {DASHBOARD_RADAR_AXES.map((axis, index) => {
              const { x, y } = polarPoint(index, 1);
              return (
                <line
                  key={axis.id}
                  x1={CENTER}
                  y1={CENTER}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={0.5}
                />
              );
            })}
          </g>
          <g className="text-chart-1">
            <polygon
              points={dataPolygon}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={revealed ? 0 : 1}
              className="transition-[stroke-dashoffset,fill-opacity] duration-1000 ease-out motion-reduce:transition-none"
              fillOpacity={revealed ? 0.15 : 0}
            />
            {dataPoints.map((point, index) => (
              <circle
                key={DASHBOARD_RADAR_AXES[index]?.id ?? index}
                cx={point.x}
                cy={point.y}
                r={3}
                fill="currentColor"
              />
            ))}
          </g>
          {DASHBOARD_RADAR_AXES.map((axis, index) => {
            const angle =
              (Math.PI * 2 * index) / DASHBOARD_RADAR_AXES.length - Math.PI / 2;
            const x = CENTER + Math.cos(angle) * LABEL_RADIUS;
            const y = CENTER + Math.sin(angle) * LABEL_RADIUS;
            return (
              <text
                key={axis.id}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                className="fill-muted-foreground"
              >
                {t(axis.labelKey)}
              </text>
            );
          })}
        </svg>
        <ul className="grid w-full grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
          {DASHBOARD_RADAR_AXES.map((axis) => (
            <li
              key={axis.id}
              className="flex items-center justify-between gap-2 text-xs"
              data-testid={`dashboard-radar-axis-${axis.id}`}
            >
              <span className="text-muted-foreground min-w-0 truncate">
                {t(axis.labelKey)}
              </span>
              <span className="text-foreground font-medium tabular-nums">
                {formatNumber(axis.value)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
