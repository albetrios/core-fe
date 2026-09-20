import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toasterMock, toastMock, transport } = vi.hoisted(() => ({
  toasterMock: vi.fn(() => null),
  toastMock: { custom: vi.fn(), promise: vi.fn(), dismiss: vi.fn() },
  transport: { attempts: 0, release: undefined as (() => void) | undefined },
}));
vi.mock('sonner', () => ({ Toaster: toasterMock, toast: toastMock }));
vi.mock('./notify-runtime.tsx', async (importOriginal) => {
  transport.attempts += 1;
  if (transport.attempts === 1) {
    await new Promise<void>((resolve) => {
      transport.release = resolve;
    });
    throw new Error('Renderer unavailable');
  }
  return importOriginal();
});

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { AppToaster } from './AppToaster.tsx';
import { notify } from './notify.ts';

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
});

describe('AppToaster', () => {
  it('shows actionable messages during a delayed or failed load and retries on new work', async () => {
    const user = userEvent.setup();
    useThemeStore.getState().setToastPosition('bottom-center');
    render(<AppToaster />);
    expect(transport.attempts).toBe(0);
    expect(toasterMock).not.toHaveBeenCalled();

    const undo = vi.fn();
    const onDismiss = vi.fn();
    act(() => {
      notify.error('Could not save', {
        id: 'save',
        action: { label: 'Undo', onClick: undo },
        onDismiss,
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    await waitFor(() => expect(transport.release).toBeDefined());
    await act(async () => {
      transport.release?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('Could not save')).toBeVisible();
    await user.click(screen.getByTestId('toast-action'));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Could not save')).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      notify.info('Next message');
    });
    await waitFor(() =>
      expect(toasterMock).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'bottom-center' }),
        undefined,
      ),
    );
    expect(transport.attempts).toBe(2);
    expect(toastMock.custom).toHaveBeenCalledOnce();
    expect(toastMock.custom.mock.calls[0]?.[1]).toHaveProperty('id');
    expect(screen.queryByText('Could not save')).not.toBeInTheDocument();

    act(() => {
      useThemeStore.getState().setToastPosition('top-right');
    });
    expect(toasterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 'top-right', offset: { top: '4.5rem' } }),
      undefined,
    );
  });
});
