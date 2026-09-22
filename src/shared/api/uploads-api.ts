import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import { AppError } from '@/shared/errors/AppError.ts';
import { FRONTEND_ERROR_CODES } from '@/shared/errors/frontend-error-codes.ts';

const UPLOADS_API = `${API_BASE_PATH}/uploads`;

/** What core-be accepts for an image upload; SVG is rejected server-side, so never offer it. */
export const UPLOAD_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/** One of the content types core-be accepts for an image upload. */
export type UploadImageContentType = (typeof UPLOAD_IMAGE_CONTENT_TYPES)[number];

/** Per-purpose size ceilings, mirroring core-be's `upload.constants.ts`. */
export const UPLOAD_MAX_BYTES = {
  'organization-logo': 5 * 1024 * 1024,
  avatar: 2 * 1024 * 1024,
} as const;

const presignWire = z.object({
  id: z.string(),
  upload_url: z.string(),
  key: z.string(),
  upload_method: z.enum(['PUT', 'POST']),
  fields: z.record(z.string(), z.string()).optional(),
});

const confirmWire = z.object({
  id: z.string(),
  status: z.string(),
});

/** A file name core-be will accept: no separators, no traversal, no control characters. */
function assertSafeFileName(fileName: string): void {
  // Character-code comparison rather than a regex: a control-character class in a literal is
  // both unreadable and flagged by `no-control-regex`, and this says the same thing plainly.
  const hasControlCharacter = [...fileName].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  if (/[\\/]|\.\./.test(fileName) || hasControlCharacter) {
    throw new AppError(
      FRONTEND_ERROR_CODES.UPLOAD_INVALID_FILE_NAME,
      400,
      FRONTEND_ERROR_CODES.UPLOAD_INVALID_FILE_NAME,
    );
  }
}

/**
 * Put a file in object storage and return the storage key the attach routes want.
 *
 * @remarks
 * - **Algorithm:** three calls, in this order. `POST /uploads` reserves a row and returns a
 *   presigned destination (`apiClient` mints the `X-Idempotency-Key` this route requires);
 *   the bytes go straight to storage; `POST /uploads/{id}/confirm` verifies them server-side
 *   (HEAD + magic bytes) and promotes `pending/<key>` to `<key>`. The returned `key` is the
 *   **final** one, which is what `PUT /tenancy/organization/logo` and `PUT /users/me/avatar`
 *   expect — never the `pending/` path the presigned URL points at.
 * - **Why the raw `fetch`:** step two must NOT go through `apiClient`. That client is
 *   JSON-only, and `isApiOriginUrl` deliberately refuses to attach the bearer token to a
 *   foreign origin — sending a credential to the storage host is exactly what that pin
 *   exists to prevent. This is the one call in the app that legitimately leaves the API
 *   origin, and it carries no credential of ours.
 * - **Failure modes:** a refused presign (403 without `upload:manage` on the organization),
 *   a storage write that does not return 2xx, or a confirm that comes back anything other
 *   than `UPLOADED` all throw. Nothing is attached until confirm succeeds, so a failure
 *   leaves the existing logo/avatar in place.
 */
export async function uploadFile(input: {
  file: File;
  purpose: 'organization-logo' | 'avatar';
  organizationId?: string;
}): Promise<{ key: string }> {
  assertSafeFileName(input.file.name);

  const presignRes = await apiClient.post<unknown>(UPLOADS_API, {
    purpose: input.purpose,
    for: input.purpose === 'organization-logo' ? 'organization' : 'user',
    ...(input.organizationId ? { organization_id: input.organizationId } : {}),
    content_type: input.file.type,
    file_name: input.file.name,
    file_size: input.file.size,
  });
  const presign = presignWire.parse(presignRes.data);

  await putBytes(presign, input.file);

  const confirmRes = await apiClient.post<unknown>(
    `${UPLOADS_API}/${encodeURIComponent(presign.id)}/confirm`,
    {},
  );
  const confirmed = confirmWire.parse(confirmRes.data);
  if (confirmed.status !== 'UPLOADED') {
    throw new AppError(
      FRONTEND_ERROR_CODES.UPLOAD_NOT_CONFIRMED,
      502,
      FRONTEND_ERROR_CODES.UPLOAD_NOT_CONFIRMED,
    );
  }

  return { key: presign.key };
}

async function putBytes(presign: z.infer<typeof presignWire>, file: File): Promise<void> {
  const response =
    presign.upload_method === 'POST'
      ? await fetch(presign.upload_url, {
          method: 'POST',
          body: toMultipart(presign.fields ?? {}, file),
        })
      : await fetch(presign.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

  if (!response.ok) {
    throw new AppError(
      FRONTEND_ERROR_CODES.UPLOAD_STORAGE_REJECTED,
      response.status,
      FRONTEND_ERROR_CODES.UPLOAD_STORAGE_REJECTED,
    );
  }
}

/** The file must be appended last — S3 ignores any form field that follows it. */
function toMultipart(fields: Record<string, string>, file: File): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', file);
  return form;
}
