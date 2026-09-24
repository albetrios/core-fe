import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';

import { useRemoveUserAvatar, useUploadUserAvatar } from './useUserAvatar.ts';

const { uploadUserAvatar, removeUserAvatar } = vi.hoisted(() => ({
  uploadUserAvatar: vi.fn(),
  removeUserAvatar: vi.fn(),
}));
vi.mock('@/shared/api/user-avatar-api.ts', () => ({
  uploadUserAvatar,
  removeUserAvatar,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const avatar = () => new File(['bytes'], 'me.png', { type: 'image/png' });

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('useUploadUserAvatar', () => {
  it('sends the chosen file through the uploads flow', async () => {
    uploadUserAvatar.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUploadUserAvatar(), { wrapper });
    const file = avatar();
    result.current.mutate(file);

    await waitFor(() => expect(uploadUserAvatar).toHaveBeenCalledWith(file));
  });

  // `avatar_url` is a short-lived SIGNED URL, so the cached copy expires on its own. The
  // invalidation is what re-signs it — without this the preview would eventually 403.
  it('invalidates me-context so the signed URL is re-fetched', async () => {
    uploadUserAvatar.mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUploadUserAvatar(), { wrapper });
    result.current.mutate(avatar());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: meContextQueryKey }),
    );
  });

  // core-be only rewrites the user row once the object is confirmed in storage, so a failure
  // anywhere in the flow leaves the previous avatar intact — the UI must report it, not
  // pretend the change landed.
  it('surfaces a failed upload rather than reporting success', async () => {
    uploadUserAvatar.mockRejectedValue(new Error('storage refused'));

    const { result } = renderHook(() => useUploadUserAvatar(), { wrapper });
    result.current.mutate(avatar());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRemoveUserAvatar', () => {
  it('calls the delete route', async () => {
    removeUserAvatar.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveUserAvatar(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(removeUserAvatar).toHaveBeenCalled());
  });

  it('invalidates me-context so the cleared avatar disappears', async () => {
    removeUserAvatar.mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveUserAvatar(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: meContextQueryKey }),
    );
  });

  it('surfaces a failed removal', async () => {
    removeUserAvatar.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useRemoveUserAvatar(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
