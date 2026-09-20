import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STALE_CHUNK_RELOADED_FOR_KEY } from './version-check.constants.ts';

const reloadOntoLatestBuild = vi.fn();
const readInjectedAppBuildId = vi.fn<() => string | undefined>();

vi.mock('./check.ts', () => ({
  reloadOntoLatestBuild: () => reloadOntoLatestBuild(),
}));

vi.mock('@/lib/i18n/build-env.ts', () => ({
  readInjectedAppBuildId: () => readInjectedAppBuildId(),
}));

async function start() {
  const { startStaleChunkRecovery } = await import('./stale-chunk-recovery.ts');
  return startStaleChunkRecovery();
}

/** Dispatch Vite's preload-failure event; returns whether it was prevented. */
function firePreloadError(): boolean {
  const event = new CustomEvent('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('startStaleChunkRecovery', () => {
  let teardown: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    reloadOntoLatestBuild.mockClear();
    readInjectedAppBuildId.mockReturnValue('build-1');
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    teardown?.();
    teardown = undefined;
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('reloads onto the latest build when a lazy chunk fails', async () => {
    teardown = await start();

    expect(firePreloadError()).toBe(true);
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_CHUNK_RELOADED_FOR_KEY)).toBe('build-1');
  });

  it('reloads at most once per build — a second failure stands down', async () => {
    teardown = await start();

    firePreloadError();
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);

    expect(firePreloadError()).toBe(false); // left for Vite to throw → Sentry
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('does not reload while the user is typing', async () => {
    teardown = await start();

    document.body.innerHTML = '<input />';
    (document.body.firstElementChild as HTMLInputElement).focus();

    expect(firePreloadError()).toBe(false);
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
    // The attempt is NOT spent — the version-check poller still reloads later.
    expect(sessionStorage.getItem(STALE_CHUNK_RELOADED_FOR_KEY)).toBeNull();
  });

  it('is not installed without an injected build id', async () => {
    readInjectedAppBuildId.mockReturnValue(undefined);

    teardown = await start();

    expect(teardown).toBeUndefined();
    expect(firePreloadError()).toBe(false);
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
  });

  it('installs once — a repeat call is a no-op', async () => {
    const { startStaleChunkRecovery } = await import('./stale-chunk-recovery.ts');
    teardown = startStaleChunkRecovery();

    expect(startStaleChunkRecovery()).toBeUndefined();

    firePreloadError();
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('stops listening after teardown', async () => {
    const stop = await start();
    stop?.();
    teardown = undefined;

    expect(firePreloadError()).toBe(false);
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
  });

  it('reloads again once a newer build is advertised', async () => {
    sessionStorage.setItem(STALE_CHUNK_RELOADED_FOR_KEY, 'build-0');
    teardown = await start();

    expect(firePreloadError()).toBe(true);
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });
});
