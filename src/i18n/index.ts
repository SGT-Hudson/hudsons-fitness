import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import esCommon from './es/common.json';
import esAuth from './es/auth.json';
import esNav from './es/nav.json';
import esOnboarding from './es/onboarding.json';
import esMetricas from './es/metricas.json';
import esIngredientes from './es/ingredientes.json';
import enCommon from './en/common.json';
import enAuth from './en/auth.json';
import enNav from './en/nav.json';
import enOnboarding from './en/onboarding.json';
import enMetricas from './en/metricas.json';
import enIngredientes from './en/ingredientes.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon,
        auth: esAuth,
        nav: esNav,
        onboarding: esOnboarding,
        metricas: esMetricas,
        ingredientes: esIngredientes,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        nav: enNav,
        onboarding: enOnboarding,
        metricas: enMetricas,
        ingredientes: enIngredientes,
      },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    ns: ['common', 'auth', 'nav', 'onboarding', 'metricas', 'ingredientes'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'hudsons-fitness-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
