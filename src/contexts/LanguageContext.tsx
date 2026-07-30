/**
 * LanguageContext — English only.
 *
 * AYN ships in English. This is a thin shim kept so the components that read
 * `language`, `direction` or `t` keep working; there is no way to change it
 * and every localized branch resolves to the English one.
 */
import React, { createContext, useContext, useEffect } from 'react';
import { translations } from '@/i18n';

export type Language = 'en' | 'ar' | 'fr';
export type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const value: LanguageContextType = {
  language: 'en',
  direction: 'ltr',
  setLanguage: () => {},
  t: (key: string) => translations.en?.[key] || key,
};

const LanguageContext = createContext<LanguageContextType>(value);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    try { localStorage.removeItem('ayn-language'); } catch { /* ignore */ }
  }, []);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
