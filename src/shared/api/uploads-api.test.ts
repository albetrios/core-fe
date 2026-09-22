import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { post: postMock },
}));

import { uploadFile } from './uploads-api.ts';

const PRESIGN = {
  id: 'upl_x',
  upload_url: 'https://storage.example.test/pending/organization-logos/org_a/abc.png',
  key: 'organization-logos/org_a/abc.png',
  upload_method: 'PUT' as const,
};

function logoFile(name = 'logo.png') {
  return new File(['bytes'], name, { type: 'image/png' });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});

describe('uploadFile', () => {
  it('presigns, writes the bytes to storage, confirms, and returns the FINAL key', async () => {
    postMock
      .mockResolvedValueOnce({ data: PRESIGN })
      .mockResolvedValueOnce({ data: { id: 'upl_x', status: 'UPLOADED' } });

    const result = await uploadFile({
      file: logoFile(),
      purpose: 'organization-logo',
      organizationId: 'org_a',
    });

    expect(postMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/uploads'),
      expect.objectContaining({
        purpose: 'organization-logo',
        for: 'organization',
        organization_id: 'org_a',
        content_type: 'image/png',
        file_name: 'logo.png',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      PRESIGN.upload_url,
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/uploads/upl_x/confirm'),
      {},
    );
    // The attach routes want the promoted key, never the `pending/` path the presigned URL
    // points at — handing them the latter is a 400.
    expect(result.key).toBe('organization-logos/org_a/abc.png');
    expect(result.key.startsWith('pending/')).toBe(false);
  });

  // The bearer token must never reach the storage origin — `apiClient` refuses to attach it
  // there, which is exactly why this one call uses a raw fetch instead.
  it('sends no Authorization header to the storage origin', async () => {
    postMock
      .mockResolvedValueOnce({ data: PRESIGN })
      .mockResolvedValueOnce({ data: { id: 'upl_x', status: 'UPLOADED' } });

    await uploadFile({
      file: logoFile(),
      purpose: 'organization-logo',
      organizationId: 'org_a',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('throws when storage rejects the write, so nothing is attached', async () => {
    postMock.mockResolvedValueOnce({ data: PRESIGN });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(
      uploadFile({
        file: logoFile(),
        purpose: 'organization-logo',
        organizationId: 'org_a',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_STORAGE_REJECTED' });
    // Confirm is never reached.
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('throws when confirm comes back as anything other than UPLOADED', async () => {
    postMock
      .mockResolvedValueOnce({ data: PRESIGN })
      .mockResolvedValueOnce({ data: { id: 'upl_x', status: 'FAILED' } });

    await expect(
      uploadFile({
        file: logoFile(),
        purpose: 'organization-logo',
        organizationId: 'org_a',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_CONFIRMED' });
  });

  it('refuses a traversing file name before it reaches the API', async () => {
    await expect(
      uploadFile({
        file: logoFile('../../etc/passwd.png'),
        purpose: 'organization-logo',
        organizationId: 'org_a',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_INVALID_FILE_NAME' });
    expect(postMock).not.toHaveBeenCalled();
  });

  // S3 browser POST uploads take the policy fields as a multipart form, and the file MUST be
  // appended last — anything after it is ignored by S3.
  it('submits a multipart form when the presign asks for POST', async () => {
    postMock
      .mockResolvedValueOnce({
        data: {
          ...PRESIGN,
          upload_method: 'POST',
          fields: { key: 'organization-logos/org_a/abc.png', policy: 'p', signature: 's' },
        },
      })
      .mockResolvedValueOnce({ data: { id: 'upl_x', status: 'UPLOADED' } });

    await uploadFile({
      file: logoFile(),
      purpose: 'organization-logo',
      organizationId: 'org_a',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('policy')).toBe('p');
    expect(form.get('signature')).toBe('s');
    expect([...form.keys()].at(-1)).toBe('file');
  });

  it('omits organization_id for a user-scoped upload', async () => {
    postMock
      .mockResolvedValueOnce({
        data: { ...PRESIGN, key: 'avatars/usr_a/abc.png' },
      })
      .mockResolvedValueOnce({ data: { id: 'upl_x', status: 'UPLOADED' } });

    await uploadFile({ file: logoFile(), purpose: 'avatar' });

    const [, body] = postMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.for).toBe('user');
    expect(body).not.toHaveProperty('organization_id');
  });
});
