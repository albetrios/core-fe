import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: { custom: vi.fn(), promise: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }));

import { dismiss, promise, show } from './notify-runtime.tsx';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('notification renderer', () => {
  it('renders the existing custom surface and preserves its callbacks', () => {
    const action = { label: 'Undo', onClick: vi.fn() };
    const onDismiss = vi.fn();
    show('success', 'Saved', { id: 'save', description: 'All set', action, onDismiss });
    const [render, options] = toastMock.custom.mock.calls[0] as [
      (id: string) => { props: Record<string, unknown> },
      { duration: undefined; onDismiss: () => void },
    ];
    expect(render('save').props).toMatchObject({
      id: 'save',
      type: 'success',
      title: 'Saved',
      description: 'All set',
      action,
      onDismiss,
    });
    expect(options).toHaveProperty('duration', undefined);
    options.onDismiss();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('explicitly clears an earlier persistent loading duration', () => {
    show('loading', 'Saving', { id: 'save', duration: Infinity });
    show('success', 'Saved', { id: 'save' });
    expect(toastMock.custom.mock.calls.at(-1)?.[1]).toMatchObject({
      id: 'save',
      duration: undefined,
      unstyled: true,
    });
  });

  it('delegates promise semantics and dismissal to Sonner', () => {
    const value = Promise.resolve(1);
    const messages = { loading: 'Saving', success: 'Saved', error: 'Failed' };
    promise(value, messages, 'promise-id');
    expect(toastMock.promise).toHaveBeenCalledExactlyOnceWith(value, {
      ...messages,
      id: 'promise-id',
    });
    dismiss('promise-id');
    expect(toastMock.dismiss).toHaveBeenCalledWith('promise-id');
  });
});
