import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';

import { uploadFile } from './uploads-api.ts';

const AVATAR_API = `${API_BASE_PATH}/users/me/avatar`;

/**
 * Replace the signed-in user's avatar.
 *
 * @remarks
 * Two steps, like the organization logo: the bytes go through the uploads flow (presign →
 * storage → confirm), then `PUT /users/me/avatar` binds the resulting key to the user.
 *
 * The attach body is **`{ avatar_key }`**, not the `{ key }` the organization-logo route
 * takes, and `UploadAvatarDto` is `.strict()` — sending `key` is a 400 on the unrecognised
 * field *and* a 400 on the missing one. core-be additionally refuses any key that does not
 * start with `avatars/`, and the service checks the key sits under **this** user's prefix,
 * so the key handed over must be the one confirm returned rather than anything composed
 * here.
 *
 * A failure at any step leaves the previous avatar in place, so there is nothing to undo.
 *
 * @param file - The chosen image. Callers screen type and size first; core-be re-checks.
 *
 * @example
 * await uploadUserAvatar(file);
 */
export async function uploadUserAvatar(file: File): Promise<void> {
  const { key } = await uploadFile({ file, purpose: 'avatar' });
  await apiClient.put<unknown>(AVATAR_API, { avatar_key: key });
}

/** Clear the signed-in user's avatar (`DELETE /users/me/avatar`, 204 with no body). */
export async function removeUserAvatar(): Promise<void> {
  await apiClient.delete<unknown>(AVATAR_API);
}
