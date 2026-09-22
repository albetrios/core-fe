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

  // QA-V3 suggestion 7: below `sm` the section picker sits directly above this
  // header and already names the section, so a phone spent three of its first
  // 120 vertical pixels saying "Profile" three times — picker, breadcrumb,
  // title. The picker is the one that can also CHANGE section, so it stays and
  // the breadcrumb steps aside; from `sm` up there is a nav rail instead and the
  // breadcrumb is the only thing naming the scope, so it comes back.
  it('keeps the breadcrumb off phones, where the picker already names the section', () => {
    render(<SectionHeader breadcrumb="Account · Profile" title="Profile" />);
    const breadcrumb = screen.getByText('Account · Profile');
    expect(breadcrumb).toHaveClass('hidden', 'sm:block');
    // The title is NOT conditional — it is the panel's own heading at every width.
    expect(screen.getByRole('heading', { name: 'Profile' })).not.toHaveClass('hidden');
  });

  it('renders no breadcrumb element at all when none is given', () => {
    render(<SectionHeader title="Profile" />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
