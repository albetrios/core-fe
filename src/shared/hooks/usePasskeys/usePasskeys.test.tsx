import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePasskeys, useRegisterPasskey, useRemovePasskey } from './usePasskeys.ts';

const { listMock, registerMock, removeMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  registerMock: vi.fn(),
  removeMock: vi.fn(),
}));
vi.mock('@/shared/api/passkeys-api.ts', () => ({
  listPasskeys: listMock,
  registerPasskey: registerMock,
  removePasskey: removeMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { error: vi.fn(), success: vi.fn() },
}));

const PASSKEY = {
  id: 'pk_1',
  name: 'MacBook Touch ID',
  createdAt: '2026-02-10T10:00:00.000Z',
  lastUsedAt: null,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  listMock.mockResolvedValue([PASSKEY]);
  registerMock.mockResolvedValue({ ...PASSKEY, id: 'pk_2', name: 'YubiKey' });
  removeMock.mockResolvedValue(undefined);
});

describe('usePasskeys', () => {
  it('loads the passkey list', async () => {
    const { result } = renderHook(() => usePasskeys(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([PASSKEY]);
  });
});

describe('useRegisterPasskey', () => {
  it('registers a passkey by name', async () => {
    const { result } = renderHook(() => useRegisterPasskey(), { wrapper });
    await result.current.mutateAsync('YubiKey');
    expect(registerMock).toHaveBeenCalledWith('YubiKey');
  });
});

describe('useRemovePasskey', () => {
  it('revokes a passkey by id', async () => {
    const { result } = renderHook(() => useRemovePasskey(), { wrapper });
    await result.current.mutateAsync('pk_1');
    expect(removeMock).toHaveBeenCalledWith('pk_1');
  });
});
