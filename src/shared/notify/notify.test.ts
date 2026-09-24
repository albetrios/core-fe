import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runtimeMock } = vi.hoisted(() => ({
  runtimeMock: { show: vi.fn(), promise: vi.fn(), dismiss: vi.fn(), renderer: vi.fn() },
}));
vi.mock('./notify-runtime.tsx', () => runtimeMock);

import { notificationBridge, notify, resetNotifyForTests } from './notify.ts';

let release: (() => void) | undefined;
async function activate() {
  await vi.waitFor(() => expect(notificationBridge.getSnapshot().runtime).toBeDefined());
  release = notificationBridge.activate();
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  notify.dismiss();
  release?.();
  release = undefined;
  vi.useRealTimers();
});

describe('resetNotifyForTests', () => {
  // The shared test setup runs this after every test. Without it, a queued
  // toast's timer outlived its test file and fired into a torn-down jsdom.
  it('drops queued toasts and the auto-dismiss timers they hold', () => {
    vi.useFakeTimers();
    notify.info('Still queued', { duration: 4000 });
    expect(vi.getTimerCount()).toBe(1);
    expect(notificationBridge.getSnapshot().pending).toHaveLength(1);

    resetNotifyForTests();

    expect(vi.getTimerCount()).toBe(0);
    expect(notificationBridge.getSnapshot().pending).toEqual([]);
  });
});

describe('notify', () => {
  it('retains each level and stable IDs while its renderer is not ready', async () => {
    const ids = [
      notify.success('ok'),
      notify.error('bad'),
      notify.info('fyi'),
      notify.warning('careful'),
      notify.loading('wait'),
    ];
    expect(new Set(ids).size).toBe(5);
    expect(runtimeMock.show).not.toHaveBeenCalled();
    expect(notificationBridge.getSnapshot().pending.map((item) => item.id)).toEqual(ids);
    await activate();
    expect(runtimeMock.show.mock.calls.map(([type]) => type)).toEqual([
      'success',
      'error',
      'info',
      'warning',
      'loading',
    ]);
    expect(runtimeMock.show.mock.calls[4]?.[2]).toMatchObject({ duration: Infinity });
    expect(notificationBridge.getSnapshot().pending).toEqual([]);
  });

  it('preserves options and replaces a queued toast with the same ID', async () => {
    vi.useFakeTimers();
    notify.loading('Saving', { id: 'save' });
    notify.success('Saved', { id: 'save', description: 'All set', duration: 1000 });
    const deadline = Date.now() + 1000;
    expect(notificationBridge.getSnapshot().pending).toHaveLength(1);
    await activate();
    expect(runtimeMock.show).toHaveBeenCalledExactlyOnceWith('success', 'Saved', {
      id: 'save',
      description: 'All set',
      duration: deadline - Date.now(),
    });
  });

  it('dismisses queued messages before the host mounts without resurrecting them', async () => {
    const id = notify.info('Dismiss me');
    notify.dismiss(id);
    await activate();
    expect(runtimeMock.show).not.toHaveBeenCalled();
    expect(runtimeMock.dismiss).toHaveBeenCalledWith(id);
  });

  it('publishes directly once the renderer is subscribed', async () => {
    notify.info('First');
    await activate();
    runtimeMock.show.mockClear();
    const id = notify.error('Next');
    expect(runtimeMock.show).toHaveBeenCalledExactlyOnceWith('error', 'Next', { id });
    notify.dismiss(id);
    expect(runtimeMock.dismiss).toHaveBeenCalledWith(id);
  });

  it('keeps settled promise feedback without restarting its lifetime at handoff', async () => {
    const value = Promise.resolve(1);
    const messages = { loading: 'loading', success: 'success', error: 'error' };
    const handle = notify.promise(value, messages);
    expect(notificationBridge.getSnapshot().pending[0]?.message).toBe('loading');
    await expect(handle.unwrap()).resolves.toBe(1);
    expect(notificationBridge.getSnapshot().pending[0]?.message).toBe('success');
    await activate();
    expect(runtimeMock.show).toHaveBeenCalledExactlyOnceWith(
      'success',
      'success',
      expect.objectContaining({ id: handle.valueOf() }),
    );
    expect(runtimeMock.promise).not.toHaveBeenCalled();
  });

  it('retains rejection feedback and unwrap rejects without an unhandled transport promise', async () => {
    const error = new Error('Failed');
    const value = Promise.reject(error);
    const handle = notify.promise(value, {
      loading: 'Saving',
      success: 'Saved',
      error: 'Failed',
    });
    await expect(handle.unwrap()).rejects.toBe(error);
    expect(notificationBridge.getSnapshot().pending[0]).toMatchObject({
      type: 'error',
      message: 'Failed',
    });
    notify.dismiss(handle.valueOf());
    await activate();
    expect(runtimeMock.promise).not.toHaveBeenCalled();
  });

  it('expires finite messages even if the renderer never becomes active', () => {
    vi.useFakeTimers();
    notify.info('Default lifetime');
    notify.info('Short lifetime', { duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(notificationBridge.getSnapshot().pending.map((item) => item.message)).toEqual([
      'Default lifetime',
    ]);
    vi.advanceTimersByTime(3000);
    expect(notificationBridge.getSnapshot().pending).toEqual([]);
  });

  it('transfers only the remaining duration and does not expire replacements early', async () => {
    vi.useFakeTimers();
    notify.info('Old', { id: 'replace', duration: 1000 });
    vi.advanceTimersByTime(500);
    notify.info('New', { id: 'replace', duration: 2000 });
    const deadline = Date.now() + 2000;
    vi.advanceTimersByTime(1000);
    expect(notificationBridge.getSnapshot().pending[0]?.message).toBe('New');
    await activate();
    expect(runtimeMock.show).toHaveBeenCalledWith('info', 'New', {
      id: 'replace',
      duration: deadline - Date.now(),
    });
    runtimeMock.dismiss.mockClear();
    vi.advanceTimersByTime(5000);
    expect(runtimeMock.dismiss).not.toHaveBeenCalled();
  });

  it('keeps pending promises persistent and expires settled feedback', async () => {
    vi.useFakeTimers();
    let resolve!: (value: number) => void;
    const value = new Promise<number>((done) => {
      resolve = done;
    });
    notify.promise(value, { loading: 'Saving', success: 'Saved', error: 'Failed' });
    vi.advanceTimersByTime(10000);
    expect(notificationBridge.getSnapshot().pending[0]?.type).toBe('loading');
    resolve(1);
    await value;
    expect(notificationBridge.getSnapshot().pending[0]?.message).toBe('Saved');
    vi.advanceTimersByTime(4000);
    expect(notificationBridge.getSnapshot().pending).toEqual([]);
  });
});
