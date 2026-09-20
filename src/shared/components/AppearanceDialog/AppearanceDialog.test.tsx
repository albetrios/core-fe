import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { AppearanceDialog } from './AppearanceDialog.tsx';

// The panel itself is covered by its own suite; stub it to keep this focused.
vi.mock('./AppearancePanel.tsx', () => ({
  AppearancePanel: () => <div data-testid="appearance-panel" />,
}));

describe('AppearanceDialog', () => {
  afterEach(() => act(() => useUIStore.setState({ appearanceOpen: false })));

  it('renders the appearance panel when the store flag is open', async () => {
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialog />);
    expect(screen.getByTestId('appearance-dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('appearance-panel')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    useUIStore.setState({ appearanceOpen: false });
    render(<AppearanceDialog />);
    expect(screen.queryByTestId('appearance-dialog')).not.toBeInTheDocument();
  });

  it('closes on a pointer-down outside the panel', () => {
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialog />);
    expect(screen.getByTestId('appearance-dialog')).toBeInTheDocument();
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(useUIStore.getState().appearanceOpen).toBe(false);
  });

  it('the global shuffle in the header generates a custom look', () => {
    useThemeStore.setState({ preset: 'default', customTheme: null });
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialog />);
    act(() => {
      screen.getByTestId('theme-shuffle').click();
    });
    expect(useThemeStore.getState().preset).toBe('custom');
  });
});
