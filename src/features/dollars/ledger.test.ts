import { describe, expect, it } from "vitest";
import { parseStoredEntry, todayKey, totalDollars, validAmount, validDate, validEntry, type DollarEntry } from "./ledger";

const entry = (usd: string): DollarEntry => ({ id: "dollar-1", date: "2026-09-01", usd });

describe("dollar ledger", () => {
  it("adds exact cents and returns a two-decimal string, including an empty ledger", () => {
    expect(totalDollars([])).toBe("0.00");
    expect(totalDollars([entry("0.10"), entry("0.20")])).toBe("0.30");
    expect(totalDollars([entry("12"), entry("3.4"), entry("0.01")])).toBe("15.41");
  });

  it("keeps every cent when totals exceed JavaScript's precise number range", () => {
    const rows = Array.from({ length: 100 }, () => entry("999999999999.99"));
    expect(totalDollars([...rows, entry("0.01")])).toBe("99999999999999.01");
  });

  it("accepts positive canonical decimal amounts with at most two fractional digits", () => {
    for (const amount of ["0.01", "0.1", "1", "10.00", "999999999999.99"]) {
      expect(validAmount(amount), amount).toBe(true);
    }
    for (const amount of [null, 1, "", "0", "0.00", "-1", "+1", "01", "00.1", "1.", ".01", "1.001", "1e3", "1,20", " 1", "1 ", "NaN", "Infinity", "1000000000000"]) {
      expect(validAmount(amount), String(amount)).toBe(false);
    }
  });

  it("validates real calendar days, including leap years and month boundaries", () => {
    for (const date of ["2024-02-29", "2000-02-29", "2026-01-31", "2026-04-30"]) {
      expect(validDate(date), date).toBe(true);
    }
    for (const date of [null, "", "0000-01-01", "1900-02-29", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "2026-09-01T00:00:00Z"]) {
      expect(validDate(date), String(date)).toBe(false);
    }
  });

  it("uses the local calendar day for the form's default date", () => {
    expect(todayKey(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
    expect(todayKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("accepts both new entries and recorded legacy dollars without requiring cost metadata", () => {
    const row = entry("120.35");
    expect(validEntry(row)).toBe(true);
    expect(validEntry({ ...row, paid: "610.00", currency: "BRL" })).toBe(true);
    expect(validEntry({ ...row, paid: null, currency: "EUR", userId: "stored-owner" })).toBe(true);
    expect(totalDollars([{ ...row }, { ...row, id: "dollar-2" }])).toBe("240.70");
  });

  it("normalizes old stored decimals for cents input without mutating the record", () => {
    for (const [usd, expected] of [["001.20", "1.20"], ["1", "1.00"], ["1.2", "1.20"], ["000.01", "0.01"], ["999999999999.99", "999999999999.99"]]) {
      const stored = { ...entry(usd), userId: "owner", paid: "6.00", currency: "BRL" };
      expect(parseStoredEntry(stored)).toEqual({ id: stored.id, date: stored.date, usd: expected });
      expect(stored.usd).toBe(usd);
      expect(stored).toMatchObject({ userId: "owner", paid: "6.00", currency: "BRL" });
    }
  });

  it("does not round malformed stored amounts into valid dollars", () => {
    for (const value of [null, { ...entry("1"), usd: 1 }, entry("1.001"), entry("1e3"), entry("0"), entry("-1"), entry("1000000000000"), { ...entry("1"), date: "2026-02-30" }]) {
      expect(() => parseStoredEntry(value)).toThrow("Invalid stored entry");
    }
  });

  it("rejects malformed stored entries instead of quietly changing the total", () => {
    for (const row of [null, [], {}, { ...entry("1"), id: "" }, { ...entry("1"), id: "bad/id" }, { ...entry("1"), id: "a".repeat(81) }, { ...entry("1"), date: "2026-02-30" }, entry("0.001"), entry("-2")]) {
      expect(validEntry(row)).toBe(false);
    }
  });
});
