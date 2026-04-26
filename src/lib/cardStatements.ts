export type CardScheduleLike = {
  closing_day: number | string | null | undefined;
  due_day?: number | string | null | undefined;
};

export type CardExpenseLike = {
  type: string;
  amount: number | string | null | undefined;
  date: string;
  installment_total?: number | null;
  installments_paid?: number | null;
  is_paid?: boolean | null;
};

export type CardChargeTiming = "overdue" | "current" | "next" | "future";

type CardExpenseSettlementUpdate = {
  update: {
    installments_paid?: number;
    is_paid: boolean;
  };
  balanceDelta: number;
};

type CardExpenseResolutionOptions = {
  includeCurrentStatement?: boolean;
};

function parseLocalDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSafeDayInMonth(year: number, month: number, day: number) {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), maxDay);
}

function getNormalizedDay(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStatementMonthForCharge(chargeDate: Date, card: CardScheduleLike) {
  const closingDay = getNormalizedDay(card.closing_day);
  if (!closingDay) return null;

  const effectiveClosingDay = getSafeDayInMonth(
    chargeDate.getFullYear(),
    chargeDate.getMonth(),
    closingDay,
  );

  return chargeDate.getDate() < effectiveClosingDay
    ? new Date(chargeDate.getFullYear(), chargeDate.getMonth(), 1)
    : new Date(chargeDate.getFullYear(), chargeDate.getMonth() + 1, 1);
}

function getOpenStatementMonth(today: Date, card: CardScheduleLike) {
  const closingDay = getNormalizedDay(card.closing_day);
  if (!closingDay) return null;

  const effectiveClosingDay = getSafeDayInMonth(
    today.getFullYear(),
    today.getMonth(),
    closingDay,
  );

  return today.getDate() <= effectiveClosingDay
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth() + 1, 1);
}

function isPayableTiming(
  timing: CardChargeTiming | null,
  options?: CardExpenseResolutionOptions,
) {
  if (timing === "overdue") return true;
  return options?.includeCurrentStatement === true && timing === "current";
}

export function getCardChargeTiming(
  tx: Pick<CardExpenseLike, "date">,
  card: CardScheduleLike,
  today: Date,
): CardChargeTiming | null {
  const txDate = parseLocalDate(tx.date);
  if (!txDate) return null;

  const statementMonth = getStatementMonthForCharge(txDate, card);
  const openStatementMonth = getOpenStatementMonth(today, card);
  if (!statementMonth || !openStatementMonth) return null;

  const monthDelta =
    (statementMonth.getFullYear() - openStatementMonth.getFullYear()) * 12 +
    (statementMonth.getMonth() - openStatementMonth.getMonth());

  if (monthDelta < 0) return "overdue";
  if (monthDelta === 0) return "current";
  if (monthDelta === 1) return "next";
  return "future";
}

export function getCardExpenseDueState(
  tx: CardExpenseLike,
  card: CardScheduleLike,
  today: Date,
  options?: CardExpenseResolutionOptions,
) {
  const amount = Number(tx.amount) || 0;
  if (amount <= 0 || tx.type === "income") return null;

  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  if (totalInstallments > 0) {
    const paidInstallments = Math.min(
      Math.max(Number(tx.installments_paid) || 0, 0),
      totalInstallments,
    );
    const txDate = parseLocalDate(tx.date);
    if (!txDate) return null;

    const perInstallment = amount / totalInstallments;
    let pendingInstallments = 0;

    for (let index = paidInstallments; index < totalInstallments; index += 1) {
      const installmentDate = new Date(
        txDate.getFullYear(),
        txDate.getMonth() + index,
        txDate.getDate(),
      );
      const timing = getCardChargeTiming(
        {
          date: `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, "0")}-${String(installmentDate.getDate()).padStart(2, "0")}`,
        },
        card,
        today,
      );
      if (isPayableTiming(timing, options)) pendingInstallments += 1;
    }

    if (pendingInstallments <= 0) return null;
    return { pendingAmount: perInstallment * pendingInstallments };
  }

  if (tx.is_paid) return null;
  return isPayableTiming(getCardChargeTiming(tx, card, today), options)
    ? { pendingAmount: amount }
    : null;
}

export function getCardExpenseSettlementUpdate(
  tx: CardExpenseLike,
  card: CardScheduleLike,
  today: Date,
  options?: CardExpenseResolutionOptions,
): CardExpenseSettlementUpdate | null {
  const amount = Number(tx.amount) || 0;
  if (amount <= 0 || tx.type === "income") return null;

  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  if (totalInstallments > 0) {
    const paidInstallments = Math.min(
      Math.max(Number(tx.installments_paid) || 0, 0),
      totalInstallments,
    );
    const txDate = parseLocalDate(tx.date);
    if (!txDate) return null;

    const perInstallment = amount / totalInstallments;
    let installmentsToSettle = 0;

    for (let index = paidInstallments; index < totalInstallments; index += 1) {
      const installmentDate = new Date(
        txDate.getFullYear(),
        txDate.getMonth() + index,
        txDate.getDate(),
      );
      const timing = getCardChargeTiming(
        {
          date: `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, "0")}-${String(installmentDate.getDate()).padStart(2, "0")}`,
        },
        card,
        today,
      );
      if (isPayableTiming(timing, options)) installmentsToSettle += 1;
    }

    if (installmentsToSettle <= 0) return null;

    const nextPaidInstallments = Math.min(
      paidInstallments + installmentsToSettle,
      totalInstallments,
    );

    return {
      update: {
        installments_paid: nextPaidInstallments,
        is_paid: nextPaidInstallments >= totalInstallments,
      },
      balanceDelta: perInstallment * (nextPaidInstallments - paidInstallments),
    };
  }

  if (tx.is_paid) return null;
  if (!isPayableTiming(getCardChargeTiming(tx, card, today), options)) return null;

  return {
    update: {
      is_paid: true,
    },
    balanceDelta: amount,
  };
}
