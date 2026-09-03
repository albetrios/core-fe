import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppToaster } from './AppToaster.tsx';
import { notify } from './notify.ts';

/**
 * SET-2: the notification preferences grid saves on every flick, so four flicks
 * fire four success toasts. Sonner stacks them unless they share an id — these
 * tests pin the mechanism the fix relies on, against real sonner and a real DOM.
 */
describe('toast de-duplication', () => {
  afterEach(() => {
    act(() => {
      notify.dismiss();
    });
  });

  it('stacks one toast per call when no id is given', async () => {
    render(<AppToaster />);

    act(() => {
      notify.success('Saved');
      notify.success('Saved');
      notify.success('Saved');
      notify.success('Saved');
    });

    await waitFor(() => expect(screen.getAllByTestId('app-toast')).toHaveLength(4), {
      timeout: 5000,
    });
  });

  it('replaces rather than stacks when the calls share an id', async () => {
    render(<AppToaster />);

    act(() => {
      notify.success('Saved', { id: 'prefs' });
      notify.success('Saved', { id: 'prefs' });
      notify.success('Saved', { id: 'prefs' });
      notify.success('Saved', { id: 'prefs' });
    });

    await waitFor(() => expect(screen.getAllByTestId('app-toast')).toHaveLength(1), {
      timeout: 5000,
    });
  });

  it('lets a later error replace the success toast on the same id', async () => {
    render(<AppToaster />);

    act(() => {
      notify.success('Saved', { id: 'prefs' });
    });
    await waitFor(() => expect(screen.getByTestId('app-toast')).toBeInTheDocument(), {
      timeout: 5000,
    });

    act(() => {
      notify.error('Could not save preferences.', { id: 'prefs' });
    });

    // One toast, showing the latest outcome — not a success sitting under an error.
    await waitFor(() => {
      expect(screen.getAllByTestId('app-toast')).toHaveLength(1);
      expect(screen.getByText('Could not save preferences.')).toBeInTheDocument();
    });
  });
});
