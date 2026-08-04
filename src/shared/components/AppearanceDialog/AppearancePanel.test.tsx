import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { generateTheme } from '@/shared/theme/index.ts';

import { AppearancePanel } from './AppearancePanel.tsx';

describe('AppearancePanel', () => {
  beforeEach(() => {
    useThemeStore.setState({
      theme: 'system',
      preset: 'default',
      customTheme: null,
      baseId: 'neutral',
      menu: 'default',
      iconWeight: 'regular',
      iconColor: 'default',
      iconLibrary: 'lucide',
      layoutWidth: 'contained',
    });
    const root = document.documentElement;
    delete root.dataset.theme;
    delete root.dataset.base;
    delete root.dataset.menu;
    delete root.dataset.iconColor;
  });

  it('renders every appearance section in a single scroll (no tabs)', () => {
    render(<AppearancePanel />);
    expect(screen.getByTestId('appearance-panel')).toBeInTheDocument();
    // No tab strip anymore — all sections are stacked.
    expect(screen.queryByTestId('appearance-tab-theme')).not.toBeInTheDocument();
    expect(screen.queryByTestId('appearance-tab-language')).not.toBeInTheDocument();
    // Mode + colour
    expect(screen.getByTestId('named-preset-violet')).toBeInTheDocument();
    expect(screen.getByTestId('theme-dark')).toBeInTheDocument();
    expect(screen.getByTestId('accent-violet')).toBeInTheDocument();
    expect(screen.getByTestId('shuffle-colour')).toBeInTheDocument();
    // Type + icons
    expect(screen.getByTestId('font-body')).toBeInTheDocument();
    expect(screen.getByTestId('icon-bold')).toBeInTheDocument();
    expect(screen.getByTestId('iconcolor-primary')).toBeInTheDocument();
    expect(screen.getByTestId('icon-preview-star')).toBeInTheDocument();
    // Surface + notifications
    expect(screen.getByTestId('layout-width-card')).toBeInTheDocument();
    expect(screen.getByTestId('layout-width-contained')).toBeInTheDocument();
    expect(screen.getByTestId('shuffle-surface')).toBeInTheDocument();
    expect(screen.getByTestId('toast-variant-swatches')).toBeInTheDocument();
  }, 15_000);

  it('renders language, text direction, and date & time controls', () => {
    render(<AppearancePanel />);
    expect(screen.getByTestId('language-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('language-en')).toBeInTheDocument();
    expect(screen.getByTestId('text-direction-auto')).toBeInTheDocument();
    expect(screen.getByTestId('text-direction-rtl')).toBeInTheDocument();
    expect(screen.getByTestId('date-time-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('format-locale-select')).toBeInTheDocument();
    expect(screen.getByTestId('time-zone-select')).toBeInTheDocument();
  });

  it('notification shuffle rolls the toast variant', async () => {
    const user = userEvent.setup();
    render(<AppearancePanel />);
    const before = useThemeStore.getState().toastVariant;
    await user.click(screen.getByTestId('shuffle-notifications'));
    expect(useThemeStore.getState().toastVariant).not.toBe(before);
  });

  it('picking a named preset applies data-theme and clears custom look', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ preset: 'custom', customTheme: generateTheme() });
    render(<AppearancePanel />);
    await user.click(screen.getByTestId('named-preset-violet'));
    expect(useThemeStore.getState().preset).toBe('violet');
    expect(useThemeStore.getState().customTheme).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('violet');
  });

  it('picking an accent colour switches to the custom look', async () => {
    const user = userEvent.setup();
    render(<AppearancePanel />);
    await user.click(screen.getByTestId('accent-violet'));
    expect(useThemeStore.getState().preset).toBe('custom');
    expect(useThemeStore.getState().customTheme?.hue).toBe(290);
    expect(await screen.findByTestId('preset-custom')).toBeInTheDocument();
  });

  it('picking an icon colour applies it (orthogonal)', async () => {
    const user = userEvent.setup();
    render(<AppearancePanel />);
    await user.click(screen.getByTestId('iconcolor-muted'));
    expect(useThemeStore.getState().iconColor).toBe('muted');
    expect(document.documentElement.dataset.iconColor).toBe('muted');
  });

  it('picking content width updates the theme store', async () => {
    const user = userEvent.setup();
    render(<AppearancePanel />);
    await user.click(screen.getByTestId('layout-width-reading'));
    expect(useThemeStore.getState().layoutWidth).toBe('reading');
  });

  it('colour shuffle re-rolls into a custom look', async () => {
    const user = userEvent.setup();
    render(<AppearancePanel />);
    await user.click(screen.getByTestId('shuffle-colour'));
    expect(useThemeStore.getState().preset).toBe('custom');
    expect(useThemeStore.getState().customTheme).not.toBeNull();
  });
});
