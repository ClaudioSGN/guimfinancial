import { describe, expect, it } from "vitest";
import { calendarDateString, getMonthInstallment, getPlanningMonths, parseCalendarDate, shiftCalendarMonth } from "./installmentSchedule";
import { buildBudgetMonthEntries } from "./budget";

const plan = { date: "2026-09-11", amount: 500, installment_total: 5, installments_paid: 0 };

describe("calendar installment schedule", () => {
  it("shows September 1/5 through January 5/5, with December 4/5 regardless of payments", () => {
    for (let offset = 0; offset < 5; offset += 1) {
      expect(getMonthInstallment(plan, new Date(2026, 8 + offset, 1))).toMatchObject({ index: offset + 1, total: 5, amount: 100, isPaid: false });
    }
    expect(getMonthInstallment({ ...plan, installments_paid: 4 }, new Date(2026, 11, 1))).toMatchObject({ index: 4, total: 5, isPaid: true });
    expect(getMonthInstallment({ ...plan, installments_paid: 5 }, new Date(2026, 11, 1))?.index).toBe(4);
  });

  it("does not show installments before the purchase or after the plan ends", () => {
    expect(getMonthInstallment(plan, new Date(2026, 7, 1))).toBeNull();
    expect(getMonthInstallment(plan, new Date(2027, 1, 1))).toBeNull();
  });

  it("clamps month-end dates without skipping February or March", () => {
    const monthEndPlan = { ...plan, date: "2028-01-31" };
    expect(getMonthInstallment(monthEndPlan, new Date(2028, 1, 1))?.date).toBe("2028-02-29");
    expect(getMonthInstallment(monthEndPlan, new Date(2028, 2, 1))?.date).toBe("2028-03-31");
    expect(calendarDateString(shiftCalendarMonth(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });

  it("keeps original installment numbers when responsibilities are split", () => {
    const shared = { ...plan, responsibility_installment_indexes: [2, 4], installments_paid: 1 };
    expect(getMonthInstallment(shared, new Date(2026, 9, 1))).toMatchObject({ index: 2, total: 5, isPaid: true });
    expect(getMonthInstallment(shared, new Date(2026, 11, 1))).toMatchObject({ index: 4, total: 5, isPaid: false });
    expect(getMonthInstallment(shared, new Date(2026, 10, 1))).toBeNull();
  });

  it("rejects invalid dates/counts and keeps date-only values on the local day", () => {
    expect(calendarDateString(parseCalendarDate("2026-09-11")!)).toBe("2026-09-11");
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(getMonthInstallment({ ...plan, installment_total: 2.5 }, new Date(2026, 8, 1))).toBeNull();
  });

  it("makes future months and long plans selectable without resetting the selected month", () => {
    const months = getPlanningMonths(new Date(2026, 11, 1), [{ ...plan, installment_total: 24 }], new Date(2026, 8, 11)).map(calendarDateString);
    expect(months).toContain("2026-12-01");
    expect(months).toContain("2028-08-01");
  });

  it("budgets count just the selected installment amount", () => {
    const entries = buildBudgetMonthEntries([{ ...plan, id: "purchase", type: "card_expense", category: "Shopping" }], new Date(2026, 11, 1));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "purchase-i4", amount: 100, effectiveDate: "2026-12-11" });
    expect(buildBudgetMonthEntries([{ ...plan, id: "purchase", type: "expense", category: "Shopping" }], new Date(2027, 1, 1))).toEqual([]);
  });
});
