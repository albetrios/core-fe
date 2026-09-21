import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alreadyReloadedFor, markReloadedFor } from './reload-marker.ts';

const KEY = 'core:test:reloaded-for';
const OTHER_KEY = 'core:test:other-reloaded-for';

describe('reload marker', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('is false before anything is recorded', () => {
    expect(alreadyReloadedFor(KEY, 'build-1')).toBe(false);
  });

  it('remembers the build it reloaded for', () => {
    markReloadedFor(KEY, 'build-1');
    expect(alreadyReloadedFor(KEY, 'build-1')).toBe(true);
  });

  it('stands down only for that build — a newer id may reload again', () => {
    markReloadedFor(KEY, 'build-1');
    expect(alreadyReloadedFor(KEY, 'build-2')).toBe(false);
  });

  it('keeps each key independent so one path never spends the other attempt', () => {
    markReloadedFor(KEY, 'build-1');
    expect(alreadyReloadedFor(OTHER_KEY, 'build-1')).toBe(false);
  });

  it('fails open when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => markReloadedFor(KEY, 'build-1')).not.toThrow();
    expect(alreadyReloadedFor(KEY, 'build-1')).toBe(false);
  });
});
