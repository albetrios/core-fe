import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteShell } from './CommandPaletteShell.tsx';

describe('CommandPaletteShell', () => {
  afterEach(() => act(() => useUIStore.setState({ commandPaletteOpen: false })));

  it('retains dialog geometry and dismisses even when content has no keyboard handler', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(
      <CommandPaletteShell>
        <span>Content unavailable</span>
      </CommandPaletteShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByText('Content unavailable').parentElement).toHaveAttribute(
      'data-slot',
      'popover-content',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('cycles reverse Tab inside the shell while content changes', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(
      <CommandPaletteShell>
        <input aria-label="Search" />
        <button type="button">Retry</button>
      </CommandPaletteShell>,
    );
    screen.getByRole('textbox').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('recovers forward and reverse Tab from outside the modal', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(
      <>
        <button type="button">Background</button>
        <CommandPaletteShell>
          <input aria-label="Search" />
          <button type="button">Retry</button>
        </CommandPaletteShell>
      </>,
    );
    const background = screen.getByRole('button', { name: 'Background' });
    background.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('textbox')).toHaveFocus();
    background.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
  });
});
