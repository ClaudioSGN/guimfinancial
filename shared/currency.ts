import type { Language } from "./i18n";

export type AppCurrency = "BRL" | "EUR";

export const DEFAULT_APP_CURRENCY: AppCurrency = "BRL";
export const APP_CURRENCIES = ["BRL", "EUR"] as const;

// Reuse expensive Intl instances across financial rows and keystrokes. The bound
// also protects long-lived sessions that request many custom formatting options.
const numberFormatters = new Map<string, Intl.NumberFormat>();
const MAX_NUMBER_FORMATTERS = 32;

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions) {
  const key = JSON.stringify([locale, options]);
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  if (numberFormatters.size >= MAX_NUMBER_FORMATTERS) {
    const oldestKey = numberFormatters.keys().next().value;
    if (oldestKey !== undefined) numberFormatters.delete(oldestKey);
  }
  numberFormatters.set(key, formatter);
  return formatter;
}

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
  return getNumberFormatter(getCurrencyLocale(language), {
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
    return getNumberFormatter(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0);
  }
  const value = Number(cleaned) / 100;
  return getNumberFormatter(locale, {
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
