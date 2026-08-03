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
  href: string;
};

/** Static highlight carousel slides until a CMS or API backs them. */
export const DASHBOARD_HIGHLIGHT_SLIDES: readonly DashboardHighlightSlide[] = [
  {
    id: 'appearance',
    tabKey: DASHBOARD_KEYS.highlights.tabs.appearance,
    titleKey: DASHBOARD_KEYS.highlights.slides.appearance.title,
    descriptionKey: DASHBOARD_KEYS.highlights.slides.appearance.description,
    actionKey: DASHBOARD_KEYS.highlights.slides.appearance.action,
    href: '#settings/account/appearance',
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
  label: string;
  /** Day-of-month within the reference month. */
  day: number;
};

const DASHBOARD_EVENT_SEED: readonly DashboardEvent[] = [
  { id: 'evt_1', label: 'Plan renewal', day: 4 },
  { id: 'evt_2', label: 'Quarterly access review', day: 12 },
  { id: 'evt_3', label: 'Team sync', day: 18 },
  { id: 'evt_4', label: 'Invoice due', day: 26 },
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
