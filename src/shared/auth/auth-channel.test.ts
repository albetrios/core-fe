import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * jsdom ships no BroadcastChannel, so we install a minimal in-memory stand-in
 * that delivers each message to all OTHER channels of the same name — exactly
 * the cross-tab semantics we rely on (a tab never receives its own post).
 */
class FakeBroadcastChannel {
  static readonly instances: FakeBroadcastChannel[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();
  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.instances) {
      if (channel === this || channel.name !== this.name) continue;
      for (const listener of channel.listeners) {
        listener(new MessageEvent('message', { data }));
      }
    }
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }
}

/** Fresh module each test → each gets its own channel ("this tab"). */
async function loadModule() {
  vi.resetModules();
  return import('./auth-channel.ts');
}

describe('auth-channel (cross-tab logout)', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances.length = 0;
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a tab's logout broadcast reaches another tab", async () => {
    const thisTab = await loadModule();
    const otherTab = new FakeBroadcastChannel(`${PRODUCT_NAMESPACE}-auth`);
    const received = vi.fn();
    otherTab.addEventListener('message', received);

    thisTab.broadcastLogout();

    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0].data).toEqual({ type: 'logout' });
  });

  it('a logout from another tab fires the subscriber', async () => {
    const thisTab = await loadModule();
    const onLogout = vi.fn();
    thisTab.subscribeToAuthBroadcast(onLogout);

    new FakeBroadcastChannel(`${PRODUCT_NAMESPACE}-auth`).postMessage({ type: 'logout' });

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('ignores non-logout messages', async () => {
    const thisTab = await loadModule();
    const onLogout = vi.fn();
    thisTab.subscribeToAuthBroadcast(onLogout);

    new FakeBroadcastChannel(`${PRODUCT_NAMESPACE}-auth`).postMessage({
      type: 'something-else',
    });

    expect(onLogout).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further delivery', async () => {
    const thisTab = await loadModule();
    const onLogout = vi.fn();
    const unsubscribe = thisTab.subscribeToAuthBroadcast(onLogout);
    unsubscribe();

    new FakeBroadcastChannel(`${PRODUCT_NAMESPACE}-auth`).postMessage({ type: 'logout' });

    expect(onLogout).not.toHaveBeenCalled();
  });

  it('is a safe no-op when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const thisTab = await loadModule();
    expect(() => thisTab.broadcastLogout()).not.toThrow();
    const unsubscribe = thisTab.subscribeToAuthBroadcast(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
