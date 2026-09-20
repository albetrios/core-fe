import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismissAppSplash,
  holdAppSplash,
  isAppSplashActive,
  markAppContentPending,
  markAppContentSettled,
  onAppSplashDismissed,
} from './app-splash.ts';

const isFading = () =>
  document.getElementById('app-splash')?.classList.contains('app-splash-exiting') ??
  false;
const isGone = () => document.getElementById('app-splash') === null;

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

  // ── The router has settled: the grace window is no longer a guess worth making ──

  describe('settled content (markAppContentSettled)', () => {
    it('leaves within frames once the router has settled, not after the grace window', () => {
      // Regression: the login form (or the dashboard) sat fully rendered behind
      // an opaque overlay for a fixed 250ms on every cold load — a wait for a
      // "next loader" that, once the router has resolved, is never coming.
      vi.useFakeTimers();
      dismissAppSplash();
      markAppContentSettled();

      vi.advanceTimersByTime(31);
      expect(isFading()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(isFading()).toBe(true);
    });

    it('brings an exit check that is already waiting on the grace window forward', () => {
      vi.useFakeTimers();
      dismissAppSplash();
      vi.advanceTimersByTime(100); // 150ms of grace still to run
      markAppContentSettled();

      vi.advanceTimersByTime(32);
      expect(isFading()).toBe(true);
    });

    it('still waits for a hold — settled is not the same as ready', () => {
      // The org shell mounts a loader while its lazy layout arrives. The router
      // is resolved by then; the screen is not.
      vi.useFakeTimers();
      const release = holdAppSplash();
      dismissAppSplash();
      markAppContentSettled();

      vi.advanceTimersByTime(2000);
      expect(isFading()).toBe(false);

      release();
      vi.advanceTimersByTime(32);
      expect(isFading()).toBe(true);
    });

    it('lets a hold taken in the same commit land first', () => {
      vi.useFakeTimers();
      dismissAppSplash();
      markAppContentSettled();
      // A layout effect in the commit the router just resolved.
      const release = holdAppSplash();

      vi.advanceTimersByTime(500);
      expect(isFading()).toBe(false);
      release();
    });

    it('goes back to the grace window once another navigation starts', () => {
      // The OAuth callback → next screen handoff: the outgoing loader unmounts a
      // few frames before the incoming one mounts. Exiting on that gap is the
      // blink the grace window exists to prevent.
      vi.useFakeTimers();
      const releaseOutgoing = holdAppSplash();
      dismissAppSplash();
      markAppContentSettled();
      markAppContentPending();

      releaseOutgoing();
      vi.advanceTimersByTime(70);
      expect(isFading()).toBe(false);
      const releaseIncoming = holdAppSplash();

      vi.advanceTimersByTime(1000);
      expect(isFading()).toBe(false);
      releaseIncoming();
    });

    it('does nothing before a dismissal was requested', () => {
      // React has not painted yet: settling must not start a fade on its own.
      vi.useFakeTimers();
      markAppContentSettled();

      vi.advanceTimersByTime(1000);
      expect(isFading()).toBe(false);

      // …but the dismissal that follows takes the short path straight away.
      dismissAppSplash();
      vi.advanceTimersByTime(32);
      expect(isFading()).toBe(true);
    });

    it('is a no-op once the splash is gone', () => {
      document.getElementById('app-splash')?.remove();

      expect(() => {
        markAppContentSettled();
        markAppContentPending();
      }).not.toThrow();
      expect(isGone()).toBe(true);
    });

    it('does not leak "settled" into a fresh overlay', () => {
      vi.useFakeTimers();
      markAppContentSettled();
      // The node is removed on exit and remade between tests/boots.
      document.getElementById('app-splash')?.remove();
      const next = document.createElement('div');
      next.id = 'app-splash';
      document.body.prepend(next);

      dismissAppSplash();
      vi.advanceTimersByTime(32);
      expect(isFading()).toBe(false);
      vi.advanceTimersByTime(218);
      expect(isFading()).toBe(true);
    });
  });

  // ── index.html owns the fade; this module owns the fallback that ends it ──

  describe('index.html drift', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const fadeMs = Number(/#app-splash \{[^}]*?opacity (\d+)ms/s.exec(html)?.[1]);

    it('declares a fade short enough to read as a reveal, not a wait', () => {
      expect(fadeMs).toBeGreaterThanOrEqual(120);
      expect(fadeMs).toBeLessThanOrEqual(240);
    });

    it('never cuts that fade short, and never outlives it by much', () => {
      // `transitionend` normally removes the node. The timer is the fallback for
      // a tab that never fires it — too short and it hard-cuts the fade, too long
      // and an inert overlay sits on the page.
      vi.useFakeTimers();
      dismissAppSplash();
      markAppContentSettled();
      vi.advanceTimersByTime(32);
      expect(isFading()).toBe(true);

      vi.advanceTimersByTime(fadeMs);
      expect(isGone()).toBe(false);
      vi.advanceTimersByTime(200);
      expect(isGone()).toBe(true);
    });
  });
});
