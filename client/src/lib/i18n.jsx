import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en.js';
import hi from '../locales/hi.js';

const DICTIONARIES = { en, hi };
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];
const STORAGE_KEY = 'airwatch.lang';

const I18nContext = createContext(null);

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (DICTIONARIES[saved]) return saved;
  } catch { /* ignore */ }
  return 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const value = useMemo(() => {
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    const t = (key, vars) => {
      const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
      return vars ? template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? '')) : template;
    };
    // Locality display name in the current language, falling back to the name from the API.
    const place = (l) => (l ? DICTIONARIES[lang][`locality.${l.code}`] ?? l.name : '');
    return { lang, setLang, t, locale, place };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
