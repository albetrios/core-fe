import { onceAsync } from '@/lib/lazy-module.ts';

import type { ToastType } from './CustomToast.tsx';
import type * as RuntimeModule from './notify-runtime.tsx';

type NotificationRuntime = typeof RuntimeModule;

export interface NotifyAction {
  label: string;
  onClick: () => void;
}

export interface NotifyOptions {
  /** Stable id to de-dupe or replace an existing toast. */
  id?: string | number;
  description?: string;
  /** Omit for the default lifetime; Infinity persists until dismissed. */
  duration?: number;
  action?: NotifyAction;
  onDismiss?: () => void;
}

interface PendingToast {
  id: string | number;
  type: ToastType;
  message: string;
  options: NotifyOptions;
}

interface QueuedToast {
  preview: PendingToast;
  publish: (runtime: NotificationRuntime, remainingDuration?: number) => void;
  expiresAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}

const loadRuntime = onceAsync(() => import('./notify-runtime.tsx'));
const queued = new Map<string | number, QueuedToast>();
const listeners = new Set<() => void>();
let runtime: NotificationRuntime | undefined;
let active = false;
let loading = false;
let sequence = 0;
let snapshot: {
  runtime: NotificationRuntime | undefined;
  pending: PendingToast[];
} = { runtime: undefined, pending: [] };

function emit() {
  snapshot = { runtime, pending: [...queued.values()].map((item) => item.preview) };
  for (const listener of listeners) listener();
}

function prepareRuntime() {
  if (runtime || loading) return;
  loading = true;
  void loadRuntime().then(
    (loaded) => {
      runtime = loaded;
      loading = false;
      emit();
    },
    () => {
      // The immediate host retains the real messages and actions on failure.
      // onceAsync forgets rejected imports, so a later notification can retry.
      loading = false;
    },
  );
}

function enqueue(item: QueuedToast) {
  if (active && runtime) {
    item.publish(runtime);
    return;
  }
  const id = item.preview.id;
  clearTimeout(queued.get(id)?.timer);
  const duration = item.preview.options.duration ?? 4000;
  if (Number.isFinite(duration)) {
    item.expiresAt = Date.now() + duration;
    item.timer = setTimeout(() => dismiss(id), duration);
  }
  queued.set(id, item);
  emit();
  prepareRuntime();
}

function show(type: ToastType, message: string, options: NotifyOptions = {}) {
  const id = options.id ?? `core-toast-${++sequence}`;
  const resolvedOptions = { ...options, id };
  enqueue({
    preview: { id, type, message, options: resolvedOptions },
    publish: (loaded, remainingDuration) =>
      loaded.show(type, message, {
        ...resolvedOptions,
        ...(remainingDuration === undefined ? {} : { duration: remainingDuration }),
      }),
  });
  return id;
}

function dismiss(id?: string | number) {
  if (id === undefined) {
    for (const item of queued.values()) clearTimeout(item.timer);
    queued.clear();
  } else {
    clearTimeout(queued.get(id)?.timer);
    queued.delete(id);
  }
  runtime?.dismiss(id);
  emit();
  return id;
}

function promise<T>(
  value: Promise<T>,
  messages: { loading: string; success: string; error: string },
) {
  const id = `core-toast-${++sequence}`;
  enqueue({
    preview: {
      id,
      type: 'loading',
      message: messages.loading,
      options: { id, duration: Infinity },
    },
    publish: (loaded) => loaded.promise(value, messages, id),
  });
  const settle = (type: 'success' | 'error') => {
    const pending = queued.get(id);
    if (!pending) return;
    show(type, messages[type], { id });
  };
  void value.then(
    () => settle('success'),
    () => settle('error'),
  );
  return Object.assign(id, { unwrap: () => value });
}

/** Stable notification API; renderer loading never blocks IDs or actions. */
export const notify = {
  success: (message: string, opts?: NotifyOptions) => show('success', message, opts),
  error: (message: string, opts?: NotifyOptions) => show('error', message, opts),
  info: (message: string, opts?: NotifyOptions) => show('info', message, opts),
  warning: (message: string, opts?: NotifyOptions) => show('warning', message, opts),
  loading: (message: string, opts?: NotifyOptions) =>
    show('loading', message, { duration: Infinity, ...opts }),
  promise,
  dismiss,
};

/** The host subscribes before draining messages into the optional renderer. */
export const notificationBridge = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  activate() {
    if (!runtime) return () => {};
    active = true;
    for (const item of queued.values()) {
      clearTimeout(item.timer);
      const remaining =
        item.expiresAt === undefined ? undefined : item.expiresAt - Date.now();
      if (remaining === undefined || remaining > 0) item.publish(runtime, remaining);
    }
    queued.clear();
    emit();
    return () => {
      active = false;
    };
  },
};

/**
 * Test-only: drop every queued toast, and the auto-dismiss timer each one holds.
 *
 * @remarks
 * A toast queued before the renderer mounts keeps a real `setTimeout` (see
 * `enqueue`). A test that ends inside that window leaves it running, and it later
 * fires into a torn-down environment: `dismiss()` reaches sonner, sonner calls
 * `requestAnimationFrame`, which is gone, and the uncaught error fails whichever
 * test file is running at the time. How long the gap lasts depends on the machine,
 * so it only surfaced under load. The shared test setup calls this after every
 * test. It deliberately calls neither sonner nor the subscribers: at teardown,
 * nothing should render or schedule work.
 */
export function resetNotifyForTests(): void {
  for (const item of queued.values()) clearTimeout(item.timer);
  queued.clear();
  snapshot = { runtime, pending: [] };
}
