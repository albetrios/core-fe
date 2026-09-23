import type { LucideIcon } from '@/shared/icons/index.ts';
import {
  Bell,
  Building,
  CreditCard,
  MonitorSmartphone,
  Plug,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  Users,
} from '@/shared/icons/index.ts';
import type { OrganizationType } from '@/shared/tenancy/me-context.ts';

import {
  SETTINGS_GROUP_LABEL_KEYS,
  SETTINGS_SECTION_LABEL_KEYS,
} from './settings.constants.ts';

/**
 * Settings registry — two scopes, one modal (routing-and-tenancy.md §7).
 * Account sections need only a signed-in user; organization sections also
 * need organization context + a permission (settings-permissions.ts).
 */
export type SettingsScope = 'account' | 'organization';

type AccountSettingsSection =
  'profile' | 'account' | 'security' | 'notifications' | 'sessions' | 'billing';

export type OrganizationSettingsSection =
  'general' | 'members' | 'roles' | 'integrations';

export type SettingsSection = AccountSettingsSection | OrganizationSettingsSection;

/** A fully-qualified settings location: scope + section. */
export interface SettingsSectionRef {
  scope: SettingsScope;
  section: SettingsSection;
}

export const SECTIONS_BY_SCOPE: Record<SettingsScope, readonly SettingsSection[]> = {
  account: ['profile', 'account', 'security', 'notifications', 'sessions', 'billing'],
  organization: ['general', 'members', 'roles', 'integrations'],
};

export const DEFAULT_SETTINGS: SettingsSectionRef = {
  scope: 'account',
  section: 'profile',
};

/**
 * Organization sections available per org type. **Team** organizations get the full
 * management set; a **personal** workspace gets none — it has no members, roles or
 * organization-level general settings, and billing lives under Account.
 *
 * @remarks
 * Integrations briefly appeared here for a personal workspace, on the reasoning that
 * core-be's api-key routes are organization-scope `both` and a personal owner holds the
 * `api-key:*` codes. That was true of the backend but produced a dead nav entry:
 * `isSettingsSectionAvailable` refuses every organization-scope section while the active
 * workspace is PERSONAL, so the item rendered and then bounced to a fallback when clicked.
 * Returning nothing here puts the nav and the resolver back in agreement. Whoever wants
 * API keys reachable from a personal workspace has to change BOTH, and give them a home
 * that is not filed under "Organization".
 *
 * Permission gating (settings-permissions.ts) still applies on top.
 */
export function sectionsForOrgType(
  type: OrganizationType,
): readonly OrganizationSettingsSection[] {
  return type === 'TEAM' ? ['general', 'members', 'roles', 'integrations'] : [];
}

/** One openable destination in the Settings nav (and in the command palette). */
export interface SettingsNavItem {
  scope: SettingsScope;
  section: SettingsSection;
  labelKey: string;
  icon: LucideIcon;
  /** Keywords used by the search box; lowercase. */
  keywords: readonly string[];
}

export interface SettingsNavGroup {
  scope: SettingsScope;
  labelKey: string;
  items: readonly SettingsNavItem[];
}

export const SETTINGS_NAV: readonly SettingsNavGroup[] = [
  {
    scope: 'account',
    labelKey: SETTINGS_GROUP_LABEL_KEYS.account,
    items: [
      {
        scope: 'account',
        section: 'profile',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.profile,
        icon: User,
        keywords: ['profile', 'name', 'bio', 'avatar', 'timezone', 'location'],
      },
      {
        scope: 'account',
        section: 'account',
        labelKey: SETTINGS_GROUP_LABEL_KEYS.account,
        icon: UserCog,
        keywords: ['account', 'id', 'email', 'role', 'delete'],
      },
      {
        scope: 'account',
        section: 'security',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.security,
        icon: Shield,
        keywords: ['security', 'mfa', 'two-factor', 'passkey', 'password'],
      },
      {
        scope: 'account',
        section: 'notifications',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.notifications,
        icon: Bell,
        keywords: ['notifications', 'email', 'alerts', 'push'],
      },
      {
        scope: 'account',
        section: 'sessions',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.sessions,
        icon: MonitorSmartphone,
        keywords: ['sessions', 'devices', 'sign out', 'active'],
      },
      {
        scope: 'account',
        section: 'billing',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.billing,
        icon: CreditCard,
        keywords: [
          'billing',
          'plan',
          'subscription',
          'invoices',
          'payment',
          'usage',
          'seats',
        ],
      },
    ],
  },
  {
    scope: 'organization',
    labelKey: SETTINGS_GROUP_LABEL_KEYS.organization,
    items: [
      {
        scope: 'organization',
        section: 'general',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.general,
        icon: Building,
        keywords: ['organization', 'name', 'slug', 'general'],
      },
      {
        scope: 'organization',
        section: 'members',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.members,
        icon: Users,
        keywords: ['members', 'invitations', 'people', 'team'],
      },
      {
        scope: 'organization',
        section: 'roles',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.roles,
        icon: ShieldCheck,
        keywords: ['roles', 'permissions', 'rbac'],
      },
      {
        scope: 'organization',
        section: 'integrations',
        labelKey: SETTINGS_SECTION_LABEL_KEYS.integrations,
        icon: Plug,
        keywords: ['integrations', 'webhooks', 'api keys', 'connect'],
      },
    ],
  },
];

/**
 * Filter navigation by a search query — matches label + keywords.
 * Empty query returns the original groups.
 */
export function filterNav(
  groups: readonly SettingsNavGroup[],
  query: string,
  translate: (key: string) => string,
): readonly SettingsNavGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          translate(item.labelKey).toLowerCase().includes(q) ||
          item.keywords.some((k) => k.includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
/** `scope/section`, the identity a nav item is compared by. */
function sectionKey(ref: SettingsSectionRef): string {
  return `${ref.scope}/${ref.section}`;
}

/**
 * {@link filterNav}'s result, with the section the content pane is showing kept
 * in it.
 *
 * @remarks
 * Searching filters the rail but does not navigate, so the pane goes on showing
 * whatever was open. When the filter dropped that section, the modal contradicted
 * itself: a Profile form filling the pane under a rail listing only Integrations,
 * with `aria-current="page"` on nothing at all — so a screen-reader user in the
 * rail had no current item while a settings pane was open, and a sighted one had
 * a panel with no entry to go back to.
 *
 * Keeping it listed is the smaller half of the answer. The other half is that it
 * stays MARKED current, which is what tells the two panes apart: these matched
 * your search, and this one is what you are looking at.
 *
 * Group and item order come from `all`, so a kept section appears where it always
 * does rather than appended somewhere new. A section that is not in `all` — one
 * this user cannot open — is not resurrected.
 */
export function withActiveSection(
  filtered: readonly SettingsNavGroup[],
  all: readonly SettingsNavGroup[],
  active: SettingsSectionRef,
): readonly SettingsNavGroup[] {
  const activeKey = sectionKey(active);
  const alreadyListed = filtered.some((group) =>
    group.items.some((item) => sectionKey(item) === activeKey),
  );
  if (alreadyListed) return filtered;

  const matched = new Set(
    filtered.flatMap((group) => group.items.map((item) => sectionKey(item))),
  );
  return all
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => matched.has(sectionKey(item)) || sectionKey(item) === activeKey,
      ),
    }))
    .filter((group) => group.items.length > 0);
}
