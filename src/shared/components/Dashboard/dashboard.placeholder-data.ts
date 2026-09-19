import {
  ANALYTICS_RANGE_DAYS,
  type AnalyticsRange,
  DASHBOARD_KEYS,
} from './dashboard.constants.ts';

export type DashboardHighlightSlide = {
  id: 'appearance' | 'invite' | 'security';
  tabKey: string;
  titleKey: string;
  descriptionKey: string;
  actionKey: string;
  href?: string;
};

/** Static highlight carousel slides until a CMS or API backs them. */
export const DASHBOARD_HIGHLIGHT_SLIDES: readonly DashboardHighlightSlide[] = [
  {
    id: 'appearance',
    tabKey: DASHBOARD_KEYS.highlights.tabs.appearance,
    titleKey: DASHBOARD_KEYS.highlights.slides.appearance.title,
    descriptionKey: DASHBOARD_KEYS.highlights.slides.appearance.description,
    actionKey: DASHBOARD_KEYS.highlights.slides.appearance.action,
  },
  {
    id: 'invite',
    tabKey: DASHBOARD_KEYS.highlights.tabs.invite,
    titleKey: DASHBOARD_KEYS.highlights.slides.invite.title,
    descriptionKey: DASHBOARD_KEYS.highlights.slides.invite.description,
    actionKey: DASHBOARD_KEYS.highlights.slides.invite.action,
    href: '#settings/organization/members',
  },
  {
    id: 'security',
    tabKey: DASHBOARD_KEYS.highlights.tabs.security,
    titleKey: DASHBOARD_KEYS.highlights.slides.security.title,
    descriptionKey: DASHBOARD_KEYS.highlights.slides.security.description,
    actionKey: DASHBOARD_KEYS.highlights.slides.security.action,
    href: '#settings/account/security',
  },
] as const;

/**
 * Placeholder widget data for the dashboard module until core-be endpoints land
 * (events + usage analytics). Anything rendered from here MUST carry the
 * `sampleBadge` marker on screen — unmarked fabricated data reads as real.
 * The members roster is real (`useMembers`); do not add fixture people here.
 */

export type DashboardEvent = {
  id: string;
  labelKey: string;
  /** Day-of-month within the reference month. */
  day: number;
};

const DASHBOARD_EVENT_SEED: readonly DashboardEvent[] = [
  { id: 'evt_1', labelKey: DASHBOARD_KEYS.schedule.events.planRenewal, day: 4 },
  { id: 'evt_2', labelKey: DASHBOARD_KEYS.schedule.events.accessReview, day: 12 },
  { id: 'evt_3', labelKey: DASHBOARD_KEYS.schedule.events.teamSync, day: 18 },
  { id: 'evt_4', labelKey: DASHBOARD_KEYS.schedule.events.invoiceDue, day: 26 },
] as const;

export type DashboardScheduledEvent = DashboardEvent & { date: Date };

/**
 * Resolve seeded day-of-month events into concrete `Date`s within the month
 * of `reference` (defaults to today), clamped to the month's length.
 */
export function resolveDashboardEvents(
  reference: Date = new Date(),
): DashboardScheduledEvent[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return DASHBOARD_EVENT_SEED.map((event) => ({
    ...event,
    date: new Date(year, month, Math.min(event.day, daysInMonth)),
  }));
}

/** One seeded feed entry — an event type plus how many hours ago it happened. */
export type DashboardActivityItem = {
  id: string;
  labelKey: string;
  icon: 'invite' | 'role' | 'billing' | 'workspace';
  /** Hours before the reference time the event occurred. */
  hoursAgo: number;
};

const DASHBOARD_ACTIVITY_SEED: readonly DashboardActivityItem[] = [
  {
    id: 'act_1',
    labelKey: DASHBOARD_KEYS.activity.events.inviteAccepted,
    icon: 'invite',
    hoursAgo: 2,
  },
  {
    id: 'act_2',
    labelKey: DASHBOARD_KEYS.activity.events.roleUpdated,
    icon: 'role',
    hoursAgo: 7,
  },
  {
    id: 'act_3',
    labelKey: DASHBOARD_KEYS.activity.events.planRenewed,
    icon: 'billing',
    hoursAgo: 26,
  },
  {
    id: 'act_4',
    labelKey: DASHBOARD_KEYS.activity.events.settingsChanged,
    icon: 'workspace',
    hoursAgo: 52,
  },
] as const;

