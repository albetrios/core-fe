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

import {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from './organization-logo-api.ts';

describe('organization-api logo', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uploads the bytes, then attaches the FINAL key', async () => {
    uploadFileMock.mockResolvedValue({ key: 'organization-logos/org_a/abc.png' });
    putMock.mockResolvedValue({ data: null });

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    await uploadOrganizationLogo({ file, organizationId: 'org_a' });

    expect(uploadFileMock).toHaveBeenCalledWith({
      file,
      purpose: 'organization-logo',
      organizationId: 'org_a',
    });
    expect(putMock).toHaveBeenCalledWith(expect.stringContaining('/organization/logo'), {
      key: 'organization-logos/org_a/abc.png',
    });
  });

  // Nothing is attached unless the bytes actually landed — a failed upload must leave the
  // existing logo alone rather than pointing the organization at a key that is not there.
  it('does not attach when the upload fails', async () => {
    uploadFileMock.mockRejectedValue(new Error('storage refused'));

    await expect(
      uploadOrganizationLogo({
        file: new File(['b'], 'logo.png', { type: 'image/png' }),
        organizationId: 'org_a',
      }),
    ).rejects.toThrow('storage refused');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('clears the logo through the delete route', async () => {
    deleteMock.mockResolvedValue({ data: null });

    await removeOrganizationLogo();

    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining('/organization/logo'),
    );
  });
});
