import { describe, expect, it, vi } from 'vitest';

import { onceAsync } from './lazy-module.ts';

describe('onceAsync', () => {
  it('does not call the factory until the loader is invoked', () => {
    const factory = vi.fn(async () => 'module');
    onceAsync(factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it('calls the factory once and reuses the same promise', async () => {
    const factory = vi.fn(async () => 'module');
    const load = onceAsync(factory);

    const first = load();
    const second = load();

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe('module');
    await expect(load()).resolves.toBe('module');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of caching the rejection', async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk load failed'))
      .mockResolvedValueOnce('module');
    const load = onceAsync(factory);

    await expect(load()).rejects.toThrow('chunk load failed');
    // A poisoned cache here would leave the layout unrenderable until reload.
    await expect(load()).resolves.toBe('module');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight promise across concurrent callers', async () => {
    const factory = vi.fn(async () => 'module');
    const load = onceAsync(factory);

    await Promise.all([load(), load(), load()]);

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
