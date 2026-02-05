import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Language } from '@shared/i18n';
import { getString } from '@shared/i18n';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
};

const STORAGE_KEY = 'appLanguage';
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('pt');

  useEffect(() => {
    async function loadLanguage() {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'pt' || stored === 'en') {
        setLanguage(stored);
      }
    }
    loadLanguage();
  }, []);

  const saveLanguage = useCallback(async (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    saveLanguage(language === 'pt' ? 'en' : 'pt');
  }, [language, saveLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: saveLanguage,
      toggleLanguage,
      t: (key: string) => getString(language, key),
    }),
    [language, saveLanguage, toggleLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
