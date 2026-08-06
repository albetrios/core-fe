import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  getBootstrapResources,
  I18N_BUILD_UI_LOCALE,
} from '@/lib/i18n/i18n-resources.ts';
import { PRODUCT_NAME } from '@/lib/product-identity.ts';

import { I18N_NAMESPACES } from './namespaces.ts';

/**
 * Bootstrap i18next.
 * - BUILD_I18N_MODE=single: all copy for the build locale is inlined in JS (no JSON fetch).
 * - BUILD_I18N_MODE=multi: English ships in the initial bundle; other locales lazy-load JSON.
 */
i18n.use(initReactI18next).init({
  lng: I18N_BUILD_UI_LOCALE,
  fallbackLng: I18N_BUILD_UI_LOCALE,
  defaultNS: I18N_NAMESPACES.common,
  ns: Object.values(I18N_NAMESPACES),
  resources: getBootstrapResources(),
  interpolation: {
    escapeValue: false,
    // The product name is identity, not translated copy — so locale files carry
    // `{{productName}}` and never the brand itself. That keeps all 22 locale
    // files off the rebrand surface (the same reason index.html uses tokens):
    // a rename touches one config block, not 33 translated strings.
    defaultVariables: { productName: PRODUCT_NAME },
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
