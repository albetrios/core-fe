import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { removeUserAvatar, uploadUserAvatar } from '@/shared/api/user-avatar-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';

/**
 * Everything that reads the user's avatar, invalidated together.
 *
 * @remarks
 * `avatar_url` arrives as a **short-lived signed** read URL, so the cached value is not just
 * stale after a change — it expires on its own. Invalidating me-context is what re-signs it.
 */
const AVATAR_DEPENDENT_KEYS = [meContextQueryKey];

/**
 * Upload a new avatar through the real storage flow.
 *
 * @remarks
 * One mutation covers presign → storage write → confirm → attach, so `isPending` spans the
 * whole wait rather than going quiet during the part that takes longest.
 *
 * A failure at any step leaves the previous avatar in place — core-be only rewrites the user
 * row once the object is confirmed in storage — so there is nothing to roll back.
 */
export function useUploadUserAvatar() {
  return useAppMutation({
    mutationFn: (file: File) => uploadUserAvatar(file),
    invalidateKeys: AVATAR_DEPENDENT_KEYS,
    successMessage: i18n.t(ERRORS_KEYS.frontend.account.avatarUpdated, { ns: ERRORS_NS }),
  });
}

/** Clear the avatar (`DELETE /users/me/avatar`). */
export function useRemoveUserAvatar() {
  return useAppMutation({
    mutationFn: removeUserAvatar,
    invalidateKeys: AVATAR_DEPENDENT_KEYS,
    successMessage: i18n.t(ERRORS_KEYS.frontend.account.avatarRemoved, { ns: ERRORS_NS }),
  });
}
