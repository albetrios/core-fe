import { notFound } from '@tanstack/react-router';

import { platformConfig } from '@/core/config/env.ts';
import { isPlatformModuleEnabled } from '@/core/config/platform-config.ts';
import type { GateContext } from '@/core/security/gate.types.ts';

const SYNC_MODULE_GATE_CTX = {
  location: { pathname: '/', search: '', hash: '', href: '/' },
  params: {},
} as const;

/** Whether a feature module is enabled for this deployment (for UI gating). */
export function isModuleEnabled(moduleKey: string): boolean {
  return isPlatformModuleEnabled(platformConfig, moduleKey);
}

/**
 * **L6b — module entitlement.** Factory: a deployment can disable feature
 * modules via `VITE_DISABLED_MODULES`. A disabled module's routes resolve to
 * `notFound()` (404 — don't reveal the surface exists, vs `/unauthorized`'s
 * "you can't"), and its nav/settings entries should be hidden via
 * {@link isModuleEnabled}.
 */
export function requireModuleGate(moduleKey: string): (ctx: GateContext) => void {
  return (_ctx) => {
    if (!isModuleEnabled(moduleKey)) throw notFound();
  };
}

/**
 * Synchronous module gate for loaders without full {@link Gate} context.
 * Prefer {@link gatewayFromManifest} when a page manifest declares `module`.
 */
export function requireFeature(moduleKey: string): void {
  requireModuleGate(moduleKey)(SYNC_MODULE_GATE_CTX);
}
