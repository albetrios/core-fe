import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCommandPaletteSearch } from './command-palette-context.ts';

describe('useCommandPaletteSearch', () => {
  it('reports an incorrect mount outside the shell', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useCommandPaletteSearch())).toThrow(
        'Command palette search requires its shell',
      );
    } finally {
      error.mockRestore();
    }
  });
});
