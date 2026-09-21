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
 * Organization sections available per org type. **Personal** organizations have
 * no organization settings group — billing lives under Account. **Team**
 * organizations get the full management set. Permission gating
 * (settings-permissions.ts) still applies on top.
 */
export function sectionsForOrgType(
  type: OrganizationType,
): readonly OrganizationSettingsSection[] {
  return type === 'TEAM' ? ['general', 'members', 'roles', 'integrations'] : [];
}

interface SettingsNavItem {
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
        keywords: ['billing', 'plan', 'subscription', 'invoices', 'payment'],
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
