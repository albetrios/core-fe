import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRevokeSession, useSessions } from './useSessions.ts';

const { listMock, revokeMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  revokeMock: vi.fn(),
}));
vi.mock('@/shared/api/sessions-api.ts', () => ({
  listSessions: listMock,
  revokeSession: revokeMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { error: vi.fn(), success: vi.fn() },
}));

const SESSION = {
  id: 'ses_1',
  device: 'Mac',
  browser: 'Chrome',
  location: 'SF',
  lastActiveAt: '2026-06-24T00:00:00.000Z',
  current: true,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  listMock.mockResolvedValue([SESSION]);
  revokeMock.mockResolvedValue(undefined);
});

describe('useSessions', () => {
  it('loads the session list', async () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([SESSION]);
  });

  it('revokes a session', async () => {
    const { result } = renderHook(() => useRevokeSession(), { wrapper });
    result.current.mutate('ses_1');
    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith('ses_1'));
  });
});
