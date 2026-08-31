import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DASHBOARD_MAP_MARKERS,
  DASHBOARD_MAP_REGIONS,
  type DashboardMapRegion,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Progress } from '@/shared/components/ui/progress.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Globe } from '@/shared/icons/index.ts';

const MAP_W = 320;
const MAP_H = 150;
/** Rendered latitude window (Mercator-crop style): 75°N .. 60°S. */
const LAT_TOP = 75;
const LAT_SPAN = 135;
const DOT_STEP = 5;

/** Region → colour classes (chart palette, re-inked by every Shuffle). */
const REGION_STYLES: Record<
  DashboardMapRegion['id'],
  { text: string; dot: string; bar: string }
> = {
  americas: { text: 'text-chart-1', dot: 'bg-chart-1', bar: '[&>div]:bg-chart-1' },
  europe: { text: 'text-chart-2', dot: 'bg-chart-2', bar: '[&>div]:bg-chart-2' },
  asia: { text: 'text-chart-3', dot: 'bg-chart-3', bar: '[&>div]:bg-chart-3' },
  oceania: { text: 'text-chart-4', dot: 'bg-chart-4', bar: '[&>div]:bg-chart-4' },
};

/** Stylized landmass blobs (lon, lat, rx°, ry°) — enough silhouette to read
 *  as a world map at dot-matrix resolution without shipping geo data. */
const LANDMASS: readonly [number, number, number, number][] = [
  [-152, 64, 10, 6], // Alaska
  [-100, 52, 28, 14], // Canada + northern US
  [-95, 35, 20, 8], // southern US
  [-95, 18, 8, 7], // Mexico + Central America
  [-42, 73, 9, 5], // Greenland
  [-63, -5, 14, 12], // northern South America
  [-65, -28, 8, 14], // southern cone
  [18, 52, 17, 10], // Europe
  [18, 64, 10, 6], // Scandinavia
  [15, 15, 17, 14], // northern Africa
  [25, -12, 11, 14], // southern Africa
  [45, 27, 10, 8], // Middle East
  [85, 55, 45, 13], // Russia + northern Asia
  [70, 40, 20, 8], // Central Asia
  [110, 32, 15, 10], // East Asia
  [77, 20, 9, 10], // India
  [102, 12, 8, 8], // Southeast Asia
  [115, -3, 15, 4], // Indonesia
  [139, 37, 4, 6], // Japan
  [134, -25, 13, 8], // Australia
  [172, -41, 3, 4], // New Zealand
];

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}

function latToY(lat: number): number {
  return ((LAT_TOP - lat) / LAT_SPAN) * MAP_H;
}

function isLand(lon: number, lat: number): boolean {
  return LANDMASS.some(([cx, cy, rx, ry]) => {
    const dx = (lon - cx) / rx;
    const dy = (lat - cy) / ry;
    return dx * dx + dy * dy <= 1;
  });
}

/** Deterministic dot-matrix world, computed once at module load. */
const WORLD_DOTS: readonly { x: number; y: number }[] = (() => {
  const dots: { x: number; y: number }[] = [];
  for (let x = DOT_STEP / 2; x < MAP_W; x += DOT_STEP) {
    for (let y = DOT_STEP / 2; y < MAP_H; y += DOT_STEP) {
      const lon = (x / MAP_W) * 360 - 180;
      const lat = LAT_TOP - (y / MAP_H) * LAT_SPAN;
      if (isLand(lon, lat)) dots.push({ x, y });
    }
  }
  return dots;
})();

/**
 * "Global activity" — a dotted-world map with pulsing session pings per hub
 * and a region legend whose totals match the source donut (one coherent
 * sample-badged story). Pure SVG: no geo library, no map tiles, and the
 * chart palette re-inks every ping on Shuffle.
 */
export function GlobalActivityMap() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const total = DASHBOARD_MAP_REGIONS.reduce((sum, region) => sum + region.value, 0);

  return (
    <Card
      data-testid="dashboard-global-map"
      className="from-primary/8 via-card to-card relative gap-0 overflow-hidden bg-gradient-to-br py-0"
    >
      <div
        className="bg-chart-1/10 pointer-events-none absolute -end-12 -top-16 h-44 w-44 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Globe className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{t(DASHBOARD_KEYS.map.heading)}</CardTitle>
              {/* No geo endpoints exist yet — the pings are seeded. Say so on
                  screen: an unmarked fake map reads as live telemetry. */}
              <Badge variant="outline" data-testid="dashboard-map-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.map.description)}</CardDescription>
          </div>
          <p className="text-foreground text-xl font-semibold tracking-tight tabular-nums">
            {formatNumber(total)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative flex flex-col gap-4 p-4 sm:p-5">
        <div
          className="border-border/60 bg-background/40 overflow-hidden rounded-xl border"
          dir="ltr"
        >
          {/* Longitude reads left→right everywhere; explicit coordinates keep
              the projection LTR regardless of document direction. */}
          <svg
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="h-auto w-full"
            aria-hidden="true"
            focusable="false"
          >
            <g className="text-muted-foreground" opacity={0.35}>
              {WORLD_DOTS.map((dot) => (
                <circle
                  key={`${dot.x}-${dot.y}`}
                  cx={dot.x}
                  cy={dot.y}
                  r={1.4}
                  fill="currentColor"
                />
              ))}
            </g>
            {DASHBOARD_MAP_MARKERS.map((marker) => {
              const x = lonToX(marker.lon);
              const y = latToY(marker.lat);
              return (
                <g
                  key={marker.id}
                  className={REGION_STYLES[marker.region].text}
                  data-testid={`dashboard-map-marker-${marker.id}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={8}
                    fill="currentColor"
                    opacity={0.15}
                    className="animate-pulse"
                  />
                  <circle cx={x} cy={y} r={4} fill="currentColor" opacity={0.35} />
                  <circle cx={x} cy={y} r={2.2} fill="currentColor" />
                </g>
              );
            })}
          </svg>
        </div>
        <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
          {DASHBOARD_MAP_REGIONS.map((region) => {
            const styles = REGION_STYLES[region.id];
            const share = (region.value / total) * 100;
            return (
              <li
                key={region.id}
                className="space-y-1"
                data-testid={`dashboard-map-region-${region.id}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'ring-border size-2.5 shrink-0 rounded-full ring-1',
                      styles.dot,
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {t(region.labelKey)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(region.value)} ·{' '}
                    {formatNumber(share, { maximumFractionDigits: 0 })}%
                  </span>
                </div>
                <Progress
                  value={share}
                  className={cn('h-1.5', styles.bar)}
                  aria-label={t(region.labelKey)}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
