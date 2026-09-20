import { isSettingsHash, settingsHashPath } from './settings-hash-grammar.ts';
import type {
  SettingsScope,
  SettingsSection,
  SettingsSectionRef,
} from './settings-sections.ts';
import { DEFAULT_SETTINGS, SECTIONS_BY_SCOPE } from './settings-sections.ts';

/**
 * Registry-dependent settings-hash parsing. The pure hash *grammar*
 * (`settingsHash`, `isSettingsHash`, `settingsHashPath`, …) lives in the
 * dependency-free `settings-hash-grammar.ts` leaf so entry-resident callers
 * don't pull the section registry + constants into first paint. Only
 * {@link parseSettingsHash} — which needs `SECTIONS_BY_SCOPE` / `DEFAULT_SETTINGS`
 * from `settings-sections.ts` — lives here, and it is imported only by the lazy
 * settings modal. The grammar is re-exported below so existing read-side
 * consumers of this module keep working. routing-and-tenancy.md §7.
 */
export {
  isCanonicalSettingsHash,
  isSettingsHash,
  settingsHash,
  settingsHashPath,
} from './settings-hash-grammar.ts';

function isSectionOf(scope: SettingsScope, section: string): section is SettingsSection {
  // eslint-disable-next-line security/detect-object-injection -- scope is a typed two-value union; the map is exhaustive
  return (SECTIONS_BY_SCOPE[scope] as readonly string[]).includes(section);
}

/**
 * Parse a location hash. Returns `null` when the hash is not settings-related
 * (modal closed). Malformed scope/section pairs fall back to account/profile.
 * Context-aware availability (permissions, org type) is applied in
 * {@link resolveSettingsSection} inside the modal.
 */
export function parseSettingsHash(hash: string): SettingsSectionRef | null {
  const h = settingsHashPath(hash);
  if (!isSettingsHash(h)) return null;

  const [, scope, section] = h.split('/');
  if (scope === 'account' || scope === 'organization') {
    if (section && isSectionOf(scope, section)) {
      return { scope, section };
    }
    // Legacy remap: sections that moved scope keep old deep links working —
    // billing lived under `organization/` before it moved to Account.
    if (section && isSectionOf('account', section)) {
      return { scope: 'account', section };
    }
  }
  return DEFAULT_SETTINGS;
}
