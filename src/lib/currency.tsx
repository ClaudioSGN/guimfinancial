"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_APP_CURRENCY,
  normalizeAppCurrency,
  type AppCurrency,
} from "../../shared/currency";

type CurrencyContextValue = {
  currency: AppCurrency;
  setCurrency: (next: AppCurrency) => void;
};

const STORAGE_KEY = "guimfinancial:currency";
const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<AppCurrency>(DEFAULT_APP_CURRENCY);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrencyState(normalizeAppCurrency(window.localStorage.getItem(STORAGE_KEY)));
  }, []);

  const setCurrency = (next: AppCurrency) => {
    const normalized = normalizeAppCurrency(next);
    setCurrencyState(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    }
  };

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
    }),
    [currency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within CurrencyProvider");
  }
  return ctx;
}