/** A feed entry resolved to a concrete timestamp. */
export type DashboardActivityEvent = DashboardActivityItem & { at: Date };

/**
 * Resolve the seeded feed into concrete timestamps relative to `reference`
 * (defaults to now) so relative-time labels stay plausible on any day.
 */
export function resolveDashboardActivity(
  reference: Date = new Date(),
): DashboardActivityEvent[] {
  return DASHBOARD_ACTIVITY_SEED.map((item) => ({
    ...item,
    at: new Date(reference.getTime() - item.hoursAgo * 3_600_000),
  }));
}

/** One mini trend card — current value, week-over-week delta, sparkline points. */
export type DashboardTrend = {
  id: 'sessions' | 'apiCalls' | 'reviews';
  labelKey: string;
  value: number;
  /** Week-over-week change in percent (signed, one decimal of precision). */
  deltaPct: number;
  /** Fourteen daily points, oldest first, for the sparkline. */
  points: number[];
};

function trendFromSeries(
  id: DashboardTrend['id'],
  labelKey: string,
  points: number[],
): DashboardTrend {
  const lastWeek = points.slice(-7).reduce((sum, v) => sum + v, 0);
  const prevWeek = points.slice(-14, -7).reduce((sum, v) => sum + v, 0);
  const deltaPct = prevWeek === 0 ? 0 : ((lastWeek - prevWeek) / prevWeek) * 100;
  return {
    id,
    labelKey,
    value: lastWeek,
    deltaPct: Math.round(deltaPct * 10) / 10,
    points,
  };
}

/**
 * Build the three trend-strip cards from the same deterministic sample series
 * the analytics chart draws, so every number on the surface agrees.
 */
export function buildDashboardTrends(reference: Date = new Date()): DashboardTrend[] {
  const series = buildAnalyticsSeries('30d', reference).slice(-14);
  const reviews = series.map((_, i) =>
    Math.round(3 + 2 * Math.sin(i / 2) + seeded(i * 3) * 3),
  );
  return [
    trendFromSeries(
      'sessions',
      DASHBOARD_KEYS.analytics.seriesSessions,
      series.map((p) => p.sessions),
    ),
    trendFromSeries(
      'apiCalls',
      DASHBOARD_KEYS.analytics.seriesApiCalls,
      series.map((p) => p.apiCalls),
    ),
    trendFromSeries('reviews', DASHBOARD_KEYS.pulse.metrics.reviews, reviews),
  ];
}

/** One stage of the acquisition funnel. */
export type DashboardFunnelStage = {
  id: 'visited' | 'signedUp' | 'onboarded' | 'activated';
  labelKey: string;
  value: number;
};

/** Placeholder acquisition funnel (sample-badged). */
export const DASHBOARD_FUNNEL_STAGES: readonly DashboardFunnelStage[] = [
  { id: 'visited', labelKey: DASHBOARD_KEYS.funnel.stages.visited, value: 2400 },
  { id: 'signedUp', labelKey: DASHBOARD_KEYS.funnel.stages.signedUp, value: 1350 },
  { id: 'onboarded', labelKey: DASHBOARD_KEYS.funnel.stages.onboarded, value: 940 },
  { id: 'activated', labelKey: DASHBOARD_KEYS.funnel.stages.activated, value: 610 },
] as const;

/**
 * Seeded contribution heatmap — `weeks` columns × 7 rows of 0..4 intensity
 * levels, deterministic so tests and snapshots stay stable.
 */
export function buildDashboardHeatmap(weeks = 12): number[][] {
  const grid: number[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: number[] = [];
    for (let day = 0; day < 7; day += 1) {
      const v = seeded(week * 7 + day + 11);
      if (v < 0.18) column.push(0);
      else if (v < 0.45) column.push(1);
      else if (v < 0.7) column.push(2);
      else if (v < 0.88) column.push(3);
      else column.push(4);
    }
    grid.push(column);
  }
  return grid;
}

/** One axis of the workspace-health radar (0..100). */
export type DashboardRadarAxis = {
  id: 'activity' | 'growth' | 'security' | 'automation' | 'engagement';
  labelKey: string;
  value: number;
};

