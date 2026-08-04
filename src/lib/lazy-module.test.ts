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

  it('caches a rejected promise rather than silently retrying', async () => {
    const factory = vi.fn(async () => {
      throw new Error('chunk load failed');
    });
    const load = onceAsync(factory);

    await expect(load()).rejects.toThrow('chunk load failed');
    await expect(load()).rejects.toThrow('chunk load failed');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
