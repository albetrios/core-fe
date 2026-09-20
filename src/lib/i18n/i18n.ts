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
 * - BUILD_I18N_MODE=single: selected-language shells and route titles are inlined;
 *   full page namespaces load before their owning surface renders.
 * - BUILD_I18N_MODE=multi: English shells ship initially; route content and other
 *   locales load on demand before the corresponding content is rendered.
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
