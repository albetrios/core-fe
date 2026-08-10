import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VERSION_CHECK_RELOADED_FOR_KEY } from './version-check.constants.ts';

describe('startVersionCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns undefined when version checking is disabled (VITE_VERSION_CHECK=false)', async () => {
    vi.stubEnv('VITE_VERSION_CHECK', 'false');
    vi.stubEnv('VITE_APP_BUILD_ID', 'abc123');
    const { startVersionCheck } = await import('./check.ts');
    expect(startVersionCheck()).toBeUndefined();
  });

  it('returns undefined when no build ID is set', async () => {
    vi.stubEnv('VITE_VERSION_CHECK', 'true');
    vi.stubEnv('VITE_APP_BUILD_ID', '');
    const { startVersionCheck } = await import('./check.ts');
    expect(startVersionCheck()).toBeUndefined();
  });

  it('returns a cleanup function when properly configured', async () => {
    vi.stubEnv('VITE_VERSION_CHECK', 'true');
    vi.stubEnv('VITE_APP_BUILD_ID', 'abc123');

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ buildId: 'abc123', builtAt: '2025-01-01' }), {
        status: 200,
      }),
    );

    const { startVersionCheck } = await import('./check.ts');
    const cleanup = startVersionCheck();
    expect(typeof cleanup).toBe('function');

    cleanup?.();
  });

  describe('idle-gated reload', () => {
    const realLocation = window.location;
    let reload: ReturnType<typeof vi.fn>;

    function setVisibility(state: 'visible' | 'hidden') {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });
    }

    beforeEach(() => {
      sessionStorage.clear();
      reload = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...realLocation, reload },
      });
      setVisibility('visible');
      vi.stubEnv('VITE_VERSION_CHECK', 'true');
      vi.stubEnv('VITE_APP_BUILD_ID', 'build-OLD');
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: realLocation,
      });
      setVisibility('visible');
      sessionStorage.clear();
    });

    function mockVersionResponse(buildId: string) {
      vi.mocked(globalThis.fetch).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ buildId, builtAt: '2026-01-01' }), {
            status: 200,
          }),
        ),
      );
    }

    it('reloads ONCE once the user is idle and marks the buildId', async () => {
      mockVersionResponse('build-NEW');
      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck();

      await vi.advanceTimersByTimeAsync(2_000); // initial check → reload pending
      expect(reload).not.toHaveBeenCalled(); // still "active" — deferred

      await vi.advanceTimersByTimeAsync(60_000); // cross the idle threshold

      expect(reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(VERSION_CHECK_RELOADED_FOR_KEY)).toBe('build-NEW');
      cleanup?.();
    });

    it('calls onUpdateAvailable once per new buildId with reloadNow', async () => {
      mockVersionResponse('build-NEW');
      const onUpdateAvailable = vi.fn();
      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck({ onUpdateAvailable });

      await vi.advanceTimersByTimeAsync(2_000);

      expect(onUpdateAvailable).toHaveBeenCalledOnce();
      const ctx = onUpdateAvailable.mock.calls[0]?.[0] as {
        buildId: string;
        reloadNow: () => void;
      };
      expect(ctx.buildId).toBe('build-NEW');
      ctx.reloadNow();
      expect(reload).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(onUpdateAvailable).toHaveBeenCalledOnce(); // not duplicated on poll
      cleanup?.();
    });

    it('reloads immediately when the tab is hidden (invisible reload)', async () => {
      mockVersionResponse('build-NEW');
      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck();

      await vi.advanceTimersByTimeAsync(2_000); // detect → pending (visible + active)
      expect(reload).not.toHaveBeenCalled();

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      expect(reload).toHaveBeenCalledTimes(1); // applied at once, no idle wait
      cleanup?.();
    });

    it('defers while a field is focused, then reloads once it is idle', async () => {
      mockVersionResponse('build-NEW');
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck();

      await vi.advanceTimersByTimeAsync(2_000); // detect
      await vi.advanceTimersByTimeAsync(60_000); // idle elapsed, but field is focused
      expect(reload).not.toHaveBeenCalled();

      input.blur(); // user leaves the field
      await vi.advanceTimersByTimeAsync(10_000); // next safety re-check

      expect(reload).toHaveBeenCalledTimes(1);
      input.remove();
      cleanup?.();
    });

    it('does NOT reload again while stuck on the same advertised buildId', async () => {
      sessionStorage.setItem(VERSION_CHECK_RELOADED_FOR_KEY, 'build-NEW');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockVersionResponse('build-NEW');
      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck();

      await vi.advanceTimersByTimeAsync(2_000); // initial check
      await vi.advanceTimersByTimeAsync(60_000); // first poll

      expect(reload).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      cleanup?.();
      warn.mockRestore();
    });

    it('reloads again when an even NEWER buildId ships', async () => {
      sessionStorage.setItem(VERSION_CHECK_RELOADED_FOR_KEY, 'build-NEW');
      mockVersionResponse('build-NEWER');
      const { startVersionCheck } = await import('./check.ts');
      const cleanup = startVersionCheck();

      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(60_000); // idle → apply the deferred reload

      expect(reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(VERSION_CHECK_RELOADED_FOR_KEY)).toBe('build-NEWER');
      cleanup?.();
    });
    it('does not re-notify while snoozed', async () => {
      mockVersionResponse('build-NEW');
      const onUpdateAvailable = vi.fn();
      const { startVersionCheck } = await import('./check.ts');
      const { snoozeVersionUpdate } = await import('./version-update-snooze.ts');
      const cleanup = startVersionCheck({ onUpdateAvailable });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(onUpdateAvailable).toHaveBeenCalledOnce();
      snoozeVersionUpdate('build-NEW');

      await vi.advanceTimersByTimeAsync(60_000);
      expect(onUpdateAvailable).toHaveBeenCalledOnce();
      cleanup?.();
    });

    describe('service-worker handoff', () => {
      type MockWaitingWorker = { postMessage: ReturnType<typeof vi.fn> };

      /** Stateful `installing` worker whose statechange events actually fire. */
      function createInstallingWorker(initialState = 'installing') {
        const stateListeners: Array<() => void> = [];
        const worker = {
          state: initialState,
          postMessage: vi.fn(),
          addEventListener: vi.fn((_type: string, cb: () => void) => {
            stateListeners.push(cb);
          }),
          removeEventListener: vi.fn(),
          setState(next: string) {
            worker.state = next;
            for (const cb of [...stateListeners]) cb();
          },
        };
        return worker;
      }

      function installMockServiceWorker(options: {
        waiting?: MockWaitingWorker | null;
        installing?: ReturnType<typeof createInstallingWorker> | null;
        /** getRegistration behavior: resolves it, resolves undefined, or rejects. */
        lookup?: 'ok' | 'none' | 'reject';
      }) {
        const listeners = new Map<string, Array<() => void>>();
        const registration = {
          waiting: options.waiting ?? null,
          installing: options.installing ?? null,
          update: vi.fn(() => Promise.resolve()),
        };
        const lookup = options.lookup ?? 'ok';
        const container = {
          getRegistration: vi.fn(() => {
            if (lookup === 'reject') return Promise.reject(new Error('sw down'));
            return Promise.resolve(lookup === 'none' ? undefined : registration);
          }),
          addEventListener: vi.fn((type: string, cb: () => void) => {
            const arr = listeners.get(type) ?? [];
            arr.push(cb);
            listeners.set(type, arr);
          }),
          removeEventListener: vi.fn(),
          dispatchControllerChange() {
            for (const cb of listeners.get('controllerchange') ?? []) cb();
          },
        };
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: container,
        });
        return { container, registration };
      }

      afterEach(() => {
        Reflect.deleteProperty(navigator, 'serviceWorker');
      });

      /** Detect at 2s, then force the immediate (hidden-tab) reload path. */
      async function detectAndTriggerReload() {
        const { startVersionCheck } = await import('./check.ts');
        const cleanup = startVersionCheck();
        await vi.advanceTimersByTimeAsync(2_000); // detect → pending
        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0); // flush the async handoff chain
        return cleanup;
      }

      it('messages SKIP_WAITING to the waiting worker and reloads on controllerchange', async () => {
        const waiting = { postMessage: vi.fn() };
        const { container, registration } = installMockServiceWorker({ waiting });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();

        expect(registration.update).toHaveBeenCalled(); // pre-warm at detection
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(reload).not.toHaveBeenCalled(); // waits for the new worker to take control

        container.dispatchControllerChange();
        expect(reload).toHaveBeenCalledTimes(1);

        // A duplicate controllerchange must not double-reload (finish() guard).
        container.dispatchControllerChange();
        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('falls back to a plain reload when no newer worker exists', async () => {
        installMockServiceWorker({ waiting: null });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();

        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('reloads anyway after the deadline if the worker never reaches waiting', async () => {
        const installing = createInstallingWorker();
        installMockServiceWorker({ waiting: null, installing });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();
        expect(reload).not.toHaveBeenCalled(); // still waiting on the install

        await vi.advanceTimersByTimeAsync(10_000); // SW_ACTIVATE_DEADLINE_MS
        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('follows an in-flight install to installed and completes the handoff', async () => {
        const installing = createInstallingWorker();
        const { container } = installMockServiceWorker({ installing });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();
        expect(installing.postMessage).not.toHaveBeenCalled(); // still installing

        installing.setState('installed');
        await vi.advanceTimersByTimeAsync(0);

        expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(reload).not.toHaveBeenCalled();

        container.dispatchControllerChange();
        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('falls back to a plain reload when the install goes redundant', async () => {
        const installing = createInstallingWorker();
        installMockServiceWorker({ installing });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();
        expect(reload).not.toHaveBeenCalled();

        installing.setState('redundant');
        await vi.advanceTimersByTimeAsync(0);

        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('falls back to a plain reload when no registration exists', async () => {
        installMockServiceWorker({ lookup: 'none' });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();

        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });

      it('falls back to a plain reload when the registration lookup throws', async () => {
        installMockServiceWorker({ lookup: 'reject' });
        mockVersionResponse('build-NEW');

        const cleanup = await detectAndTriggerReload();

        expect(reload).toHaveBeenCalledTimes(1);
        cleanup?.();
      });
    });
  });
});
