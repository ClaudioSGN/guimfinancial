import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_APP_CURRENCY,
  normalizeAppCurrency,
  type AppCurrency,
} from '@shared/currency';

type CurrencyContextValue = {
  currency: AppCurrency;
  setCurrency: (currency: AppCurrency) => void;
};

const STORAGE_KEY = 'appCurrency';
const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<AppCurrency>(DEFAULT_APP_CURRENCY);

  useEffect(() => {
    async function loadCurrency() {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      setCurrencyState(normalizeAppCurrency(stored));
    }
    loadCurrency();
  }, []);

  const setCurrency = async (nextCurrency: AppCurrency) => {
    const normalized = normalizeAppCurrency(nextCurrency);
    setCurrencyState(normalized);
    await AsyncStorage.setItem(STORAGE_KEY, normalized);
  };

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
    }),
    [currency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
}
