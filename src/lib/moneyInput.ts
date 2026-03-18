import {
  DEFAULT_APP_CURRENCY,
  formatCentsFromNumberValue,
  formatCentsInputValue,
  parseCentsInputValue,
  type AppCurrency,
} from "../../shared/currency";

export function formatCentsInput(
  raw: string,
  currency: AppCurrency = DEFAULT_APP_CURRENCY,
) {
  return formatCentsInputValue(raw, currency);
}

export function parseCentsInput(value: string) {
  return parseCentsInputValue(value);
}

export function formatCentsFromNumber(
  value: number,
  currency: AppCurrency = DEFAULT_APP_CURRENCY,
) {
  return formatCentsFromNumberValue(value, currency);
}
