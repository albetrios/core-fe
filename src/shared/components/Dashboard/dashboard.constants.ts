import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

export const DASHBOARD_NS = I18N_NAMESPACES.dashboard;

export const DASHBOARD_KEYS = {
  greeting: 'greeting',
  greetingFallback: 'greetingFallback',
  heroSubtitle: 'heroSubtitle',
  heroSubtitleSolo: 'heroSubtitleSolo',
  errorLoad: 'errorLoad',
  workspaceFallback: 'workspaceFallback',
  workspaceNameFallback: 'workspaceNameFallback',
  orgType: { team: 'orgType.team', personal: 'orgType.personal' },
  status: {
    active: 'status.active',
    suspended: 'status.suspended',
    archived: 'status.archived',
  },
  overview: { ariaLabel: 'overview.ariaLabel' },
  stats: {
    workspaces: 'stats.workspaces',
    workspacesHintOne: 'stats.workspacesHintOne',
    workspacesHintMany: 'stats.workspacesHintMany',
    permissions: 'stats.permissions',
    permissionsHint: 'stats.permissionsHint',
    type: 'stats.type',
    typeHintTeam: 'stats.typeHintTeam',
    typeHintPersonal: 'stats.typeHintPersonal',
    billing: 'stats.billing',
    billingManaged: 'stats.billingManaged',
    billingNone: 'stats.billingNone',
    billingHintTeam: 'stats.billingHintTeam',
    billingHintPersonal: 'stats.billingHintPersonal',
  },
  nextSteps: {
    ariaLabel: 'nextSteps.ariaLabel',
    heading: 'nextSteps.heading',
  },
  quickActions: {
    ariaLabel: 'quickActions.ariaLabel',
    heading: 'quickActions.heading',
    inviteTitle: 'quickActions.inviteTitle',
    inviteDescription: 'quickActions.inviteDescription',
    rolesTitle: 'quickActions.rolesTitle',
    rolesDescription: 'quickActions.rolesDescription',
    billingTitle: 'quickActions.billingTitle',
    billingDescription: 'quickActions.billingDescription',
    orgSettingsTitle: 'quickActions.orgSettingsTitle',
    orgSettingsDescription: 'quickActions.orgSettingsDescription',
    accountTitle: 'quickActions.accountTitle',
    accountDescription: 'quickActions.accountDescription',
  },
  organizations: {
    ariaLabel: 'organizations.ariaLabel',
    heading: 'organizations.heading',
    current: 'organizations.current',
    openWorkspace: 'organizations.openWorkspace',
  },
  insights: {
    ariaLabel: 'insights.ariaLabel',
    heading: 'insights.heading',
  },
  highlights: {
    ariaLabel: 'highlights.ariaLabel',
    heading: 'highlights.heading',
    description: 'highlights.description',
    tabsLabel: 'highlights.tabsLabel',
    slideAnnouncement: 'highlights.slideAnnouncement',
    previousSlide: 'highlights.previousSlide',
    nextSlide: 'highlights.nextSlide',
    goToSlide: 'highlights.goToSlide',
    tabs: {
      appearance: 'highlights.tabs.appearance',
      invite: 'highlights.tabs.invite',
      security: 'highlights.tabs.security',
    },
    slides: {
      appearance: {
        title: 'highlights.slides.appearance.title',
        description: 'highlights.slides.appearance.description',
        action: 'highlights.slides.appearance.action',
      },
      invite: {
        title: 'highlights.slides.invite.title',
        description: 'highlights.slides.invite.description',
        action: 'highlights.slides.invite.action',
      },
      security: {
        title: 'highlights.slides.security.title',
        description: 'highlights.slides.security.description',
        action: 'highlights.slides.security.action',
      },
    },
  },
  analytics: {
    heading: 'analytics.heading',
    description: 'analytics.description',
    rangeLabel: 'analytics.rangeLabel',
    seriesSessions: 'analytics.seriesSessions',
    seriesApiCalls: 'analytics.seriesApiCalls',
    range: {
      '7d': 'analytics.range.7d',
      '30d': 'analytics.range.30d',
      '90d': 'analytics.range.90d',
    },
  },
  members: {
    ariaLabel: 'members.ariaLabel',
    heading: 'members.heading',
    description: 'members.description',
    error: 'members.error',
    columnMember: 'members.columnMember',
    columnRole: 'members.columnRole',
    columnStatus: 'members.columnStatus',
    columnJoined: 'members.columnJoined',
    status: {
      active: 'members.status.active',
      invited: 'members.status.invited',
      suspended: 'members.status.suspended',
    },
  },
  sampleBadge: 'sampleBadge',
  themeShowcase: {
    ariaLabel: 'themeShowcase.ariaLabel',
    heading: 'themeShowcase.heading',
    shuffle: 'themeShowcase.shuffle',
    customize: 'themeShowcase.customize',
    custom: 'themeShowcase.custom',
    default: 'themeShowcase.default',
    shuffledTitle: 'themeShowcase.shuffledTitle',
    shuffledDescription: 'themeShowcase.shuffledDescription',
  },
  trends: {
    heading: 'trends.heading',
    description: 'trends.description',
  },
  usageBars: {
    heading: 'usageBars.heading',
    description: 'usageBars.description',
  },
  heatmap: {
    heading: 'heatmap.heading',
    description: 'heatmap.description',
    less: 'heatmap.less',
    more: 'heatmap.more',
  },
  funnel: {
    heading: 'funnel.heading',
    description: 'funnel.description',
    stages: {
      visited: 'funnel.stages.visited',
      signedUp: 'funnel.stages.signedUp',
      onboarded: 'funnel.stages.onboarded',
      activated: 'funnel.stages.activated',
    },
  },
  radar: {
    heading: 'radar.heading',
    description: 'radar.description',
    axes: {
      activity: 'radar.axes.activity',
      growth: 'radar.axes.growth',
      security: 'radar.axes.security',
      automation: 'radar.axes.automation',
      engagement: 'radar.axes.engagement',
    },
  },
  leaderboard: {
    heading: 'leaderboard.heading',
    description: 'leaderboard.description',
    runs: 'leaderboard.runs',
    items: {
      welcomeEmail: 'leaderboard.items.welcomeEmail',
      weeklyDigest: 'leaderboard.items.weeklyDigest',
      slackSync: 'leaderboard.items.slackSync',
      backupJob: 'leaderboard.items.backupJob',
    },
  },
  focus: {
    heading: 'focus.heading',
    description: 'focus.description',
    start: 'focus.start',
    pause: 'focus.pause',
    reset: 'focus.reset',
  },
  meters: {
    heading: 'meters.heading',
    description: 'meters.description',
  },
  billingCard: {
    heading: 'billingCard.heading',
    description: 'billingCard.description',
    plan: 'billingCard.plan',
    nextInvoice: 'billingCard.nextInvoice',
    payment: 'billingCard.payment',
  },
  ai: {
    heading: 'ai.heading',
    description: 'ai.description',
    placeholder: 'ai.placeholder',
    chips: {
      usage: 'ai.chips.usage',
      members: 'ai.chips.members',
      appearance: 'ai.chips.appearance',
    },
  },
  map: {
    heading: 'map.heading',
    description: 'map.description',
    regions: {
      americas: 'map.regions.americas',
      europe: 'map.regions.europe',
      asia: 'map.regions.asia',
      oceania: 'map.regions.oceania',
    },
  },
  donut: {
    heading: 'donut.heading',
    description: 'donut.description',
    segments: {
      web: 'donut.segments.web',
      mobile: 'donut.segments.mobile',
      api: 'donut.segments.api',
    },
  },
  ranking: {
    heading: 'ranking.heading',
    description: 'ranking.description',
  },
  timeline: {
    heading: 'timeline.heading',
    description: 'timeline.description',
    today: 'timeline.today',
  },
  activity: {
    heading: 'activity.heading',
    description: 'activity.description',
    events: {
      inviteAccepted: 'activity.events.inviteAccepted',
      roleUpdated: 'activity.events.roleUpdated',
      planRenewed: 'activity.events.planRenewed',
      settingsChanged: 'activity.events.settingsChanged',
    },
  },
  pulse: {
    heading: 'pulse.heading',
    description: 'pulse.description',
    score: 'pulse.score',
    metrics: {
      sessions: 'pulse.metrics.sessions',
      automations: 'pulse.metrics.automations',
      reviews: 'pulse.metrics.reviews',
    },
  },
  schedule: {
    ariaLabel: 'schedule.ariaLabel',
    heading: 'schedule.heading',
    description: 'schedule.description',
    upcoming: 'schedule.upcoming',
    legendEvent: 'schedule.legendEvent',
    empty: 'schedule.empty',
    events: {
      planRenewal: 'schedule.events.planRenewal',
      accessReview: 'schedule.events.accessReview',
      teamSync: 'schedule.events.teamSync',
      invoiceDue: 'schedule.events.invoiceDue',
    },
  },
} as const;

