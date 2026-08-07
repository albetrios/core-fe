import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Cross-tab auth synchronization over the BroadcastChannel API.
 *
 * The access token lives in each tab's own memory closure, so a logout in one
 * tab leaves sibling tabs holding a still-valid token until their next 401.
 * For a multi-tab admin tool that window is a real session-management gap: an
 * admin-suspend, logout-all, or session expiry should kill every open tab at
 * once. This module broadcasts the logout so it does.
 *
 * Only logout is propagated — never the token itself (tokens never leave their
 * tab's memory). Login is intentionally not synced: a fresh tab gets its own
 * token via the boot silent-refresh, not from a sibling.
 *
 * Degrades silently where BroadcastChannel is unavailable (older browsers,
 * jsdom): every export becomes a no-op, so callers need no feature checks.
 */
const CHANNEL_NAME = `${PRODUCT_NAMESPACE}-auth`;

interface AuthBroadcast {
  readonly type: 'logout';
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Tell other tabs the session ended. No-op when BroadcastChannel is unavailable. */
export function broadcastLogout(): void {
  getChannel()?.postMessage({ type: 'logout' } satisfies AuthBroadcast);
}

/**
 * Subscribe to cross-tab auth events. Returns an unsubscribe function.
 * The handler fires only for `logout` broadcasts from OTHER tabs.
 */
export function subscribeToAuthBroadcast(onLogout: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (event: MessageEvent<AuthBroadcast>) => {
    if (event.data?.type === 'logout') onLogout();
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
