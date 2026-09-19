import { describe, expect, it } from "vitest";
import { localDateKey, parseDollarQuotes, summarizeDollarPurchases, validateDollarPurchase, type DollarPurchase } from "./dollarPurchases";

const purchase = (usd: string, paid: string, currency: "BRL" | "EUR" = "BRL"): DollarPurchase => ({
  id: "purchase", user_id: "owner", date: "2026-09-01", usd_amount: usd, total_paid: paid, currency,
});

describe("dollar purchase valuation", () => {
  it("weights the purchase rate by dollars and includes fees in the cost basis", () => {
    const [result] = summarizeDollarPurchases([purchase("100", "520"), purchase("300", "1620")], { BRL: { rate: 5.6, date: "2026-09-18" } });
    expect(result).toMatchObject({ usd: 400, paid: 2140, averageRate: 5.35, value: 2240, gain: 100 });
    expect(result.gainPercent).toBeCloseTo(100 / 2140 * 100);
  });
  it("calculates losses and break-even without floating point cents drift", () => {
    const rows = [purchase("0.1", "0.5"), purchase("0.2", "1")];
    expect(summarizeDollarPurchases(rows, { BRL: { rate: 5, date: "2026-09-18" } })[0]).toMatchObject({ usd: 0.3, paid: 1.5, gain: 0, gainPercent: 0 });
    expect(summarizeDollarPurchases(rows, { BRL: { rate: 4, date: "2026-09-18" } })[0]).toMatchObject({ value: 1.2, gain: -0.3, gainPercent: -20 });
  });
  it("keeps real and euro costs separate", () => {
    const result = summarizeDollarPurchases([purchase("100", "500"), purchase("50", "45", "EUR")]);
    expect(result.map(({ currency, usd, paid }) => ({ currency, usd, paid }))).toEqual([
      { currency: "BRL", usd: 100, paid: 500 }, { currency: "EUR", usd: 50, paid: 45 },
    ]);
  });
  it("never turns missing or invalid quotes into zero-value losses", () => {
    for (const rate of [undefined, 0, -1, Infinity, NaN]) {
      const [result] = summarizeDollarPurchases([purchase("100", "500")], rate === undefined ? {} : { BRL: { rate, date: "2026-09-18" } });
      expect(result).toMatchObject({ value: null, gain: null, gainPercent: null, paid: 500 });
    }
    expect(summarizeDollarPurchases([])).toEqual([]);
  });
});

describe("dollar purchase validation", () => {
  const draft = { date: "2026-09-01", usd_amount: "100.25", total_paid: "520.10", currency: "BRL" };
  it("accepts actual purchases and rejects invalid, future or rolled-over dates", () => {
    expect(validateDollarPurchase(draft, "2026-09-19")).toBeNull();
    for (const date of ["2026-09-20", "2026-02-30", "", "2026-13-01"]) {
      expect(validateDollarPurchase({ ...draft, date }, "2026-09-19")).toBe("date");
    }
    expect(validateDollarPurchase({ ...draft, date: "2024-02-29" }, "2026-09-19")).toBeNull();
    expect(localDateKey(new Date(2026, 8, 1, 23, 59))).toBe("2026-09-01");
  });
  it("rejects zero, negative, nonfinite, overprecise and out-of-range amounts", () => {
    for (const value of ["0", "-1", "NaN", "Infinity", "1.001", "1e3", "1000000000000", ""]) {
      expect(validateDollarPurchase({ ...draft, usd_amount: value })).toBe("amount");
      expect(validateDollarPurchase({ ...draft, total_paid: value })).toBe("amount");
    }
    expect(validateDollarPurchase({ ...draft, currency: "USD" })).toBe("currency");
  });
});

describe("reference quote parsing", () => {
  const rows = [{ base: "USD", quote: "BRL", date: "2026-09-18", rate: 5.2 }, { base: "USD", quote: "EUR", date: "2026-09-17", rate: 0.9 }];
  it("preserves the direction and separate publication dates", () => {
    expect(parseDollarQuotes(rows)).toEqual({ BRL: { rate: 5.2, date: "2026-09-18" }, EUR: { rate: 0.9, date: "2026-09-17" } });
  });
  it("rejects partial, malformed and wrong-direction responses", () => {
    for (const payload of [{}, [], rows.slice(0, 1), [rows[0], { ...rows[1], rate: 0 }], [rows[0], { ...rows[1], date: "2026-02-30" }], [rows[0], { ...rows[1], base: "EUR" }]]) {
      expect(() => parseDollarQuotes(payload)).toThrow();
    }
  });
});
