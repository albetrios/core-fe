import { describe, expect, it, vi } from 'vitest';

import { loadAppearancePanel } from './appearance-panel-loader.ts';

vi.mock('./AppearancePanel.tsx', () => ({
  AppearancePanel: () => null,
}));

describe('loadAppearancePanel', () => {
  it('defers the panel and shares its settled module for flicker-free reopening', async () => {
    expect(loadAppearancePanel.peek()).toBeUndefined();
    const pending = loadAppearancePanel();
    expect(loadAppearancePanel()).toBe(pending);
    const module = await pending;
    expect(module.default).toBeTypeOf('function');
    expect(loadAppearancePanel.peek()).toBe(module);
  });
});
