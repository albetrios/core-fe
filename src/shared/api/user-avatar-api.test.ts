import { beforeEach, describe, expect, it, vi } from 'vitest';

const { putMock, deleteMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  deleteMock: vi.fn(),
}));
const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));
vi.mock('./uploads-api.ts', () => ({ uploadFile: uploadFileMock }));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { put: putMock, delete: deleteMock },
}));

import { removeUserAvatar, uploadUserAvatar } from './user-avatar-api.ts';

const AVATAR_KEY = 'avatars/usr_abcdefghij0123456789x/photo.png';

function avatarFile() {
  return new File(['bytes'], 'me.png', { type: 'image/png' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadUserAvatar', () => {
  it('uploads with the user-scoped purpose, then attaches the returned key', async () => {
    uploadFileMock.mockResolvedValue({ key: AVATAR_KEY });
    putMock.mockResolvedValue({ data: null });

    const file = avatarFile();
    await uploadUserAvatar(file);

    expect(uploadFileMock).toHaveBeenCalledWith({ file, purpose: 'avatar' });
    expect(putMock).toHaveBeenCalledWith(expect.stringContaining('/users/me/avatar'), {
      avatar_key: AVATAR_KEY,
    });
  });

  // The organization-logo route takes `{ key }`; this one takes `{ avatar_key }` and its DTO
  // is `.strict()`. Sending the wrong name is a 400 twice over — unrecognised field AND
  // missing required field — so the name is pinned rather than left to a reviewer to notice.
  it("sends avatar_key, never the organization route's key", async () => {
    uploadFileMock.mockResolvedValue({ key: AVATAR_KEY });
    putMock.mockResolvedValue({ data: null });

    await uploadUserAvatar(avatarFile());

    const [, body] = putMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toHaveProperty('avatar_key');
    expect(body).not.toHaveProperty('key');
    expect(Object.keys(body)).toEqual(['avatar_key']);
  });

  // core-be refuses any key outside `avatars/`, and the service additionally checks it sits
  // under THIS user's prefix — so the key must be the one confirm returned, never composed.
  it('forwards the confirmed key verbatim', async () => {
    uploadFileMock.mockResolvedValue({ key: AVATAR_KEY });
    putMock.mockResolvedValue({ data: null });

    await uploadUserAvatar(avatarFile());

    const [, body] = putMock.mock.calls[0] as [string, { avatar_key: string }];
    expect(body.avatar_key).toBe(AVATAR_KEY);
    expect(body.avatar_key.startsWith('avatars/')).toBe(true);
  });

  it('does not attach when the upload fails, so the old avatar stands', async () => {
    uploadFileMock.mockRejectedValue(new Error('storage refused'));

    await expect(uploadUserAvatar(avatarFile())).rejects.toThrow('storage refused');
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe('removeUserAvatar', () => {
  it('calls DELETE on the avatar route', async () => {
    deleteMock.mockResolvedValue({ data: null });

    await removeUserAvatar();

    expect(deleteMock).toHaveBeenCalledWith(expect.stringContaining('/users/me/avatar'));
  });
});
