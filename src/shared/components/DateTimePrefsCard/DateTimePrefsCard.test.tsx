import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateTimePrefsCard } from './DateTimePrefsCard.tsx';

describe('DateTimePrefsCard', () => {
  it('renders regional locale, timezone, and format controls', () => {
    render(<DateTimePrefsCard />);
    expect(screen.getByTestId('date-time-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('format-locale-select')).toBeInTheDocument();
    expect(screen.getByTestId('time-zone-select')).toBeInTheDocument();
    expect(screen.getByTestId('date-format-auto')).toBeInTheDocument();
    expect(screen.getByTestId('hour-cycle-h12')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-timezone')).toBeInTheDocument();
  });
});
