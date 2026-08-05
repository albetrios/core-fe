/**
 * PostHog event catalog — single source of truth for product analytics.
 * See `docs/integrations/posthog-frontend.md` for property schemas and dashboards.
 */
export const ANALYTICS_EVENTS = {
  /** Cookie banner accept (denied is store-only — no event). */
  consentDecision: 'analytics_consent_decision',

  /** Auth funnel */
  authEmailCodeSent: 'auth_email_code_sent',
  authEmailCodeVerified: 'auth_email_code_verified',
  authOauthStarted: 'auth_oauth_started',
  authOauthCompleted: 'auth_oauth_completed',
  sessionStarted: 'session_started',
  sessionEnded: 'session_ended',

  /** Tenancy */
  organizationSwitched: 'organization_switched',
  inviteAccepted: 'invite_accepted',

  /** Product surfaces */
  onboardingCompleted: 'onboarding_completed',
  settingsSectionViewed: 'settings_section_viewed',
  commandPaletteOpened: 'command_palette_opened',
  appearanceDialogOpened: 'appearance_dialog_opened',

  /** Deploy / version */
  deploymentUpdateAvailable: 'deployment_update_available',
  deploymentUpdateRefreshClicked: 'deployment_update_refresh_clicked',
  deploymentUpdateDismissed: 'deployment_update_dismissed',

  /** Performance */
  webVital: 'web_vital',

  /** SPA navigation (hash stripped; settings hash emits `settingsSectionViewed`). */
  routeViewed: 'route_viewed',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** PostHog group type for B2B org analytics. */
export const ANALYTICS_ORG_GROUP_TYPE = 'organization';

/** Super properties registered once at init. */
export const ANALYTICS_SUPER_PROPERTIES = {
  appVersion: 'app_version',
  appBuildId: 'app_build_id',
  environment: 'environment',
} as const;
