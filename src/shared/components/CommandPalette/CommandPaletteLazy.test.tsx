import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteLazy } from './CommandPaletteLazy.tsx';

// Stub the lazy target: these tests cover the shell's own behavior (global
// keyboard listener + open gate + Suspense), not the palette UI itself.
vi.mock('./CommandPalette.tsx', () => ({
  CommandPalette: () => <div data-testid="palette-stub" />,
}));

describe('CommandPaletteLazy', () => {
  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: false });
  });

  it('renders nothing while the palette is closed', () => {
    const { container } = render(<CommandPaletteLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the lazy palette once the store opens it', async () => {
    render(<CommandPaletteLazy />);
    useUIStore.setState({ commandPaletteOpen: true });
    expect(await screen.findByTestId('palette-stub')).toBeInTheDocument();
  });

  it('toggles via ⌘K and Ctrl+K, ignoring a plain "k"', async () => {
    render(<CommandPaletteLazy />);

    fireEvent.keyDown(document, { key: 'k' });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    expect(await screen.findByTestId('palette-stub')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    await waitFor(() =>
      expect(screen.queryByTestId('palette-stub')).not.toBeInTheDocument(),
    );
  });

  it('removes the keyboard listener on unmount', () => {
    const { unmount } = render(<CommandPaletteLazy />);
    unmount();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });
});
