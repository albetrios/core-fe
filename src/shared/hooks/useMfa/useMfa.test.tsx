import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useBeginMfaEnrollment,
  useConfirmMfaEnrollment,
  useDisableMfa,
  useMfaStatus,
} from './useMfa.ts';

const { statusMock, beginMock, confirmMock, disableMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  beginMock: vi.fn(),
  confirmMock: vi.fn(),
  disableMock: vi.fn(),
}));
vi.mock('@/shared/api/mfa-api.ts', () => ({
  getMfaStatus: statusMock,
  beginMfaEnrollment: beginMock,
  confirmMfaEnrollment: confirmMock,
  disableMfa: disableMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  statusMock.mockResolvedValue(false);
  beginMock.mockResolvedValue({ secret: 'S', otpauthUri: 'otpauth://x' });
  confirmMock.mockResolvedValue({ recoveryCodes: ['a'] });
  disableMock.mockResolvedValue(undefined);
});

describe('useMfa', () => {
  it('loads status', async () => {
    const { result } = renderHook(() => useMfaStatus(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it('begins enrollment', async () => {
    const { result } = renderHook(() => useBeginMfaEnrollment(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(beginMock).toHaveBeenCalledTimes(1));
  });

  // Rule 1: "Set up" is a write — `disabled={begin.isPending}` only lands after
  // React re-renders, so two clicks in one frame used to mint TWO enrollment
  // secrets. The server keeps the last one, the dialog shows whichever resolved
  // first, and the code the user types then never verifies.
  it('mints one enrollment secret when fired twice before the first settles', async () => {
    // Deferred created up front so `release` exists before the mutation runs.
    let release!: (value: unknown) => void;
    const enrollment = { secret: 'S', otpauthUri: 'otpauth://x' };
    const inFlight = new Promise((resolve) => {
      release = resolve;
    });
    beginMock.mockImplementationOnce(() => inFlight);
    const { result } = renderHook(() => useBeginMfaEnrollment(), { wrapper });

    const first = result.current.mutateAsync();
    const second = result.current.mutateAsync();
    await waitFor(() => expect(beginMock).toHaveBeenCalledTimes(1));
    release(enrollment);
    const [a, b] = await Promise.all([first, second]);

    expect(beginMock).toHaveBeenCalledTimes(1);
    // The duplicate joins the in-flight request, so the caller still gets a
    // result — and it is the SAME enrollment, not a second one.
    expect(a).toEqual(b);
  });

  it('confirms enrollment with the code', async () => {
    const { result } = renderHook(() => useConfirmMfaEnrollment(), { wrapper });
    result.current.mutate('123456');
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('123456'));
  });

  it('disables MFA', async () => {
    const { result } = renderHook(() => useDisableMfa(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(disableMock).toHaveBeenCalledTimes(1));
  });
});
