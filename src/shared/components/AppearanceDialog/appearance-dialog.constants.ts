import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

/**
 * The Appearance dialog's own header — three strings that live in the
 * `settings` namespace (the same panel is a Settings section).
 *
 * Declared HERE, not read off `SETTINGS_KEYS`: `AppearanceDialog` is mounted on
 * the root route, so it is in the entry chunk, and importing
 * `settings.constants.ts` for three keys dragged that module's entire key table
 * (~17 kB of source) onto the first paint of every load.
 * `appearance-dialog.constants.test.ts` pins these to the originals so the two
 * cannot drift.
 *
 * Its own file, not a second block in `appearance.constants.ts`: the i18n key
 * validator resolves ONE namespace per constants file, and that one is `common`.
 */
export const APPEARANCE_DIALOG_NS = I18N_NAMESPACES.settings;

/** The three header strings — identical to `SETTINGS_KEYS.panels.appearance` (drift-tested). */
export const APPEARANCE_DIALOG_KEYS = {
  title: 'panels.appearance.title',
  description: 'panels.appearance.description',
  shuffle: 'panels.appearance.shuffle',
} as const;
