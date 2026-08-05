import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { loadIconSet } from './icon-registry.ts';
import { Boxes } from './index.ts';

afterEach(() => {
  useThemeStore.setState({ iconLibrary: 'lucide' });
  useAuthStore.setState({ isAuthenticated: false, isLoading: false });
});

describe('icon barrel', () => {
  it('renders the Lucide icon by default', () => {
    const { container } = render(<Boxes className="size-4" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('class')).toContain('lucide');
  });

  it('swaps to the selected library once its lazy chunk loads', async () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    const { container } = render(<Boxes className="size-4" />);
    useThemeStore.getState().setIconLibrary('tabler');
    loadIconSet('tabler');
    await waitFor(
      () => {
        expect(container.querySelector('svg')?.getAttribute('class')).toContain(
          'tabler-icon',
        );
      },
      { timeout: 12_000 },
    );
  });
});
