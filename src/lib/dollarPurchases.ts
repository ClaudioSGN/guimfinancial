import Big from "big.js";
import type { AppCurrency } from "../../shared/currency";

export type DollarPurchase = {
  id: string;
  user_id: string;
  date: string;
  usd_amount: number | string;
  total_paid: number | string;
  currency: AppCurrency;
};

export type DollarQuote = { rate: number; date: string };
export type DollarQuotes = Record<AppCurrency, DollarQuote>;

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isPurchaseAmount(value: string) {
  return /^\d{1,12}(\.\d{1,2})?$/.test(value) && new Big(value).gt(0);
}

export function validateDollarPurchase(
  draft: { date: string; usd_amount: string; total_paid: string; currency: string },
  today = localDateKey(),
) {
  if (!isPurchaseAmount(draft.usd_amount) || !isPurchaseAmount(draft.total_paid)) return "amount";
  if (!isCalendarDate(draft.date) || draft.date > today) return "date";
  if (draft.currency !== "BRL" && draft.currency !== "EUR") return "currency";
  return null;
}

// Costs must stay in their original currency, independent of display preferences.
export function summarizeDollarPurchases(purchases: DollarPurchase[], quotes: Partial<DollarQuotes> = {}) {
  return (["BRL", "EUR"] as const).flatMap((currency) => {
    const rows = purchases.filter((purchase) => purchase.currency === currency);
    if (!rows.length) return [];
    const usd = rows.reduce((sum, row) => sum.plus(row.usd_amount), new Big(0));
    const paid = rows.reduce((sum, row) => sum.plus(row.total_paid), new Big(0));
    const quote = quotes[currency];
    const value = quote && Number.isFinite(quote.rate) && quote.rate > 0 ? usd.times(quote.rate) : null;
    const gain = value?.minus(paid) ?? null;
    return [{
      currency,
      usd: usd.toNumber(),
      paid: paid.toNumber(),
      averageRate: usd.gt(0) ? paid.div(usd).toNumber() : 0,
      value: value?.toNumber() ?? null,
      gain: gain?.toNumber() ?? null,
      gainPercent: gain && paid.gt(0) ? gain.div(paid).times(100).toNumber() : null,
    }];
  });
}

export function parseDollarQuotes(payload: unknown): DollarQuotes {
  if (!Array.isArray(payload)) throw new Error("Invalid exchange-rate response");
  const quotes: Partial<DollarQuotes> = {};
  for (const row of payload) {
    if (!row || row.base !== "USD" || (row.quote !== "BRL" && row.quote !== "EUR")) continue;
    if (typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0 ||
      typeof row.date !== "string" || !isCalendarDate(row.date)) continue;
    quotes[row.quote as AppCurrency] = { rate: row.rate, date: row.date };
  }
  if (!quotes.BRL || !quotes.EUR) throw new Error("Missing exchange rates");
  return { BRL: quotes.BRL, EUR: quotes.EUR };
}
