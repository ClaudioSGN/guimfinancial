import {
  DEFAULT_APP_CURRENCY,
  APP_CURRENCIES,
  getCoinGeckoCurrency as getSharedCoinGeckoCurrency,
  normalizeAppCurrency,
  type AppCurrency,
} from "./currency";

export type SupportedInvestmentType = "b3" | "crypto" | "fixed_income";
export type SupportedInvestmentCurrency = AppCurrency;

export const DEFAULT_INVESTMENT_CURRENCY: SupportedInvestmentCurrency = DEFAULT_APP_CURRENCY;
export const SUPPORTED_INVESTMENT_CURRENCIES = APP_CURRENCIES;

export function normalizeInvestmentCurrency(
  currency: string | null | undefined,
  type?: SupportedInvestmentType | null,
): SupportedInvestmentCurrency {
  if (type === "b3") return DEFAULT_INVESTMENT_CURRENCY;
  return normalizeAppCurrency(currency);
}

export function canSelectInvestmentCurrency(type: SupportedInvestmentType | null | undefined) {
  return type !== "b3";
}

export function getCoinGeckoCurrency(
  currency: string | null | undefined,
  type?: SupportedInvestmentType | null,
) {
  return getSharedCoinGeckoCurrency(normalizeInvestmentCurrency(currency, type));
}
