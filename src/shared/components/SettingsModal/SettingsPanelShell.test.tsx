import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHeader } from './SettingsPanelShell.tsx';

describe('SectionHeader', () => {
  it('renders title, description, and meta', () => {
    render(<SectionHeader title="Profile" description="Your details" meta="80%" />);
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Your details')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  // The breadcrumb is gone. It repeated what the nav rail (and, on a phone, the
  // section picker) already said, and only 3 of the ~10 panels ever passed one —
  // so it was inconsistent as well as redundant. The title is the panel's heading
  // at every width and is not conditional.
  it('renders the title with no scope line above it', () => {
    render(<SectionHeader title="Profile" />);
    expect(screen.getByRole('heading', { name: 'Profile' })).not.toHaveClass('hidden');
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
