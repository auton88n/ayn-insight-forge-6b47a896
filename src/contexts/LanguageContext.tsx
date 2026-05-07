import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '@/i18n';

export type Language = 'en' | 'ar' | 'fr';
export type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const direction: Direction = 'ltr'; // Always LTR as per user request to preserve premium design layout even for Arabic

  useEffect(() => {
    // Load saved language from localStorage
    const savedLang = localStorage.getItem('ayn-language') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ar' || savedLang === 'fr')) {
      setLanguageState(savedLang);
    }
  }, []);

  useEffect(() => {
    // Update document direction and language for public pages (Landing, Services, Pricing)
    // Dashboard overrides this with its own dir="ltr" container
    document.documentElement.lang = language;
    // Direction is applied per-page via dir={direction}, not globally,
    // to prevent dashboard portals (modals, toasts, dropdowns) from breaking
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('ayn-language', lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
