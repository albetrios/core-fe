import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { KeyboardShortcutsLazy } from './KeyboardShortcutsLazy.tsx';

// Stub the lazy target: these tests cover the shell's own behavior (global
// shortcut listeners + editable-target guard + open gate), not the dialog UI.
vi.mock('./KeyboardShortcutsDialog.tsx', () => ({
  KeyboardShortcutsDialog: () => <div data-testid="shortcuts-stub" />,
}));

describe('KeyboardShortcutsLazy', () => {
  beforeEach(() => {
    useUIStore.setState({ shortcutsOpen: false });
  });

  it('renders nothing while the dialog is closed', () => {
    const { container } = render(<KeyboardShortcutsLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on a plain "?" and renders the lazy dialog', async () => {
    render(<KeyboardShortcutsLazy />);

    fireEvent.keyDown(document, { key: '?' });
    expect(useUIStore.getState().shortcutsOpen).toBe(true);
    expect(await screen.findByTestId('shortcuts-stub')).toBeInTheDocument();
  });

  it('opens on Cmd//Ctrl+/', () => {
    render(<KeyboardShortcutsLazy />);

    fireEvent.keyDown(document, { key: '/', metaKey: true });
    expect(useUIStore.getState().shortcutsOpen).toBe(true);

    useUIStore.setState({ shortcutsOpen: false });
    fireEvent.keyDown(document, { key: '/', ctrlKey: true });
    expect(useUIStore.getState().shortcutsOpen).toBe(true);
  });

  it('ignores "?" typed into an editable target', () => {
    render(
      <div>
        <KeyboardShortcutsLazy />
        <input data-testid="field" />
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('field'), { key: '?' });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });

  it('ignores "?" when a modifier is held', () => {
    render(<KeyboardShortcutsLazy />);

    fireEvent.keyDown(document, { key: '?', metaKey: true });
    fireEvent.keyDown(document, { key: '?', altKey: true });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });

  it('removes the keyboard listener on unmount', () => {
    const { unmount } = render(<KeyboardShortcutsLazy />);
    unmount();

    fireEvent.keyDown(document, { key: '?' });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });
});
