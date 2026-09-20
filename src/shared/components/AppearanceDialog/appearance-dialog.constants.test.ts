import { describe, expect, it } from 'vitest';

import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';

import {
  APPEARANCE_DIALOG_KEYS,
  APPEARANCE_DIALOG_NS,
} from './appearance-dialog.constants.ts';

describe('appearance dialog header keys', () => {
  // The dialog is mounted on the ROOT route, so it ships in the entry chunk.
  // Reading these three strings off `SETTINGS_KEYS` dragged that module's whole
  // key table (~17 kB of source) onto the first paint of every load — so they
  // are declared locally. This is the other half of that trade: they must stay
  // identical to the originals, or the dialog and the Settings section that
  // share the panel start showing different copy.
  it('match the Settings panel they duplicate', () => {
    expect(APPEARANCE_DIALOG_KEYS).toEqual(SETTINGS_KEYS.panels.appearance);
    expect(APPEARANCE_DIALOG_NS).toBe(SETTINGS_NS);
  });
});

describe('appearance dialog — the entry chunk', () => {
  it('does not import the settings key table', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    // Every module the root route reaches through this folder's lazy shell.
    for (const file of [
      'AppearanceDialog.tsx',
      'AppearanceDialogLazy.tsx',
      'appearance.constants.ts',
      'appearance-dialog.constants.ts',
      'index.ts',
    ]) {
      const source = readFileSync(join(here, file), 'utf8');
      expect(source, file).not.toContain('SettingsModal/settings.constants');
    }
  });
});
