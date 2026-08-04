import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

import { LanguagePrefsCard } from './LanguagePrefsCard.tsx';

describe('LanguagePrefsCard', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en', textDirection: 'auto' });
    document.documentElement.dir = 'ltr';
  });

  it('renders text direction pills', () => {
    render(<LanguagePrefsCard />);
    expect(screen.getByTestId('language-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('text-direction-auto')).toBeInTheDocument();
    expect(screen.getByTestId('text-direction-ltr')).toBeInTheDocument();
    expect(screen.getByTestId('text-direction-rtl')).toBeInTheDocument();
  });

  it('applies RTL to the document when the preference is picked', async () => {
    const user = userEvent.setup();
    render(<LanguagePrefsCard />);
    await user.click(screen.getByTestId('text-direction-rtl'));
    expect(useLocaleStore.getState().textDirection).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('switches UI language from a language tile', async () => {
    const user = userEvent.setup();
    render(<LanguagePrefsCard />);
    await user.click(screen.getByTestId('language-es'));
    await vi.waitFor(() => {
      expect(useLocaleStore.getState().locale).toBe('es');
    });
  });
});
