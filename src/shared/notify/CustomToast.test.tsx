import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { dismissMock } = vi.hoisted(() => ({ dismissMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { dismiss: dismissMock } }));

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { CustomToast } from './CustomToast.tsx';

describe('CustomToast', () => {
  it('renders the title + description and resolves a design variant', () => {
    render(<CustomToast id="t1" type="success" title="Saved" description="All good" />);
    const el = screen.getByTestId('app-toast');
    expect(el).toHaveTextContent('Saved');
    expect(el).toHaveTextContent('All good');
    expect(el.getAttribute('data-toast-variant')).toBeTruthy();
  });

  it('reflects the toastVariant from the theme store', () => {
    useThemeStore.getState().setToastVariant(1);
    render(<CustomToast id="t2" type="info" title="Info" />);
    expect(screen.getByTestId('app-toast')).toHaveAttribute(
      'data-toast-variant',
      'solid',
    );
    useThemeStore.getState().setToastVariant(0);
  });

  it('dismisses via the close button', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<CustomToast id="t3" type="error" title="Oops" onDismiss={onDismiss} />);
    await user.click(screen.getByTestId('toast-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
    expect(dismissMock).toHaveBeenCalledWith('t3');
  });

  it('dismisses its OWN id right after running the inline action', async () => {
    // The mechanism behind the deferred-commit bug: whatever the action does,
    // the toast that carried it is torn down immediately afterwards. Anything
    // the action writes back to THIS id therefore disappears with it — which is
    // why `notifyDeferredCommit` gives its "Undone" toast an id of its own.
    const user = userEvent.setup();
    const order: string[] = [];
    dismissMock.mockImplementation((id: string) => order.push(`dismiss:${id}`));
    render(
      <CustomToast
        id="deferred-commit"
        type="success"
        title="Removing Jo…"
        action={{ label: 'Undo', onClick: () => order.push('action') }}
      />,
    );

    await user.click(screen.getByTestId('toast-action'));

    expect(order).toEqual(['action', 'dismiss:deferred-commit']);
    dismissMock.mockReset();
  });

  it('renders a loading toast with a spinner', () => {
    render(<CustomToast id="t4" type="loading" title="Saving…" />);
    const el = screen.getByTestId('app-toast');
    expect(el).toHaveTextContent('Saving…');
    expect(el.querySelector('.animate-spin')).toBeTruthy();
  });
});
