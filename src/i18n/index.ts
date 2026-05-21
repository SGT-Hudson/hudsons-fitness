import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import esCommon from './es/common.json';
import esAuth from './es/auth.json';
import esNav from './es/nav.json';
import esOnboarding from './es/onboarding.json';
import esMetricas from './es/metricas.json';
import esIngredientes from './es/ingredientes.json';
import esRecetas from './es/recetas.json';
import esDiario from './es/diario.json';
import esPlanning from './es/planning.json';
import esObjetivos from './es/objetivos.json';
import esSettings from './es/settings.json';
import esEntrenamiento from './es/entrenamiento.json';
import esCoach from './es/coach.json';
import enCommon from './en/common.json';
import enAuth from './en/auth.json';
import enNav from './en/nav.json';
import enOnboarding from './en/onboarding.json';
import enMetricas from './en/metricas.json';
import enIngredientes from './en/ingredientes.json';
import enRecetas from './en/recetas.json';
import enDiario from './en/diario.json';
import enPlanning from './en/planning.json';
import enObjetivos from './en/objetivos.json';
import enSettings from './en/settings.json';
import enEntrenamiento from './en/entrenamiento.json';
import enCoach from './en/coach.json';

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
        recetas: esRecetas,
        diario: esDiario,
        planning: esPlanning,
        objetivos: esObjetivos,
        settings: esSettings,
        entrenamiento: esEntrenamiento,
        coach: esCoach,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        nav: enNav,
        onboarding: enOnboarding,
        metricas: enMetricas,
        ingredientes: enIngredientes,
        recetas: enRecetas,
        diario: enDiario,
        planning: enPlanning,
        objetivos: enObjetivos,
        settings: enSettings,
        entrenamiento: enEntrenamiento,
        coach: enCoach,
      },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    ns: ['common', 'auth', 'nav', 'onboarding', 'metricas', 'ingredientes', 'recetas', 'diario', 'planning', 'objetivos', 'settings', 'entrenamiento', 'coach'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'hudsons-fitness-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
