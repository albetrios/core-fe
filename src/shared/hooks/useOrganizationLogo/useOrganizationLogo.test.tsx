import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
  useRemoveOrganizationLogo,
  useUploadOrganizationLogo,
} from './useOrganizationLogo.ts';

const { uploadOrganizationLogo, removeOrganizationLogo } = vi.hoisted(() => ({
  uploadOrganizationLogo: vi.fn(),
  removeOrganizationLogo: vi.fn(),
}));
vi.mock('@/shared/api/organization-logo-api.ts', () => ({
  uploadOrganizationLogo,
  removeOrganizationLogo,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const logo = () => new File(['bytes'], 'logo.png', { type: 'image/png' });

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useOrganizationStore.getState().clearOrganization();
});

describe('useUploadOrganizationLogo', () => {
  it('uploads against the active organization', async () => {
    useOrganizationStore.setState({ organizationId: 'org_acme' });
    uploadOrganizationLogo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUploadOrganizationLogo(), { wrapper });
    const file = logo();
    result.current.mutate(file);

    await waitFor(() =>
      expect(uploadOrganizationLogo).toHaveBeenCalledWith({
        file,
        organizationId: 'org_acme',
      }),
    );
  });

  // Mid org-switch the id is briefly null. Uploading then would attach the file to whatever
  // the token happens to scope to, so refuse rather than guess.
  it('refuses to upload without an active organization', async () => {
    const { result } = renderHook(() => useUploadOrganizationLogo(), { wrapper });
    result.current.mutate(logo());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(uploadOrganizationLogo).not.toHaveBeenCalled();
  });

  it('surfaces a failed upload rather than reporting success', async () => {
    useOrganizationStore.setState({ organizationId: 'org_acme' });
    uploadOrganizationLogo.mockRejectedValue(new Error('storage refused'));

    const { result } = renderHook(() => useUploadOrganizationLogo(), { wrapper });
    result.current.mutate(logo());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRemoveOrganizationLogo', () => {
  it('calls the delete route', async () => {
    removeOrganizationLogo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveOrganizationLogo(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(removeOrganizationLogo).toHaveBeenCalled());
  });
});
