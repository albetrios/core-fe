import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  registerSignedInShellWarmup,
  warmSignedInShell,
} from './signed-in-shell-warmup.ts';

/**
 * The inversion that lets `src/shared` start a fetch only `src/app` can describe.
 * Both halves matter: the call has to reach a registered warm-up, and it has to
 * be harmless when there is none.
 */
describe('signed-in shell warm-up registry', () => {
  afterEach(() => {
    registerSignedInShellWarmup(undefined);
  });

  it('runs the app’s warm-up when one is registered', () => {
    const warmUp = vi.fn();
    registerSignedInShellWarmup(warmUp);

    warmSignedInShell();

    expect(warmUp).toHaveBeenCalledOnce();
  });

  // A panel rendered in isolation has no app around it to register anything, and
  // speculation is never worth throwing over.
  it('is a silent no-op before anything is registered', () => {
    expect(() => warmSignedInShell()).not.toThrow();
  });

  it('stops calling a warm-up that has been detached', () => {
    const warmUp = vi.fn();
    registerSignedInShellWarmup(warmUp);
    registerSignedInShellWarmup(undefined);

    warmSignedInShell();

    expect(warmUp).not.toHaveBeenCalled();
  });

  it('replaces the previous warm-up rather than stacking them', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerSignedInShellWarmup(first);
    registerSignedInShellWarmup(second);

    warmSignedInShell();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
