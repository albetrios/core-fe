import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreference,
} from '@/shared/api/notification-contracts.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { Switch } from '@/shared/components/ui/switch.tsx';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/shared/hooks/useNotifications/index.ts';
import { requestDesktopPermission } from '@/shared/notifications/desktop.ts';

import { SETTINGS_KEYS, SETTINGS_NS } from '../settings.constants.ts';
import { SectionHeader } from '../SettingsPanelShell.tsx';

/**
 * Category and channel rows carry translation KEYS, not English. The labels are
 * resolved at render, so switching locale re-renders them like everything else —
 * a module-level string would have stayed English forever (X-9).
 */
const CATEGORIES: {
  id: NotificationCategory;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    id: 'system',
    labelKey: SETTINGS_KEYS.panels.notifications.categories.system,
    descriptionKey: SETTINGS_KEYS.panels.notifications.categories.systemDescription,
  },
  {
    id: 'member',
    labelKey: SETTINGS_KEYS.panels.notifications.categories.member,
    descriptionKey: SETTINGS_KEYS.panels.notifications.categories.memberDescription,
  },
  {
    id: 'billing',
    labelKey: SETTINGS_KEYS.panels.notifications.categories.billing,
    descriptionKey: SETTINGS_KEYS.panels.notifications.categories.billingDescription,
  },
  {
    id: 'security',
    labelKey: SETTINGS_KEYS.panels.notifications.categories.security,
    descriptionKey: SETTINGS_KEYS.panels.notifications.categories.securityDescription,
  },
];

const CHANNELS: { id: NotificationChannel; labelKey: string }[] = [
  { id: 'email', labelKey: SETTINGS_KEYS.panels.notifications.channels.email },
  { id: 'inApp', labelKey: SETTINGS_KEYS.panels.notifications.channels.inApp },
  { id: 'desktop', labelKey: SETTINGS_KEYS.panels.notifications.channels.desktop },
];

function prefKey(category: NotificationCategory, channel: NotificationChannel): string {
  return `${category}:${channel}`;
}

/** Merge the server matrix with local edits into a full set for full-replace. */
function buildMatrix(
  base: NotificationPreference[],
  overrides: Record<string, boolean>,
): NotificationPreference[] {
  const map = new Map<string, NotificationPreference>();
  for (const p of base) map.set(prefKey(p.category, p.channel), { ...p });
  for (const [key, enabled] of Object.entries(overrides)) {
    const [category, channel] = key.split(':') as [
      NotificationCategory,
      NotificationChannel,
    ];
    map.set(key, { category, channel, enabled });
  }
  return [...map.values()];
}

/**
 * Put one key back the way it was before the failed edit. `undefined` means the
 * key had no override at all, so it must be REMOVED — writing the old value back
 * would pin the switch to a stale copy of server truth instead of following it.
 */
function withRestoredOverride(
  current: Record<string, boolean>,
  key: string,
  previous: boolean | undefined,
): Record<string, boolean> {
  const next = { ...current };
  /* eslint-disable security/detect-object-injection -- key is an internal `category:channel` string built from the fixed CATEGORIES/CHANNELS lists, never user input */
  if (previous === undefined) delete next[key];
  else next[key] = previous;
  /* eslint-enable security/detect-object-injection */
  return next;
}

/** Drop the keys a successful save committed; anything still local is kept. */
function withoutCommitted(
  current: Record<string, boolean>,
  committedKeys: string[],
): Record<string, boolean> {
  const next = { ...current };
  // eslint-disable-next-line security/detect-object-injection -- key is an internal `category:channel` string built from the fixed CATEGORIES/CHANNELS lists, never user input
  for (const key of committedKeys) delete next[key];
  return next;
}

/**
 * Notifications preferences — a category × channel (email / in-app / desktop)
 * grid backed by the preferences API (FE-30, full-replace on each change).
 * Local edits are kept as overrides over the server matrix (derived during
 * render — no prop→state effect). Enabling **desktop** first asks for the OS
 * permission (FE-64); if it isn't granted the toggle stays off and a hint shows.
 */
