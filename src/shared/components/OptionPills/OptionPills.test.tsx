import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OptionPills } from './OptionPills.tsx';

describe('OptionPills', () => {
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
