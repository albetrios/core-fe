import type { I18nBuildMode } from './build-config.ts';
import { readInjectedI18nMode } from './build-env.ts';

/**
 * Resolve the active i18n build mode at runtime. `BUILD_I18N_MODE` is injected by
 * the Vite plugin (`vite.config.ts` at build, `vitest.config.ts` with `modeFlag:
 * 'multi'` under test so lazy JSON tests work) — no build-mode sniffing here.
 */
function resolveRuntimeI18nBuildMode(): I18nBuildMode {
  return readInjectedI18nMode();
}

export function isMultiLocaleBuild(): boolean {
  return resolveRuntimeI18nBuildMode() === 'multi';
}

export function isSingleLocaleBuild(): boolean {
  return resolveRuntimeI18nBuildMode() === 'single';
}