export function AccountNotificationsPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const {
    data: serverPrefs = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [desktopDenied, setDesktopDenied] = useState(false);
  // Synchronous twin of `update.isPending` — see applyToggle.
  const savingRef = useRef(false);

  function isEnabled(
    category: NotificationCategory,
    channel: NotificationChannel,
  ): boolean {
    const override = overrides[prefKey(category, channel)];
    if (override !== undefined) return override;
    return serverPrefs.some(
      (p) => p.category === category && p.channel === channel && p.enabled,
    );
  }

  async function applyToggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    value: boolean,
  ): Promise<void> {
    // `update.isPending` only disables the switches after React re-renders, so
    // the grid stays live for the frame after the first flick. A second flick in
    // that window paints an override whose write never goes out — the
    // single-flight guard in `useAppMutation` joins the in-flight request rather
    // than sending the new matrix — leaving the UI claiming a preference the
    // server was never told about. This ref flips synchronously and drops it.
    if (savingRef.current) return;

    if (channel === 'desktop' && value) {
      const permission = await requestDesktopPermission();
      if (permission !== 'granted') {
        setDesktopDenied(true);
        return;
      }
      setDesktopDenied(false);
    }
    const key = prefKey(category, channel);
    // What this key was showing before the flick — restored verbatim if the save
    // fails, including "no override at all".
    // eslint-disable-next-line security/detect-object-injection -- key is an internal `category:channel` string built from the fixed CATEGORIES/CHANNELS lists, never user input
    const previous = overrides[key];
    const nextOverrides = { ...overrides, [key]: value };
    const committedKeys = Object.keys(nextOverrides);

    savingRef.current = true;
    setOverrides(nextOverrides);
    update.mutate(buildMatrix(serverPrefs, nextOverrides), {
      onSuccess: () => {
        savingRef.current = false;
        // The hook seeded the query cache with the SAVED matrix, so these
        // overrides have done their job. Left behind they shadow server truth
        // for the rest of the session — every later refetch is painted over by
        // a local copy of an edit that already landed.
        setOverrides((current) => withoutCommitted(current, committedKeys));
      },
      onError: () => {
        savingRef.current = false;
        // The save failed, so the switch must go back to what it was showing.
        // `useAppMutation`'s rollback restores the QUERY CACHE; it knows nothing
        // about this local map, so without this the toggle stays where the user
        // flicked it and silently claims a preference that was never stored.
        setOverrides((current) => withRestoredOverride(current, key, previous));
      },
    });
  }

  function handleToggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    value: boolean,
  ): void {
    applyToggle(category, channel, value).catch(() => undefined);
  }

  return (
    <div className="space-y-6" data-testid="settings-section-notifications">
      <SectionHeader
        title={t(SETTINGS_KEYS.panels.notifications.title)}
        description={t(SETTINGS_KEYS.panels.notifications.description)}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t(SETTINGS_KEYS.panels.notifications.deliveryTitle)}
          </CardTitle>
          <CardDescription>
            {t(SETTINGS_KEYS.panels.notifications.deliveryDescription)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            // One block per REAL category, in the same `divide-y` + `py-4` shell
            // as the rendered rows: a label line, a description line and the
            // switch row. Four 48px bars were about a third of the real height,
            // so the card grew under the user when the data landed (SET-22).
            <div className="divide-y" data-testid="notifications-prefs-loading">
              {CATEGORIES.map((cat) => (
                <div key={cat.id} className="py-4 first:pt-0 last:pb-0">
                  {/* 20px label + 16px description + the switch row: the exact
                      line boxes the rendered category uses. */}
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-64" />
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {CHANNELS.map((ch) => (
                      <Skeleton key={ch.id} className="h-5 w-24" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {isError ? (
            <div data-testid="notification-prefs-error">
              <RetryError
                message="Couldn't load your preferences. Please try again."
                onRetry={() => {
                  void refetch();
                }}
                isRetrying={isFetching}
              />
            </div>
          ) : null}

          {!(isLoading || isError) ? (
            <>
              <div className="divide-y">
                {CATEGORIES.map((cat) => (
                  <div key={cat.id} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{t(cat.labelKey)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(cat.descriptionKey)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                      {CHANNELS.map((ch) => (
                        <div key={ch.id} className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={isEnabled(cat.id, ch.id)}
                            onCheckedChange={(value) =>
                              handleToggle(cat.id, ch.id, value)
                            }
                            // The whole grid, not just this switch: the API is a
                            // full replace, so a second edit mid-save has no
                            // payload of its own to send.
                            disabled={update.isPending}
                            aria-label={`${t(cat.labelKey)} — ${t(ch.labelKey)}`}
                            data-testid={`notify-${cat.id}-${ch.id}`}
                          />
                          <span className="text-muted-foreground">{t(ch.labelKey)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {desktopDenied ? (
                <output className="text-muted-foreground mt-4 block text-xs">
                  Desktop notifications need browser permission. Enable them in your
                  browser settings, then turn this on again.
                </output>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
