// Prevent locale/dir FOUC: apply lang + dir before React hydrates.
// Mirrors useLocaleStore onRehydrateStorage / resolvedTextDirection.
try {
  var raw = localStorage.getItem('locale-preference');
  var stored = raw ? JSON.parse(raw) : {};
  var state = stored.state || {};
  var locale = typeof state.locale === 'string' && state.locale ? state.locale : 'en';
  var textDirection = state.textDirection || 'auto';
  // Keep in sync with RTL_LOCALES in src/lib/i18n/locales.ts.
  var RTL_LOCALES = { ar: true };
  var dir =
    textDirection === 'rtl' || textDirection === 'ltr'
      ? textDirection
      : RTL_LOCALES[locale]
        ? 'rtl'
        : 'ltr';
  var root = document.documentElement;
  root.lang = locale;
  root.dir = dir;
} catch (e) {}
