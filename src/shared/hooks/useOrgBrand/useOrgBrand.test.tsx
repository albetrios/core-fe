import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useMeContextMock, applyMock } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  applyMock: vi.fn(),
}));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));
vi.mock('@/shared/theme/org-brand.ts', () => ({ applyOrgBrand: applyMock }));

import { useOrgBrand } from './useOrgBrand.ts';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useOrgBrand', () => {
  it('applies the active org brand colour', () => {
    useMeContextMock.mockReturnValue({
      data: { activeOrganization: { brandColor: 'oklch(0.6 0.2 25)' } },
    });
    renderHook(() => useOrgBrand());
    expect(applyMock).toHaveBeenCalledWith('oklch(0.6 0.2 25)');
  });

  it('applies null when the active org has no brand colour', () => {
    useMeContextMock.mockReturnValue({
      data: { activeOrganization: { brandColor: null } },
    });
    renderHook(() => useOrgBrand());
    expect(applyMock).toHaveBeenCalledWith(null);
  });
});
