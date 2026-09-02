import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { AuthAutoGooglePending } from './AuthAutoGooglePending.tsx';

describe('AuthAutoGooglePending', () => {
  it('renders the pending state with a way out', () => {
    render(<AuthAutoGooglePending onSkip={vi.fn()} />);
    expect(screen.getByTestId('auth-auto-google-pending')).toBeInTheDocument();
    expect(screen.getByTestId('auth-skip-auto-google')).toBeEnabled();
  });

  // LOGIN-2: the screen used to be a bare loader — the status copy and the cancel
  // button were both in the DOM, behind the overlay, so the user saw neither.
  it('shows the status copy alongside the loader', () => {
    render(<AuthAutoGooglePending onSkip={vi.fn()} />);
    const panel = screen.getByTestId('auth-auto-google-pending');
    expect(panel).toHaveTextContent(/signing you in with google/i);
    expect(panel).toHaveTextContent(/use email instead/i);
    expect(screen.getByTestId('brand-loader')).toBeInTheDocument();
  });

  // Regression (LOGIN-1 / LOGIN-2): FullPageSpinner is `fixed inset-0` with an
  // opaque background. As a sibling of the copy and the cancel button it painted
  // over both, so the user saw a bare loader and could not escape the auto
  // sign-in. The loader here is the same visual, kept in flow.
  it('does not render the full-page overlay spinner', () => {
    render(<AuthAutoGooglePending onSkip={vi.fn()} />);
    expect(screen.queryByTestId('full-page-spinner')).not.toBeInTheDocument();

    const skip = screen.getByTestId('auth-skip-auto-google');
    for (const node of [skip, skip.parentElement]) {
      if (node) expect(getComputedStyle(node).position).not.toBe('fixed');
    }
  });

  it('calls onSkip when the escape hatch is clicked', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<AuthAutoGooglePending onSkip={onSkip} />);

    await user.click(screen.getByTestId('auth-skip-auto-google'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AuthAutoGooglePending onSkip={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
