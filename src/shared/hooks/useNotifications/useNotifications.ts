import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import type {
  Notification,
  NotificationPreference,
} from '@/shared/api/notification-contracts.ts';
import { notificationQueryKeys } from '@/shared/api/notification-query-keys.ts';
import * as api from '@/shared/api/notifications-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * Notifications inbox hooks. With no realtime channel yet, the inbox +
 * unread badge poll on an interval (FE-63); a future SSE/WebSocket subscription
 * would replace the poll by invalidating these query keys on push. Server state
 * only — never mirrored into Zustand.
 */
const POLL_INTERVAL_MS = 30_000;

/** The active org's notification inbox for this user (newest first), polled. */
export function useNotifications() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: notificationQueryKeys.list(orgId),
    queryFn: api.listNotifications,
    refetchInterval: POLL_INTERVAL_MS,
    // The popover renders a RetryError inline, and this polls — a toast every
    // 30s would be worse than the inline state.
    notifyOnError: false,
    // Same gate `useMembers` already carries. Without it this polls every 30s
    // against an empty org scope before context resolves and while an org
    // switch is in flight — requests that can only ever come back `Forbidden`,
    // and that keep coming back every interval (SHELL-10).
    enabled: Boolean(orgId),
  });
}

/** Unread count for the bell badge (active org), polled. */
export function useUnreadCount() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: notificationQueryKeys.unreadCount(orgId),
    queryFn: api.getUnreadCount,
    refetchInterval: POLL_INTERVAL_MS,
    // A missing badge count is not worth a toast every poll.
    notifyOnError: false,
    // The badge polls on the same interval as the inbox, so it needs the same
    // gate — otherwise closing one only halves the wasted traffic.
    enabled: Boolean(orgId),
  });
}

/** Mark one notification read with optimistic UI, then refresh. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const orgId = useOrganizationStore((s) => s.organizationId);
  const listKey = notificationQueryKeys.list(orgId);
  const countKey = notificationQueryKeys.unreadCount(orgId);
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all });
      const previousList = queryClient.getQueryData<Notification[]>(listKey);
      const previousCount = queryClient.getQueryData<number>(countKey);
      queryClient.setQueryData<Notification[]>(listKey, (old) =>
        old?.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      if (typeof previousCount === 'number') {
        queryClient.setQueryData(countKey, Math.max(0, previousCount - 1));
      }
      return { previousList, previousCount };
    },
    onError: (_err, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(listKey, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(countKey, context.previousCount);
      }
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.hooks.notifications.updateFailed, { ns: ERRORS_NS }),
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
  });
}

/** Mark the whole inbox read, then refresh. */
export function useMarkAllNotificationsRead() {
  return useAppMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    invalidateKeys: [notificationQueryKeys.all],
  });
}

/** Category × channel delivery preferences (FE-30). */
export function useNotificationPreferences() {
  return useAppQuery({
    queryKey: notificationQueryKeys.preferences(),
    queryFn: api.getNotificationPreferences,
    // The notifications panel renders its own failure state for this query.
    notifyOnError: false,
  });
}

/**
 * One stable toast id for the preferences save. The grid saves on EVERY flick,
 * so without it turning on four switches stacks four identical "saved" toasts
 * and buries the screen. Reusing the id makes sonner replace the previous one.
 */
export const NOTIFICATION_PREFERENCES_TOAST_ID = 'notification-preferences-saved';

/** Full-replace the preference set, seeding the cache with the saved result. */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationFn: (prefs: NotificationPreference[]) =>
      api.updateNotificationPreferences(prefs),
    successMessage: i18n.t(
      ERRORS_KEYS.frontend.hooks.notifications.savePreferencesSuccess,
      {
        ns: ERRORS_NS,
      },
    ),
    toastId: NOTIFICATION_PREFERENCES_TOAST_ID,
    onSuccess: async (saved) => {
      queryClient.setQueryData(notificationQueryKeys.preferences(), saved);
    },
  });
}
