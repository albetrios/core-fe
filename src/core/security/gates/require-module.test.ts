import { beforeEach, describe, expect, it, vi } from 'vitest';

const disabledRef = vi.hoisted(() => ({ value: new Set<string>() }));
vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    get disabledModules() {
      return disabledRef.value;
    },
  },
}));

import { isModuleEnabled, requireFeature, requireModuleGate } from './require-module.ts';

beforeEach(() => {
  disabledRef.value = new Set<string>();
});

describe('requireModuleGate (L6b)', () => {
  const ctx = {
    location: { pathname: '/', search: '', hash: '', href: '/' },
    params: {},
  };

  it('passes when the module is enabled (not in the disabled set)', () => {
    expect(requireModuleGate('billing')(ctx)).toBeUndefined();
    expect(isModuleEnabled('billing')).toBe(true);
  });

  it('throws notFound when the module is disabled', () => {
    disabledRef.value = new Set(['billing']);
    expect(() => requireModuleGate('billing')(ctx)).toThrow();
    expect(isModuleEnabled('billing')).toBe(false);
    expect(isModuleEnabled('members')).toBe(true);
  });

  it('requireFeature delegates synchronously to requireModuleGate', () => {
    expect(requireFeature('billing')).toBeUndefined();
    disabledRef.value = new Set(['billing']);
    expect(() => requireFeature('billing')).toThrow();
  });
});