/** Placeholder workspace-health radar values (sample-badged). */
export const DASHBOARD_RADAR_AXES: readonly DashboardRadarAxis[] = [
  { id: 'activity', labelKey: DASHBOARD_KEYS.radar.axes.activity, value: 82 },
  { id: 'growth', labelKey: DASHBOARD_KEYS.radar.axes.growth, value: 64 },
  { id: 'security', labelKey: DASHBOARD_KEYS.radar.axes.security, value: 91 },
  { id: 'automation', labelKey: DASHBOARD_KEYS.radar.axes.automation, value: 58 },
  { id: 'engagement', labelKey: DASHBOARD_KEYS.radar.axes.engagement, value: 73 },
] as const;

/** One automation on the run-count leaderboard. */
export type DashboardAutomationRank = {
  id: 'welcomeEmail' | 'weeklyDigest' | 'slackSync' | 'backupJob';
  labelKey: string;
  runs: number;
  deltaPct: number;
};

/** Placeholder automation leaderboard, sorted by runs (sample-badged).
 *  Deliberately automations, not people — fixture people are banned here. */
export const DASHBOARD_AUTOMATION_RANKS: readonly DashboardAutomationRank[] = [
  {
    id: 'welcomeEmail',
    labelKey: DASHBOARD_KEYS.leaderboard.items.welcomeEmail,
    runs: 483,
    deltaPct: 12.4,
  },
  {
    id: 'weeklyDigest',
    labelKey: DASHBOARD_KEYS.leaderboard.items.weeklyDigest,
    runs: 351,
    deltaPct: 6.1,
  },
  {
    id: 'slackSync',
    labelKey: DASHBOARD_KEYS.leaderboard.items.slackSync,
    runs: 287,
    deltaPct: -3.8,
  },
  {
    id: 'backupJob',
    labelKey: DASHBOARD_KEYS.leaderboard.items.backupJob,
    runs: 122,
    deltaPct: 1.9,
  },
] as const;

/** One plan-limit meter row. */
export type DashboardPlanMeter = {
  id: 'workspaces' | 'members' | 'automations';
  labelKey: string;
  used: number;
  max: number;
};

/** Placeholder plan limits (sample caps; `automations` used matches the pulse
 *  metric so the surface stays coherent). */
export const DASHBOARD_PLAN_METERS: readonly DashboardPlanMeter[] = [
  { id: 'workspaces', labelKey: DASHBOARD_KEYS.stats.workspaces, used: 3, max: 10 },
  { id: 'members', labelKey: DASHBOARD_KEYS.members.heading, used: 12, max: 50 },
  {
    id: 'automations',
    labelKey: DASHBOARD_KEYS.pulse.metrics.automations,
    used: 46,
    max: 100,
  },
] as const;

/** Placeholder billing summary (sample-badged; the next-invoice date derives
 *  from the schedule's `invoiceDue` event so both cards agree). */
export const DASHBOARD_BILLING_SAMPLE = {
  amount: 49,
  currency: 'USD',
  cardLast4: '4242',
} as const;

/** One mini-gantt row — a schedule event stretched to a duration in days. */
export type DashboardGanttItem = DashboardScheduledEvent & { durationDays: number };

const GANTT_DURATIONS: readonly number[] = [4, 6, 3, 5];

/** The schedule's seeded events as ranged bars for the mini gantt. */
export function resolveDashboardGantt(
  reference: Date = new Date(),
): DashboardGanttItem[] {
  return resolveDashboardEvents(reference).map((event, index) => ({
    ...event,
    durationDays: GANTT_DURATIONS[index % GANTT_DURATIONS.length] ?? 4,
  }));
}

/** One region row on the global-activity map. */
export type DashboardMapRegion = {
  id: 'americas' | 'europe' | 'asia' | 'oceania';
  labelKey: string;
  value: number;
};

/**
 * Placeholder sessions-by-region split for the map card. Deliberately sums to
 * the same 1,055 total as {@link DASHBOARD_SOURCE_SEGMENTS} so the map, donut,
 * and trend cards all tell one coherent (sample-badged) story.
 */
export const DASHBOARD_MAP_REGIONS: readonly DashboardMapRegion[] = [
  { id: 'americas', labelKey: DASHBOARD_KEYS.map.regions.americas, value: 428 },
  { id: 'europe', labelKey: DASHBOARD_KEYS.map.regions.europe, value: 312 },
  { id: 'asia', labelKey: DASHBOARD_KEYS.map.regions.asia, value: 236 },
  { id: 'oceania', labelKey: DASHBOARD_KEYS.map.regions.oceania, value: 79 },
] as const;

