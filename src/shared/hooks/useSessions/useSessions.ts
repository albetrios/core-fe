import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import type { Session } from '@/shared/api/session-contracts.ts';
import * as api from '@/shared/api/sessions-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

const sessionsQueryKey = ['auth', 'sessions'] as const;

/** The signed-in user's active sessions. Server state only. */
export function useSessions() {
  return useAppQuery({
    queryKey: sessionsQueryKey,
    queryFn: api.listSessions,
    // The panel renders an inline failure row for exactly this query.
    notifyOnError: false,
  });
}

/** Revoke another session, then refresh the list. */
export function useRevokeSession() {
  return useAppMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    invalidateKeys: [sessionsQueryKey],
    optimistic: {
      queryKey: sessionsQueryKey,
      update: (previous: Session[] | undefined, id) =>
        previous?.filter((session) => session.id !== id),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.sessions.signOutSuccess, {
      ns: ERRORS_NS,
    }),
  });
}