export const ORG_STATUS_LABEL_KEYS = {
  ACTIVE: DASHBOARD_KEYS.status.active,
  SUSPENDED: DASHBOARD_KEYS.status.suspended,
  ARCHIVED: DASHBOARD_KEYS.status.archived,
} as const;

export const DASHBOARD_TEST_IDS = {
  page: 'dashboard-page',
  greeting: 'dashboard-greeting',
  membersTable: 'dashboard-members-table',
  scheduleCalendar: 'dashboard-schedule-calendar',
  analyticsChart: 'dashboard-analytics-chart',
  analyticsRange: 'dashboard-analytics-range',
  highlightsCarousel: 'dashboard-highlights-carousel',
  highlightsTabs: 'dashboard-highlights-tabs',
} as const;

/** Analytics chart time-range options, in display order. */
export const ANALYTICS_RANGES = ['7d', '30d', '90d'] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Number of daily data points per range. */
export const ANALYTICS_RANGE_DAYS = new Map<AnalyticsRange, number>([
  ['7d', 7],
  ['30d', 30],
  ['90d', 90],
]);

/**
 * Member roster status → i18n key + Badge variant. Status drives both the label
 * and the visual treatment so the appearance/theme axes (radius, colour) are
 * exercised on real-looking data.
 */
export const MEMBER_STATUS_META = {
  active: { key: DASHBOARD_KEYS.members.status.active, variant: 'secondary' },
  invited: { key: DASHBOARD_KEYS.members.status.invited, variant: 'outline' },
  suspended: { key: DASHBOARD_KEYS.members.status.suspended, variant: 'destructive' },
} as const;
