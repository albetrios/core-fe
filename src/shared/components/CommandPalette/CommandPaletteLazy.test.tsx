import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteLazy } from './CommandPaletteLazy.tsx';

// Stub the lazy target: these tests cover the shell's own behavior (global
// keyboard listener + open gate), not the palette UI itself.
const lazyOverlayRenderMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/components/LazyOverlay/index.ts', () => ({
  LazyOverlay: (props: { testId?: string }) => {
    lazyOverlayRenderMock(props);
    return <div data-testid="palette-stub" />;
  },
  LazyOverlaySkeleton: ({
    children,
    testId,
  }: {
    children: ReactNode;
    testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
}));

vi.mock('./CommandPalette.tsx', () => ({
  CommandPalette: () => <div data-testid="palette-stub" />,
}));

describe('CommandPaletteLazy', () => {
  beforeEach(() => {
    lazyOverlayRenderMock.mockClear();
    useUIStore.setState({ commandPaletteOpen: false });
  });

  afterEach(() => {
    act(() => {
      useUIStore.setState({ commandPaletteOpen: false });
    });
  });

  it('renders nothing while the palette is closed', () => {
    const { container } = render(<CommandPaletteLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the lazy palette once the store opens it', async () => {
    render(<CommandPaletteLazy />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    expect(await screen.findByTestId('palette-stub')).toBeInTheDocument();
    expect(lazyOverlayRenderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        load: expect.any(Function),
        onDismiss: expect.any(Function),
        testId: 'command-palette-error',
      }),
    );
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
