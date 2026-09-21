import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STALE_CHUNK_RELOADED_FOR_KEY } from './version-check.constants.ts';

const reloadOntoLatestBuild = vi.fn();
const isNewBuildAdvertised = vi.fn<() => Promise<boolean>>();
const readInjectedAppBuildId = vi.fn<() => string | undefined>();

vi.mock('./check.ts', () => ({
  reloadOntoLatestBuild: () => reloadOntoLatestBuild(),
  isNewBuildAdvertised: () => isNewBuildAdvertised(),
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

/** Let the probe promise and its `.finally` settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function focusAnInput() {
  document.body.innerHTML = '<input />';
  (document.body.firstElementChild as HTMLInputElement).focus();
}

describe('startStaleChunkRecovery', () => {
  let teardown: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    reloadOntoLatestBuild.mockClear();
    isNewBuildAdvertised.mockResolvedValue(true);
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

  it('reloads when a newer build is advertised', async () => {
    teardown = await start();

    firePreloadError();
    await settle();

    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_CHUNK_RELOADED_FOR_KEY)).toBe('build-1');
  });

  it('stands down when the deploy has not changed (offline, flaky CDN, cosmetic prefetch)', async () => {
    isNewBuildAdvertised.mockResolvedValue(false);
    teardown = await start();

    firePreloadError();
    await settle();

    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
    // The attempt is NOT spent — a later, genuine stale chunk still recovers.
    expect(sessionStorage.getItem(STALE_CHUNK_RELOADED_FOR_KEY)).toBeNull();
  });

  it('never prevents the event, so Vite still throws the real error', async () => {
    teardown = await start();

    expect(firePreloadError()).toBe(false);
    await settle();
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('reloads at most once per build', async () => {
    teardown = await start();

    firePreloadError();
    await settle();
    firePreloadError();
    await settle();

    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('probes once however many chunks fail at the same time', async () => {
    teardown = await start();

    firePreloadError();
    firePreloadError();
    firePreloadError();
    await settle();

    expect(isNewBuildAdvertised).toHaveBeenCalledTimes(1);
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('does not reload while the user is typing', async () => {
    teardown = await start();
    focusAnInput();

    firePreloadError();
    await settle();

    expect(isNewBuildAdvertised).not.toHaveBeenCalled();
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STALE_CHUNK_RELOADED_FOR_KEY)).toBeNull();
  });

  it('does not reload when focus moves into a field while the probe is open', async () => {
    let release!: (value: boolean) => void;
    isNewBuildAdvertised.mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    teardown = await start();

    firePreloadError();
    focusAnInput();
    release(true);
    await settle();

    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
  });

  it('is not installed without an injected build id', async () => {
    readInjectedAppBuildId.mockReturnValue(undefined);

    teardown = await start();

    expect(teardown).toBeUndefined();
    firePreloadError();
    await settle();
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
  });

  it('installs once — a repeat call is a no-op', async () => {
    const { startStaleChunkRecovery } = await import('./stale-chunk-recovery.ts');
    teardown = startStaleChunkRecovery();

    expect(startStaleChunkRecovery()).toBeUndefined();

    firePreloadError();
    await settle();
    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });

  it('stops listening after teardown', async () => {
    const stop = await start();
    stop?.();
    teardown = undefined;

    firePreloadError();
    await settle();

    expect(isNewBuildAdvertised).not.toHaveBeenCalled();
    expect(reloadOntoLatestBuild).not.toHaveBeenCalled();
  });

  it('reloads again once a newer build is advertised', async () => {
    sessionStorage.setItem(STALE_CHUNK_RELOADED_FOR_KEY, 'build-0');
    teardown = await start();

    firePreloadError();
    await settle();

    expect(reloadOntoLatestBuild).toHaveBeenCalledTimes(1);
  });
});
