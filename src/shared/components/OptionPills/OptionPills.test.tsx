import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OptionPills } from './OptionPills.tsx';

describe('OptionPills', () => {
  it('wraps content-sized options instead of squeezing labels into one row', () => {
    render(
      <OptionPills
        ariaLabel="Date format"
        value="auto"
        options={['auto', 'iso'] as const}
        labelFor={(id) =>
          id === 'auto' ? 'Locale default (numeric)' : 'ISO-style (YYYY-MM-DD)'
        }
        onPick={vi.fn()}
        testPrefix="format"
      />,
    );
    expect(screen.getByTestId('format-auto')).toHaveClass(
      'flex-none',
      'max-w-full',
      'whitespace-normal',
    );
    expect(screen.getByTestId('format-iso')).not.toHaveClass('flex-1');
  });

  it('marks the active option and fires onPick', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <OptionPills
        ariaLabel="Demo"
        value="a"
        options={['a', 'b'] as const}
        labelFor={(id) => id.toUpperCase()}
        onPick={onPick}
        testPrefix="demo"
      />,
    );
    expect(screen.getByTestId('demo-a')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('demo-b'));
    expect(onPick).toHaveBeenCalledWith('b');
  });
});
