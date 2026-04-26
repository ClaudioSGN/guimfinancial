import { describe, expect, it } from "vitest";
import {
  getCardChargeTiming,
  getCardExpenseDueState,
  getCardExpenseSettlementUpdate,
} from "./cardStatements";

const card = {
  closing_day: 1,
  due_day: 8,
};

describe("card statement rules", () => {
  it("treats purchases on the closing day as the next statement", () => {
    const today = new Date(2026, 3, 26);

    expect(
      getCardChargeTiming({ date: "2026-04-30" }, card, today),
    ).toBe("current");
    expect(
      getCardChargeTiming({ date: "2026-05-01" }, card, today),
    ).toBe("next");
  });

  it("only includes already closed statement charges in home reminders", () => {
    const afterClosing = new Date(2026, 4, 2);

    expect(
      getCardExpenseDueState(
        {
          type: "card_expense",
          amount: 19.81,
          date: "2026-05-01",
          is_paid: false,
        },
        card,
        afterClosing,
        { includeCurrentStatement: false },
      ),
    ).toBeNull();

    expect(
      getCardExpenseDueState(
        {
          type: "card_expense",
          amount: 120,
          date: "2026-04-30",
          is_paid: false,
        },
        card,
        afterClosing,
        { includeCurrentStatement: false },
      ),
    ).toEqual({ pendingAmount: 120 });
  });

  it("settles only the closed statement when paying a reminder", () => {
    const afterClosing = new Date(2026, 4, 2);

    expect(
      getCardExpenseSettlementUpdate(
        {
          type: "card_expense",
          amount: 19.81,
          date: "2026-05-01",
          is_paid: false,
        },
        card,
        afterClosing,
        { includeCurrentStatement: false },
      ),
    ).toBeNull();

    expect(
      getCardExpenseSettlementUpdate(
        {
          type: "card_expense",
          amount: 120,
          date: "2026-04-30",
          is_paid: false,
        },
        card,
        afterClosing,
        { includeCurrentStatement: false },
      ),
    ).toEqual({
      update: { is_paid: true },
      balanceDelta: 120,
    });
  });
});
