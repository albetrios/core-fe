import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismissAppSplash,
  holdAppSplash,
  isAppSplashActive,
  onAppSplashDismissed,
} from './app-splash.ts';

describe('app-splash', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    const splash = document.createElement('div');
    splash.id = 'app-splash';
    splash.textContent = 'Loading';
    document.body.append(splash, document.createElement('div'));
    document.body.lastElementChild!.id = 'root';
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('isAppSplashActive reflects the boot overlay', () => {
    expect(isAppSplashActive()).toBe(true);
    document.getElementById('app-splash')?.remove();
    expect(isAppSplashActive()).toBe(false);
  });

  it('dismissAppSplash adds exit class and removes the node', () => {
    vi.useFakeTimers();
    dismissAppSplash();
    // The fade waits out the grace window first, so a loader mounting a beat
    // after first paint gets its chance to hold instead of being blinked at.
    vi.advanceTimersByTime(250);
    expect(
      document.getElementById('app-splash')?.classList.contains('app-splash-exiting'),
    ).toBe(true);
    vi.advanceTimersByTime(480);
    expect(document.getElementById('app-splash')).toBeNull();
  });

  it('onAppSplashDismissed fires immediately when splash is already gone', () => {
    document.getElementById('app-splash')?.remove();
    const spy = vi.fn();
    onAppSplashDismissed(spy);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('onAppSplashDismissed fires after dismissAppSplash', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    onAppSplashDismissed(spy);
    dismissAppSplash();
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(480);
    expect(spy).toHaveBeenCalledOnce();
  });

  describe('holds', () => {
    it.each([70, 300])(
      'still times out when a hold arrives %ims after dismissal',
      (delay) => {
        vi.useFakeTimers();
        dismissAppSplash();
        vi.advanceTimersByTime(delay);
        holdAppSplash();

        vi.advanceTimersByTime(8000 + 480 - delay);

        expect(document.getElementById('app-splash')).toBeNull();
      },
    );

    it('cannot cancel the forced exit with another hold after the deadline', () => {
      vi.useFakeTimers();
      holdAppSplash();
      dismissAppSplash();
      vi.advanceTimersByTime(8000);
      holdAppSplash();
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).toBeNull();
    });

    // The boot splash and FullPageSpinner are the same visual. Before holds, the
    // splash eased out at React's first paint and the React loader popped back in
    // a frame later — one bootstrap that read as the screen blinking twice.
    it('keeps the splash up while a hold is outstanding', () => {
      vi.useFakeTimers();
      holdAppSplash();

      dismissAppSplash();
      vi.advanceTimersByTime(480);

      const splash = document.getElementById('app-splash');
      expect(splash).not.toBeNull();
      expect(splash?.classList.contains('app-splash-exiting')).toBe(false);
    });

    it('exits once the last hold releases', () => {
      vi.useFakeTimers();
      const releaseA = holdAppSplash();
      const releaseB = holdAppSplash();
      dismissAppSplash();

      releaseA();
      vi.advanceTimersByTime(480);
      expect(document.getElementById('app-splash')).not.toBeNull();

      releaseB();
      vi.advanceTimersByTime(250); // release re-checks after the grace window
      vi.advanceTimersByTime(480);
      expect(document.getElementById('app-splash')).toBeNull();
    });

    it('releasing twice does not double-count', () => {
      vi.useFakeTimers();
      const release = holdAppSplash();
      holdAppSplash();
      dismissAppSplash();

      release();
      release();
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).not.toBeNull();
    });

    it('a hold taken mid-exit puts the fade back', () => {
      vi.useFakeTimers();
      dismissAppSplash();
      vi.advanceTimersByTime(250);
      const splash = document.getElementById('app-splash');
      expect(splash?.classList.contains('app-splash-exiting')).toBe(true);

      holdAppSplash();
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).not.toBeNull();
      expect(splash?.classList.contains('app-splash-exiting')).toBe(false);
    });

    // The OAuth callback handoff drops to zero holds for ~70ms between the
    // outgoing loader unmounting and the next one mounting. Exiting on that gap
    // dimmed the splash and snapped it back to full opacity — the blink again.
    it('does not even start fading when the next hold lands inside the grace window', () => {
      vi.useFakeTimers();
      const release = holdAppSplash();
      dismissAppSplash();

      release();
      vi.advanceTimersByTime(70); // route handoff gap
      holdAppSplash();
      vi.advanceTimersByTime(480);

      const splash = document.getElementById('app-splash');
      expect(splash).not.toBeNull();
      expect(splash?.classList.contains('app-splash-exiting')).toBe(false);
    });

    it('gives up after MAX_HOLD_MS so a stuck bootstrap cannot trap the user', () => {
      vi.useFakeTimers();
      holdAppSplash();
      dismissAppSplash();

      vi.advanceTimersByTime(8000);
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).toBeNull();
    });

    it('never resurrects a splash that is already gone', () => {
      vi.useFakeTimers();
      document.getElementById('app-splash')?.remove();

      const release = holdAppSplash();
      release();

      expect(document.getElementById('app-splash')).toBeNull();
    });

    it('does not hold a splash that no loader asked for', () => {
      vi.useFakeTimers();
      dismissAppSplash();
      vi.advanceTimersByTime(250);
      vi.advanceTimersByTime(480);
      expect(document.getElementById('app-splash')).toBeNull();
    });
  });
});
