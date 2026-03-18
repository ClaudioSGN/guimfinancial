import type { Language } from "./i18n";

export type AppCurrency = "BRL" | "EUR";

export const DEFAULT_APP_CURRENCY: AppCurrency = "BRL";
export const APP_CURRENCIES = ["BRL", "EUR"] as const;

export function normalizeAppCurrency(currency: string | null | undefined): AppCurrency {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return normalized === "EUR" ? "EUR" : DEFAULT_APP_CURRENCY;
}

export function getCurrencyLocale(language: Language) {
  return language === "pt" ? "pt-BR" : "en-US";
}

export function formatCurrencyValue(
  value: number,
  language: Language,
  currency: AppCurrency = DEFAULT_APP_CURRENCY,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(getCurrencyLocale(language), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    ...options,
  }).format(value);
}

export function formatCentsInputValue(
  raw: string,
  currency: AppCurrency = DEFAULT_APP_CURRENCY,
  locale = "pt-BR",
) {
  const cleaned = raw.replace(/\D/g, "");
  if (!cleaned) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0);
  }
  const value = Number(cleaned) / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseCentsInputValue(value: string) {
  const cleaned = value.replace(/\D/g, "");
  if (!cleaned) return 0;
  return Number(cleaned) / 100;
}

export function formatCentsFromNumberValue(
  value: number,
  currency: AppCurrency = DEFAULT_APP_CURRENCY,
  locale = "pt-BR",
) {
  const cents = Math.round((Number(value) || 0) * 100);
  return formatCentsInputValue(String(cents), currency, locale);
}

export function getCoinGeckoCurrency(currency: string | null | undefined) {
  return normalizeAppCurrency(currency) === "EUR" ? "eur" : "brl";
}
