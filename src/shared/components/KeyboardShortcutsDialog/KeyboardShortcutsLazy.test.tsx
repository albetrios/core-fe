import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { KeyboardShortcutsLazy } from './KeyboardShortcutsLazy.tsx';

describe('KeyboardShortcutsLazy', () => {
  beforeEach(() => useUIStore.setState({ shortcutsOpen: false }));
  afterEach(() => act(() => useUIStore.setState({ shortcutsOpen: false })));

  it('renders nothing while closed', () => {
    const { container } = render(<KeyboardShortcutsLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the complete reference synchronously on the first keypress and closes on Escape', () => {
    render(<KeyboardShortcutsLazy />);
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByTestId('keyboard-shortcuts-dialog')).toBeInTheDocument();
    expect(screen.getByText('Open command palette')).toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens immediately on Cmd+/ and Ctrl+/', () => {
    render(<KeyboardShortcutsLazy />);
    fireEvent.keyDown(document, { key: '/', metaKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => useUIStore.setState({ shortcutsOpen: false }));
    fireEvent.keyDown(document, { key: '/', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ignores shortcuts typed into editable controls', () => {
    render(
      <>
        <KeyboardShortcutsLazy />
        <input aria-label="Search" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '?' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '/', ctrlKey: true });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });

  it('ignores modified question marks', () => {
    render(<KeyboardShortcutsLazy />);
    fireEvent.keyDown(document, { key: '?', metaKey: true });
    fireEvent.keyDown(document, { key: '?', altKey: true });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });

  it('removes listeners when unmounted', () => {
    const { unmount } = render(<KeyboardShortcutsLazy />);
    unmount();
    fireEvent.keyDown(document, { key: '?' });
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });
});
