import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkPasswordBreached } from '@/lib/password-breach.ts';

import { PasswordStrengthMeter } from './PasswordStrengthMeter.tsx';

vi.mock('@/lib/password-breach.ts', () => ({
  checkPasswordBreached: vi.fn(),
}));

const breachMock = vi.mocked(checkPasswordBreached);

describe('PasswordStrengthMeter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    breachMock.mockResolvedValue({ breached: false, count: 0 });
  });

  it('renders nothing for an empty password', () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a weak label for a poor password and strong for a robust one', () => {
    const { rerender } = render(<PasswordStrengthMeter password="abc" />);
    expect(screen.getByTestId('password-strength')).toHaveTextContent(/very weak|weak/i);

    rerender(<PasswordStrengthMeter password="Tr0ub4dour&3xplore!" />);
    expect(screen.getByTestId('password-strength')).toHaveTextContent(/strong/i);
  });

  it('debounces, surfaces a breach warning, and notifies the parent', async () => {
    breachMock.mockResolvedValue({ breached: true, count: 99 });
    const onBreachedChange = vi.fn();

    render(
      <PasswordStrengthMeter password="password" onBreachedChange={onBreachedChange} />,
    );

    // Not called synchronously — only after the debounce window.
    expect(breachMock).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('password-breach-warning')).toBeInTheDocument(),
    );
    expect(breachMock).toHaveBeenCalledWith('password');
    expect(onBreachedChange).toHaveBeenLastCalledWith(true);
  });

  it('reports not-breached (fail-open) when the check returns null', async () => {
    breachMock.mockResolvedValue(null);
    const onBreachedChange = vi.fn();

    render(
      <PasswordStrengthMeter
        password="whatever123"
        onBreachedChange={onBreachedChange}
      />,
    );

    await waitFor(() => expect(onBreachedChange).toHaveBeenLastCalledWith(false));
    expect(screen.queryByTestId('password-breach-warning')).not.toBeInTheDocument();
  });
});
