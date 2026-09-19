import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("cached currency formatting", () => {
  it.each([
    { language: "pt" as const, currency: "BRL" as const, locale: "pt-BR", value: 1234.56 },
    { language: "en" as const, currency: "EUR" as const, locale: "en-US", value: -1234.56 },
    { language: "en" as const, currency: "BRL" as const, locale: "en-US", value: 0 },
    { language: "pt" as const, currency: "EUR" as const, locale: "pt-BR", value: 0.009 },
  ])("preserves $language/$currency formatting for $value", async ({ language, currency, locale, value }) => {
    const { formatCurrencyValue } = await import("./currency");
    const expected = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
    expect(formatCurrencyValue(value, language, currency)).toBe(expected);
  });

  it("reuses formatters for long lists but keeps custom precision separate", async () => {
    const { formatCurrencyValue } = await import("./currency");
    const formatter = vi.spyOn(Intl, "NumberFormat");
    for (let index = 0; index < 1000; index += 1) formatCurrencyValue(index, "en", "EUR");
    expect(formatter).toHaveBeenCalledTimes(1);
    expect(formatCurrencyValue(1.2345, "en", "EUR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })).toBe("€1.2345");
    expect(formatCurrencyValue(1.2345, "en", "EUR")).toBe("€1.23");
    expect(formatter).toHaveBeenCalledTimes(2);
  });

  it("keeps empty-input and cents-input formats distinct", async () => {
    const { formatCentsInputValue, parseCentsInputValue, formatCentsFromNumberValue } = await import("./currency");
    const formatter = vi.spyOn(Intl, "NumberFormat");
    expect(formatCentsInputValue("", "EUR", "en-US")).toBe("€0");
    expect(formatCentsInputValue("0", "EUR", "en-US")).toBe("€0.00");
    expect(formatCentsInputValue("123456", "EUR", "en-US")).toBe("€1,234.56");
    expect(formatCentsFromNumberValue(1234.56, "EUR", "en-US")).toBe("€1,234.56");
    expect(parseCentsInputValue("€1,234.56")).toBe(1234.56);
    expect(formatter).toHaveBeenCalledTimes(2);
  });
});
