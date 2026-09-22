/**
 * Desktop (OS) notifications via the Web Notification API.
 *
 * Thin, defensive wrapper: every entry point no-ops when the API is unsupported
 * or permission isn't granted, so callers never need to feature-detect. The
 * permission request must be user-initiated (browsers reject it otherwise) — it
 * is wired to the Settings → Notifications toggle (FE-65), never called on load.
 */

export type DesktopPermission = NotificationPermission | 'unsupported';

interface NotificationCtor {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
}

function ctor(): NotificationCtor | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as { Notification?: unknown }).Notification;
  return (candidate as NotificationCtor | undefined) ?? null;
}

/** True if the current environment exposes the Notification API. */
export function isDesktopSupported(): boolean {
  return ctor() !== null;
}

/** Current permission, or `'unsupported'` if the API is unavailable. */
export function getDesktopPermission(): DesktopPermission {
  const N = ctor();
  return N ? N.permission : 'unsupported';
}

/**
 * Request permission (user-initiated). Short-circuits when already
 * granted/denied so we never re-prompt, and resolves `'unsupported'` /
 * `'denied'` instead of throwing.
 */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  const N = ctor();
  if (!N) return 'unsupported';
  if (N.permission === 'granted' || N.permission === 'denied') return N.permission;
  try {
    return await N.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Raise an OS notification for a new item — but only when permission is granted
 * AND the tab is backgrounded (a visible user already sees the in-app bell).
 * Returns whether a notification was shown.
 */
export function showDesktopNotification(
  title: string,
  options?: { body?: string; tag?: string },
): boolean {
  const N = ctor();
  if (N?.permission !== 'granted') return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return false;
  }
  try {
    // The constructor's side effect (showing the OS notification) is the point.
    new N(title, options);
    return true;
  } catch {
    return false;
  }
}
