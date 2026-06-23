import { isResponsibleForInstallment } from "@/lib/installmentResponsibility";

export type BudgetRow = {
  id: string;
  category: string;
  amount: number | string;
  month_key: string;
};

export type BudgetTransaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string | null;
  date: string;
  category: string | null;
  description?: string | null;
  is_fixed?: boolean | null;
  installment_total?: number | null;
  responsibility_installment_indexes?: number[] | null;
};

export type BudgetDisplayEntry = {
  id: string;
  type: "income" | "expense" | "card_expense";
  category: string;
  title: string;
  amount: number;
  effectiveDate: string;
  isBudgetCarryover?: boolean;
};

export type BudgetSummaryRow = BudgetRow & {
  planned: number;
  spent: number;
  remaining: number;
  progress: number;
};

const SALARY_CARRYOVER_DAY_LIMIT = 10;
const SALARY_HINT_KEYWORDS = ["salario", "salary", "wage", "payroll", "pagamento"];

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getBudgetTransactionsQueryEnd(date: Date) {
  return toDateString(
    new Date(date.getFullYear(), date.getMonth() + 1, SALARY_CARRYOVER_DAY_LIMIT),
  );
}

export function parseLocalDate(value: string) {
  const normalized = value.trim();
  const datePrefix = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePrefix) {
    const [, year, month, day] = datePrefix;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addMonthsClamped(date: Date, monthsToAdd: number) {
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

function isSameMonth(date: Date, month: Date) {
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

function isSalaryCarryoverCandidate(tx: BudgetTransaction, txDate: Date) {
  if (tx.type !== "income") return false;
  if (txDate.getDate() > SALARY_CARRYOVER_DAY_LIMIT) return false;

  const haystacks = [tx.description, tx.category].map(normalizeSearchText).filter(Boolean);
  return haystacks.some((text) =>
    SALARY_HINT_KEYWORDS.some((keyword) => text.includes(keyword)),
  );
}

export function buildBudgetMonthEntries(
  transactions: BudgetTransaction[],
  month: Date,
  labels?: { uncategorized?: string; entry?: string },
) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  const budgetMonthEnd = toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const uncategorized = labels?.uncategorized ?? "No category";
  const entry = labels?.entry ?? "Entry";

  return transactions.flatMap((tx) => {
    const txDate = parseLocalDate(tx.date);
    if (!txDate || Number.isNaN(txDate.getTime())) return [];

    const amount = Number(tx.amount) || 0;
    const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
    const isInstallment = totalInstallments > 0;
    const isFixedExpense =
      !!tx.is_fixed && (tx.type === "expense" || tx.type === "card_expense");
    const monthOffset =
      (monthStart.getFullYear() - txDate.getFullYear()) * 12 +
      (monthStart.getMonth() - txDate.getMonth());
    const category = tx.category?.trim() || uncategorized;
    const title = tx.description?.trim() || tx.category?.trim() || entry;

    if (isInstallment) {
      const perInstallment = amount / totalInstallments;
      const entries: BudgetDisplayEntry[] = [];
      for (let index = 0; index < totalInstallments; index += 1) {
        if (!isResponsibleForInstallment(tx, index + 1)) continue;
        const installmentDate = addMonthsClamped(txDate, index);
        if (installmentDate < monthStart || installmentDate > monthEnd) continue;
        entries.push({
          id: `${tx.id}-i${index + 1}`,
          type: tx.type,
          category,
          title,
          amount: perInstallment,
          effectiveDate: toDateString(installmentDate),
        });
      }
      return entries;
    }

    if (isFixedExpense) {
      if (monthOffset < 0) return [];
      const recurringDate = addMonthsClamped(txDate, monthOffset);
      if (recurringDate < monthStart || recurringDate > monthEnd) return [];
      return [{
        id: `${tx.id}-f${monthOffset}`,
        type: tx.type,
        category,
        title,
        amount,
        effectiveDate: toDateString(recurringDate),
      }];
    }

    if (isSalaryCarryoverCandidate(tx, txDate)) {
      const assignedMonth = new Date(txDate.getFullYear(), txDate.getMonth() - 1, 1);
      if (!isSameMonth(assignedMonth, month)) return [];
      return [{
        id: `${tx.id}-carry-${assignedMonth.getFullYear()}-${assignedMonth.getMonth() + 1}`,
        type: tx.type,
        category,
        title,
        amount,
        effectiveDate: budgetMonthEnd,
        isBudgetCarryover: true,
      }];
    }

    if (txDate < monthStart || txDate > monthEnd) return [];
    return [{
      id: tx.id,
      type: tx.type,
      category,
      title,
      amount,
      effectiveDate: toDateString(txDate),
    }];
  });
}

export function summarizeMonthlyBudget(
  budgets: BudgetRow[],
  entries: BudgetDisplayEntry[],
) {
  const spentByCategory = entries.reduce<Record<string, number>>((acc, entry) => {
    if (entry.type === "income") return acc;
    acc[entry.category] = (acc[entry.category] ?? 0) + entry.amount;
    return acc;
  }, {});

  const incomeTotal = entries.reduce((sum, entry) => {
    return entry.type === "income" ? sum + entry.amount : sum;
  }, 0);

  const summaryRows: BudgetSummaryRow[] = budgets.map((budget) => {
    const planned = Number(budget.amount) || 0;
    const spent = spentByCategory[budget.category] ?? 0;
    const remaining = planned - spent;
    const progress = planned > 0 ? Math.min((spent / planned) * 100, 100) : 0;
    return {
      ...budget,
      planned,
      spent,
      remaining,
      progress,
    };
  });

  const plannedTotal = summaryRows.reduce((sum, row) => sum + row.planned, 0);
  const spentTotal = summaryRows.reduce((sum, row) => sum + row.spent, 0);
  const remainingTotal = plannedTotal - spentTotal;
  const coverage = incomeTotal - plannedTotal;
  const progressTotal = plannedTotal > 0 ? Math.min((spentTotal / plannedTotal) * 100, 100) : 0;

  return {
    rows: summaryRows,
    plannedTotal,
    spentTotal,
    remainingTotal,
    incomeTotal,
    coverage,
    progressTotal,
  };
}