/** One ping on the map — a city marker tied to a region's colour. */
export type DashboardMapMarker = {
  id: string;
  region: DashboardMapRegion['id'];
  /** Longitude in degrees, −180..180. */
  lon: number;
  /** Latitude in degrees, positive north. */
  lat: number;
};

/** Seeded activity pings (major hubs), one colour per region. */
export const DASHBOARD_MAP_MARKERS: readonly DashboardMapMarker[] = [
  { id: 'nyc', region: 'americas', lon: -74, lat: 41 },
  { id: 'sao', region: 'americas', lon: -46.6, lat: -23.5 },
  { id: 'lon', region: 'europe', lon: -0.1, lat: 51.5 },
  { id: 'mum', region: 'asia', lon: 72.9, lat: 19.1 },
  { id: 'sin', region: 'asia', lon: 103.8, lat: 1.4 },
  { id: 'syd', region: 'oceania', lon: 151.2, lat: -33.9 },
] as const;

/** One slice of the sessions-by-source donut. */
export type DashboardSourceSegment = {
  id: 'web' | 'mobile' | 'api';
  labelKey: string;
  value: number;
};

/** Placeholder sessions-by-source split for the donut card (sample-badged). */
export const DASHBOARD_SOURCE_SEGMENTS: readonly DashboardSourceSegment[] = [
  { id: 'web', labelKey: DASHBOARD_KEYS.donut.segments.web, value: 612 },
  { id: 'mobile', labelKey: DASHBOARD_KEYS.donut.segments.mobile, value: 285 },
  { id: 'api', labelKey: DASHBOARD_KEYS.donut.segments.api, value: 158 },
] as const;

/** One weekly-activity metric on the pulse gauge — progress toward a target. */
export type DashboardPulseMetric = {
  id: 'sessions' | 'automations' | 'reviews';
  labelKey: string;
  value: number;
  target: number;
};

/** Placeholder weekly-activity metrics for the pulse gauge (sample-badged). */
export const DASHBOARD_PULSE_METRICS: readonly DashboardPulseMetric[] = [
  {
    id: 'sessions',
    labelKey: DASHBOARD_KEYS.pulse.metrics.sessions,
    value: 132,
    target: 180,
  },
  {
    id: 'automations',
    labelKey: DASHBOARD_KEYS.pulse.metrics.automations,
    value: 46,
    target: 60,
  },
  {
    id: 'reviews',
    labelKey: DASHBOARD_KEYS.pulse.metrics.reviews,
    value: 9,
    target: 15,
  },
] as const;

/** Completion of one pulse metric, clamped to [0, 1]. */
export function dashboardPulseRatio(metric: DashboardPulseMetric): number {
  if (metric.target <= 0) return 0;
  return Math.min(1, Math.max(0, metric.value / metric.target));
}

/** Overall pulse score — the mean metric completion as a 0–100 integer. */
export function dashboardPulseScore(metrics: readonly DashboardPulseMetric[]): number {
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, metric) => sum + dashboardPulseRatio(metric), 0);
  return Math.round((total / metrics.length) * 100);
}

export type AnalyticsPoint = {
  /** Short, human-readable axis label, e.g. "Jun 4". */
  label: string;
  sessions: number;
  apiCalls: number;
};

/** Deterministic pseudo-random in [0, 1) so placeholder curves stay stable in tests. */
function seeded(index: number): number {
  return Math.abs(Math.sin(index * 12.9898) * 43_758.5453) % 1;
}

/** Default axis label when the caller does not supply a locale-aware formatter. */
function defaultAnalyticsAxisLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Build a deterministic daily series for the analytics chart placeholder.
 * Pass `formatLabel` from {@link useLocaleFormat} so axis ticks follow the
 * user's regional locale + timezone preferences.
 */
export function buildAnalyticsSeries(
  range: AnalyticsRange,
  reference: Date = new Date(),
  formatLabel: (date: Date) => string = defaultAnalyticsAxisLabel,
): AnalyticsPoint[] {
  const days = ANALYTICS_RANGE_DAYS.get(range) ?? 30;
  const points: AnalyticsPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(reference);
    date.setDate(date.getDate() - offset);
    const i = days - offset;
    points.push({
      label: formatLabel(date),
      sessions: Math.round(140 + 70 * Math.sin(i / 6) + seeded(i) * 60),
      apiCalls: Math.round(320 + 150 * Math.sin(i / 4 + 1) + seeded(i * 2) * 140),
    });
  }
  return points;
}
