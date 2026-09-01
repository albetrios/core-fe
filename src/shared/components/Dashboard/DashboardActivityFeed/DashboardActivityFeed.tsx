import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  type DashboardActivityEvent,
  resolveDashboardActivity,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
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
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import {
  Bell,
  CreditCard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  UserPlus,
} from '@/shared/icons/index.ts';

/** Event type → icon; the chip tint cycles the chart palette per row. */
const ACTIVITY_ICONS: Record<DashboardActivityEvent['icon'], LucideIcon> = {
  invite: UserPlus,
  role: ShieldCheck,
  billing: CreditCard,
  workspace: Settings,
};

const ACTIVITY_CHIP_TINTS = [
  'bg-chart-1/15 text-foreground',
  'bg-chart-2/15 text-foreground',
  'bg-chart-3/15 text-foreground',
  'bg-chart-4/15 text-foreground',
] as const;

/**
 * "Recent activity" — a compact feed of workspace events with relative
 * timestamps. Data is placeholder until an events endpoint lands, so the card
 * carries the shared sample badge like the analytics chart and pulse gauge.
 */
export function DashboardActivityFeed() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatRelativeTime } = useLocaleFormat();
  const events = resolveDashboardActivity();
  const revealed = useRevealOnMount();

  return (
    <Card
      data-testid="dashboard-activity-feed"
      className="relative gap-0 overflow-hidden py-0"
    >
      <div
        className="bg-chart-3/15 pointer-events-none absolute -start-10 -top-14 h-36 w-36 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Bell className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.activity.heading)}
              </CardTitle>
              {/* No events endpoint exists yet — the feed is generated. Say so
                  on screen: unmarked fabricated events read as real history. */}
              <Badge variant="outline" data-testid="dashboard-activity-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.activity.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative p-4 sm:p-5">
        <ul className="space-y-3">
          {events.map((event, index) => {
            const Icon = ACTIVITY_ICONS[event.icon];
            return (
              <li
                key={event.id}
                className={cn(
                  '-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors',
                  'hover:bg-muted/40',
                  revealBaseClassName,
                  revealed ? revealShownClassName : revealHiddenClassName,
                  staggerDelay(index),
                )}
                data-testid={`dashboard-activity-item-${event.id}`}
              >
                <span
                  data-slot="icon-chip"
                  className={cn(
                    'size-8 shrink-0',
                    ACTIVITY_CHIP_TINTS[index % ACTIVITY_CHIP_TINTS.length],
                    iconChipClassName,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                  {t(event.labelKey)}
                </span>
                <time
                  dateTime={event.at.toISOString()}
                  className="text-muted-foreground shrink-0 text-xs whitespace-nowrap"
                >
                  {formatRelativeTime(event.at)}
                </time>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
