"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getErrorMessage,
  hasMissingColumnError,
  isTransientNetworkError,
} from "@/lib/errorUtils";
import {
  formatCentsFromNumber,
  formatCentsInput,
  parseCentsInput,
} from "@/lib/moneyInput";
import { getMonthShortName } from "../../../shared/i18n";
import { formatCurrencyValue, type AppCurrency } from "../../../shared/currency";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import {
  loadProfileSettings,
  type ProfileSettings,
} from "@/lib/profile";
import { BankBrandBadge } from "@/components/BankBrandBadge";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  Bar,
  Line,
  Area,
  PieChart,
  Pie,
  Cell,
  type TooltipContentProps,
} from "recharts";

type Transaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string;
  date: string;
  account_id: string | null;
  card_id: string | null;
  description: string | null;
  category: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
  installments_paid: number | null;
  is_paid: boolean | null;
};

type RawTransaction = Omit<Transaction, "amount"> & {
  amount?: number | string | null;
  value?: number | string | null;
};

type Account = {
  id: string;
  name: string;
  balance: number | string;
  bank_code?: string | null;
};

type RawAccount = {
  id: string;
  name: string;
  balance?: number | string | null;
  initial_balance?: number | string | null;
  bank_code?: string | null;
};

type CreditCard = {
  id: string;
  name: string;
  limit_amount: number | string;
  owner_type: "self" | "friend";
  friend_name: string | null;
  closing_day: number;
  due_day: number;
  bank_code?: string | null;
};

type LegacyCreditCard = Omit<CreditCard, "owner_type" | "friend_name">;

type CardReminder = {
  id: string;
  name: string;
  owner_type: "self" | "friend";
  friend_name: string | null;
  dismissKey: string;
  status: "closed" | "expired";
  days: number;
  closingDay: number;
  dueDay: number;
};

type CardInsight = {
  usedTotal: number;
  currentStatement: number;
  nextStatement: number;
  overdueAmount: number;
  availableLimit: number;
  utilizationPercent: number;
  daysUntilClosing: number;
  daysUntilDue: number;
  statementStatus: "open" | "closed";
};

type FlowRow = {
  day: number;
  date: Date;
  income: number;
  expense: number;
  net: number;
  netDay: number;
};

type Transfer = {
  id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number | string;
  date: string;
};

type RawTransfer = Omit<Transfer, "amount"> & {
  amount?: number | string | null;
  value?: number | string | null;
};

type QuickAddEntryType = "income" | "expense" | "card_expense";

type QuickAddParseResult = {
  entryType: QuickAddEntryType | "unknown";
  amount: number | null;
  description: string | null;
  category: string | null;
  date: string | null;
  accountName: string | null;
  cardName: string | null;
  confidence: number;
  missingFields: string[];
  source: "ai" | "rules";
};

type QuickAddFormState = {
  entryType: QuickAddEntryType;
  amount: string;
  description: string;
  category: string;
  date: string;
  accountId: string | null;
  cardId: string | null;
};

type SpeechRecognitionResultEvent = Event & {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function isCardOwnershipColumnMissing(error: unknown) {
  return hasMissingColumnError(error, ["owner_type", "friend_name"]);
}

function hydrateLegacyCards(cards: LegacyCreditCard[]): CreditCard[] {
  return cards.map((card) => ({
    ...card,
    owner_type: "self",
    friend_name: null,
  }));
}

function normalizeTransactionAmounts(rows: RawTransaction[]): Transaction[] {
  return rows.map((row) => ({
    ...row,
    amount: row.amount ?? row.value ?? 0,
  }));
}

function normalizeTransferAmounts(rows: RawTransfer[]): Transfer[] {
  return rows.map((row) => ({
    ...row,
    amount: row.amount ?? row.value ?? 0,
  }));
}

type DisplayTransaction = Transaction & {
  displayId: string;
  displayDate: string;
  effectiveDate: string;
  displayAmount: number;
  isBudgetCarryover?: boolean;
};

function isCardLinkedExpense(tx: Transaction) {
  return Boolean(tx.card_id) && tx.type !== "income";
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateString(start), end: toDateString(end) };
}

function getMonthTitle(date: Date, language: "pt" | "en") {
  const month = date.getMonth();
  const year = date.getFullYear();
  return `${getMonthShortName(language, month)} ${year}`;
}

function getMonthOptions(language: "pt" | "en", total = 12) {
  const options: { label: string; value: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < total; i += 1) {
    const value = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ label: getMonthTitle(value, language), value });
  }
  return options;
}

function formatCurrency(
  value: number,
  language: "pt" | "en",
  currency: AppCurrency,
) {
  return formatCurrencyValue(value, language, currency);
}

const SALARY_CARRYOVER_DAY_LIMIT = 10;
const SALARY_HINT_KEYWORDS = ["salario", "salary", "wage", "payroll", "pagamento"];

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getTransactionsQueryEnd(date: Date) {
  return toDateString(
    new Date(date.getFullYear(), date.getMonth() + 1, SALARY_CARRYOVER_DAY_LIMIT),
  );
}

function isSalaryCarryoverCandidate(tx: Transaction, txDate: Date) {
  if (tx.type !== "income") return false;
  if (txDate.getDate() > SALARY_CARRYOVER_DAY_LIMIT) return false;

  const haystacks = [tx.description, tx.category].map(normalizeSearchText).filter(Boolean);
  return haystacks.some((text) =>
    SALARY_HINT_KEYWORDS.some((keyword) => text.includes(keyword)),
  );
}

function formatShortDate(date: Date, language: "pt" | "en") {
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function parseLocalDate(value: string) {
  const normalized = value.trim();
  const datePrefix = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePrefix) {
    const [, year, month, day] = datePrefix;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function findEntityByName<T extends { id: string; name: string }>(
  items: T[],
  name: string | null | undefined,
) {
  const target = normalizeSearchText(name);
  if (!target) return null;
  return (
    items.find((item) => normalizeSearchText(item.name) === target) ??
    items.find((item) => target.includes(normalizeSearchText(item.name))) ??
    items.find((item) => normalizeSearchText(item.name).includes(target)) ??
    null
  );
}

function buildEmptyQuickAddForm(currency: AppCurrency) {
  return {
    entryType: "expense" as QuickAddEntryType,
    amount: formatCentsInput("", currency),
    description: "",
    category: "",
    date: toDateString(new Date()),
    accountId: null,
    cardId: null,
  };
}

function isSameMonth(date: Date, month: Date) {
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

function getMonthOverMonthChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

function formatChangePercent(value: number, language: "pt" | "en") {
  const digits = Math.abs(value) < 1 ? 2 : 1;
  const rounded = Number(value.toFixed(digits));
  const safeRounded = Object.is(rounded, -0) ? 0 : rounded;
  const formatter = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const absText = formatter.format(Math.abs(safeRounded));
  if (safeRounded === 0) return `${absText}%`;
  return `${safeRounded > 0 ? "+" : "-"}${absText}%`;
}

function getChangeDirection(value: number | null) {
  if (value == null) return "neutral" as const;
  if (Math.abs(value) < 0.005) return "neutral" as const;
  return value > 0 ? ("up" as const) : ("down" as const);
}

function formatPercent(value: number, language: "pt" | "en") {
  const formatter = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatter.format(value)}%`;
}

function formatSignedCurrency(
  value: number,
  language: "pt" | "en",
  currency: AppCurrency,
) {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value), language, currency)}`;
}

function getSafeDayInMonth(year: number, month: number, day: number) {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), maxDay);
}

function getInstallmentMonthOffset(startDate: string, targetMonth: Date) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? new Date(
        Number(startDate.slice(0, 4)),
        Number(startDate.slice(5, 7)) - 1,
        Number(startDate.slice(8, 10)),
      )
    : new Date(startDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return (targetMonth.getFullYear() - parsed.getFullYear()) * 12 +
    (targetMonth.getMonth() - parsed.getMonth());
}

function getDayWord(days: number, language: "pt" | "en") {
  if (language === "pt") return days === 1 ? "dia" : "dias";
  return days === 1 ? "day" : "days";
}

const CARD_REMINDER_DISMISSALS_STORAGE_KEY = "guimfinancial:card-reminder-dismissals";

function buildCardReminderDismissKey(
  userId: string,
  cardId: string,
  status: CardReminder["status"],
  closingDay: number,
  dueDay: number,
  now = new Date(),
) {
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${userId}:${cardId}:${monthKey}:${status}:${closingDay}:${dueDay}`;
}

function loadCardReminderDismissals() {
  if (typeof window === "undefined") return {} as Record<string, true>;

  try {
    const raw = window.localStorage.getItem(CARD_REMINDER_DISMISSALS_STORAGE_KEY);
    if (!raw) return {} as Record<string, true>;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Record<string, true>>((acc, [key, value]) => {
      if (value === true) acc[key] = true;
      return acc;
    }, {});
  } catch {
    return {} as Record<string, true>;
  }
}

function saveCardReminderDismissals(next: Record<string, true>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CARD_REMINDER_DISMISSALS_STORAGE_KEY,
    JSON.stringify(next),
  );
}

function getCardExpenseDueState(tx: Transaction, targetDate: Date) {
  if (!isCardLinkedExpense(tx)) return null;

  const amount = Number(tx.amount) || 0;
  if (amount <= 0) return null;

  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  const isInstallment = totalInstallments > 0;

  if (isInstallment) {
    const paidInstallments = Math.min(
      Math.max(Number(tx.installments_paid) || 0, 0),
      totalInstallments,
    );
    const monthOffset = getInstallmentMonthOffset(tx.date, targetDate);
    const dueInstallments =
      monthOffset == null
        ? 0
        : Math.min(Math.max(monthOffset + 1, 0), totalInstallments);
    const installmentsToPay = Math.max(dueInstallments - paidInstallments, 0);
    const perInstallment = amount / totalInstallments;
    const pendingAmount = perInstallment * installmentsToPay;

    if (pendingAmount <= 0) return null;

    return { pendingAmount };
  }

  const txDate = parseLocalDate(tx.date);
  const normalizedTxDate = txDate
    ? new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate())
    : null;
  const isDueNow = normalizedTxDate ? normalizedTxDate.getTime() <= targetDate.getTime() : true;
  if (!isDueNow || tx.is_paid) return null;

  return { pendingAmount: amount };
}

function getCardExpenseSettlementUpdate(tx: Transaction, targetDate: Date) {
  if (!isCardLinkedExpense(tx)) return null;

  const amount = Number(tx.amount) || 0;
  if (amount <= 0) return null;

  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  if (totalInstallments > 0) {
    const paidInstallments = Math.min(
      Math.max(Number(tx.installments_paid) || 0, 0),
      totalInstallments,
    );
    const monthOffset = getInstallmentMonthOffset(tx.date, targetDate);
    const dueInstallments =
      monthOffset == null
        ? 0
        : Math.min(Math.max(monthOffset + 1, 0), totalInstallments);
    if (dueInstallments <= paidInstallments) return null;

    const perInstallment = amount / totalInstallments;
    return {
      update: {
        installments_paid: dueInstallments,
        is_paid: dueInstallments >= totalInstallments,
      },
      balanceDelta: perInstallment * (dueInstallments - paidInstallments),
    };
  }

  const txDate = parseLocalDate(tx.date);
  const normalizedTxDate = txDate
    ? new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate())
    : null;
  const isDueNow = normalizedTxDate ? normalizedTxDate.getTime() <= targetDate.getTime() : true;
  if (!isDueNow || tx.is_paid) return null;

  return {
    update: {
      is_paid: true,
    },
    balanceDelta: amount,
  };
}

function getSettledCardExpenseAmount(tx: Transaction) {
  if (!isCardLinkedExpense(tx)) return 0;

  const amount = Number(tx.amount) || 0;
  if (amount <= 0) return 0;

  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  if (totalInstallments > 0) {
    const paidInstallments = Math.min(
      Math.max(Number(tx.installments_paid) || 0, 0),
      totalInstallments,
    );
    return (amount / totalInstallments) * paidInstallments;
  }

  return tx.is_paid ? amount : 0;
}

function getCardChargeTiming(tx: Transaction, card: CreditCard, today: Date) {
  const txDate = parseLocalDate(tx.date);
  if (!txDate) return null;

  const closingDay = getSafeDayInMonth(txDate.getFullYear(), txDate.getMonth(), Number(card.closing_day));
  const closesThisMonth = new Date(txDate.getFullYear(), txDate.getMonth(), closingDay);
  const statementMonth =
    txDate.getTime() <= closesThisMonth.getTime()
      ? new Date(txDate.getFullYear(), txDate.getMonth(), 1)
      : new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);

  const currentStatementMonth =
    today.getDate() <= Number(card.closing_day)
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const monthDelta =
    (statementMonth.getFullYear() - currentStatementMonth.getFullYear()) * 12 +
    (statementMonth.getMonth() - currentStatementMonth.getMonth());

  if (monthDelta < 0) return "overdue" as const;
  if (monthDelta === 0) return "current" as const;
  if (monthDelta === 1) return "next" as const;
  return "future" as const;
}

function computeEffectiveAccountBalance(
  account: RawAccount,
  transactions: Transaction[],
  transfers: Transfer[],
) {
  let balance = Number(account.initial_balance) || 0;

  transactions.forEach((tx) => {
    if (tx.account_id !== account.id) return;

    const amount = Number(tx.amount) || 0;
    if (amount <= 0) return;

    if (tx.type === "income") {
      balance += amount;
      return;
    }

    if (tx.type === "expense") {
      balance -= amount;
      return;
    }

    balance -= getSettledCardExpenseAmount(tx);
  });

  transfers.forEach((transfer) => {
    const amount = Number(transfer.amount) || 0;
    if (amount <= 0) return;
    if (transfer.from_account_id === account.id) balance -= amount;
    if (transfer.to_account_id === account.id) balance += amount;
  });

  return balance;
}

function buildMonthTransfers(transfers: Transfer[], month: Date) {
  return transfers.filter((transfer) => {
    const transferDate = parseLocalDate(transfer.date);
    return transferDate ? isSameMonth(transferDate, month) : false;
  });
}

function computePeriodAccountBalance(
  accountId: string,
  transactions: DisplayTransaction[],
  transfers: Transfer[],
) {
  let balance = 0;

  transactions.forEach((tx) => {
    if (tx.account_id !== accountId) return;

    if (tx.type === "income") {
      balance += tx.displayAmount;
      return;
    }

    balance -= tx.displayAmount;
  });

  transfers.forEach((transfer) => {
    const amount = Number(transfer.amount) || 0;
    if (amount <= 0) return;
    if (transfer.from_account_id === accountId) balance -= amount;
    if (transfer.to_account_id === accountId) balance += amount;
  });

  return balance;
}

function getInitials(name?: string) {
  if (!name) return "GF";
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "GF";
}

const CATEGORY_CHART_COLORS = [
  "#F59E0B",
  "#3B82F6",
  "#22C55E",
  "#14B8A6",
  "#A78BFA",
  "#EAB308",
  "#F97316",
  "#06B6D4",
  "#10B981",
  "#EF4444",
  "#84CC16",
  "#EC4899",
  "#6366F1",
  "#2DD4BF",
  "#F43F5E",
  "#8B5CF6",
  "#0EA5E9",
  "#FB7185",
];

function getCategoryColor(index: number) {
  if (index < CATEGORY_CHART_COLORS.length) {
    return CATEGORY_CHART_COLORS[index];
  }
  // Golden-angle spread to keep fallback colors visually distant.
  const hue = (index * 137.508 + 23) % 360;
  return `hsl(${hue} 72% 56%)`;
}

function buildFlowSeries(transactions: DisplayTransaction[], monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows: FlowRow[] = Array.from({ length: daysInMonth }, (_, idx) => ({
    day: idx + 1,
    date: new Date(year, month, idx + 1),
    income: 0,
    expense: 0,
    net: 0,
    netDay: 0,
  }));

  transactions.forEach((tx) => {
    const txDate = parseLocalDate(tx.effectiveDate);
    if (!txDate || Number.isNaN(txDate.getTime())) return;
    if (txDate.getFullYear() !== year || txDate.getMonth() !== month) return;
    const dayIndex = txDate.getDate() - 1;
    const amount = tx.displayAmount;
    if (tx.type === "income") rows[dayIndex].income += amount;
    if (tx.type === "expense" || tx.type === "card_expense") {
      rows[dayIndex].expense += amount;
    }
  });

  let running = 0;
  return rows.map((row) => {
    const netDay = row.income - row.expense;
    running += netDay;
    return { ...row, net: running, netDay };
  });
}

function buildMonthTransactions(
  transactions: Transaction[],
  month: Date,
): DisplayTransaction[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  const budgetMonthEnd = toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  return transactions.flatMap((tx) => {
    const txDate = parseLocalDate(tx.date);
    if (!txDate || Number.isNaN(txDate.getTime())) return [];

    const amount = Number(tx.amount) || 0;
    const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
    const isInstallment = totalInstallments > 0;

    if (isInstallment && totalInstallments > 0) {
      const perInstallment = amount / totalInstallments;
      const entries: DisplayTransaction[] = [];
      for (let i = 0; i < totalInstallments; i += 1) {
        const installmentDate = new Date(txDate);
        installmentDate.setMonth(txDate.getMonth() + i);
        if (installmentDate < monthStart || installmentDate > monthEnd) continue;
        entries.push({
          ...tx,
          displayId: `${tx.id}-i${i + 1}`,
          displayDate: toDateString(installmentDate),
          effectiveDate: toDateString(installmentDate),
          displayAmount: perInstallment,
        });
      }
      return entries;
    }

    if (isSalaryCarryoverCandidate(tx, txDate)) {
      const assignedMonth = new Date(txDate.getFullYear(), txDate.getMonth() - 1, 1);
      if (!isSameMonth(assignedMonth, month)) return [];
      return [
        {
          ...tx,
          displayId: `${tx.id}-carry-${assignedMonth.getFullYear()}-${assignedMonth.getMonth() + 1}`,
          displayDate: toDateString(txDate),
          effectiveDate: budgetMonthEnd,
          displayAmount: amount,
          isBudgetCarryover: true,
        },
      ];
    }

    if (txDate < monthStart || txDate > monthEnd) return [];
    return [
      {
        ...tx,
        displayId: tx.id,
        displayDate: toDateString(txDate),
        effectiveDate: toDateString(txDate),
        displayAmount: amount,
      },
    ];
  }).sort((a, b) => {
    const aEffective = parseLocalDate(a.effectiveDate)?.getTime() ?? 0;
    const bEffective = parseLocalDate(b.effectiveDate)?.getTime() ?? 0;
    if (aEffective !== bEffective) return bEffective - aEffective;
    const aDisplay = parseLocalDate(a.displayDate)?.getTime() ?? 0;
    const bDisplay = parseLocalDate(b.displayDate)?.getTime() ?? 0;
    return bDisplay - aDisplay;
  });
}

export function HomeScreen() {
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [accountBalanceTotal, setAccountBalanceTotal] = useState(0);
  const [usesHistoricalAccountBalances, setUsesHistoricalAccountBalances] = useState(false);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cardTransactions, setCardTransactions] = useState<Transaction[]>([]);
  const [showBalance, setShowBalance] = useState(true);
  const [monthOpen, setMonthOpen] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [payingReminderCardId, setPayingReminderCardId] = useState<string | null>(null);
  const [dismissedCardReminderKeys, setDismissedCardReminderKeys] = useState<Record<string, true>>({});
  const [profile, setProfile] = useState<ProfileSettings>({});
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddInput, setQuickAddInput] = useState("");
  const [quickAddParsing, setQuickAddParsing] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddInfo, setQuickAddInfo] = useState<string | null>(null);
  const [quickAddListening, setQuickAddListening] = useState(false);
  const [quickAddSpeechSupported, setQuickAddSpeechSupported] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState<QuickAddParseResult | null>(null);
  const [quickAddForm, setQuickAddForm] = useState<QuickAddFormState>(() =>
    buildEmptyQuickAddForm(currency),
  );
  const quickAddRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    setProfile(loadProfileSettings());
  }, []);

  useEffect(() => {
    setQuickAddForm((current) => ({
      ...current,
      amount:
        parseCentsInput(current.amount) > 0
          ? formatCentsFromNumber(parseCentsInput(current.amount), currency)
          : formatCentsInput("", currency),
    }));
  }, [currency]);

  useEffect(() => {
    setQuickAddSpeechSupported(Boolean(getSpeechRecognitionConstructor()));
    return () => {
      quickAddRecognitionRef.current?.stop();
      quickAddRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    setDismissedCardReminderKeys(loadCardReminderDismissals());
  }, [user?.id]);

  useEffect(() => {
    function handleProfileUpdate() {
      setProfile(loadProfileSettings());
    }

    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, []);

  const monthTitle = useMemo(
    () => getMonthTitle(selectedMonth, language),
    [selectedMonth, language],
  );
  const profileSecondaryLabel = user?.email || "GuimFinancial";

  const loadData = useCallback(async () => {
    if (!user) return;
    const userId = user.id;
    setLoading(true);
    setErrorMsg(null);

    const { end } = getMonthRange(selectedMonth);
    const queryEnd = getTransactionsQueryEnd(selectedMonth);

    async function loadCardsForDashboard() {
      const cardsResult = await supabase
        .from("credit_cards")
        .select("id,name,limit_amount,owner_type,friend_name,closing_day,due_day,bank_code")
        .eq("user_id", userId)
        .order("owner_type", { ascending: true })
        .order("name", { ascending: true });

      if (!cardsResult.error) {
        return {
          data: (cardsResult.data ?? []) as CreditCard[],
          error: null as unknown,
        };
      }

      if (hasMissingColumnError(cardsResult.error, ["bank_code"])) {
        const noBankCodeCardsResult = await supabase
          .from("credit_cards")
          .select("id,name,limit_amount,owner_type,friend_name,closing_day,due_day")
          .eq("user_id", userId)
          .order("owner_type", { ascending: true })
          .order("name", { ascending: true });

        if (!noBankCodeCardsResult.error) {
          return {
            data: (noBankCodeCardsResult.data ?? []) as CreditCard[],
            error: null as unknown,
          };
        }

        if (!isCardOwnershipColumnMissing(noBankCodeCardsResult.error)) {
          return { data: [] as CreditCard[], error: noBankCodeCardsResult.error };
        }
      } else if (!isCardOwnershipColumnMissing(cardsResult.error)) {
        return { data: [] as CreditCard[], error: cardsResult.error };
      }

      const legacyCardsResult = await supabase
        .from("credit_cards")
        .select("id,name,limit_amount,closing_day,due_day")
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (legacyCardsResult.error) {
        return { data: [] as CreditCard[], error: legacyCardsResult.error };
      }

      return {
        data: hydrateLegacyCards((legacyCardsResult.data ?? []) as LegacyCreditCard[]),
        error: null as unknown,
      };
    }

    async function loadAccountsForDashboard() {
      const accountsResult = await supabase
        .from("accounts")
        .select("id,name,balance,initial_balance,bank_code")
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (!accountsResult.error) {
        return {
          data: (accountsResult.data ?? []) as RawAccount[],
          error: null as unknown,
        };
      }

      if (
        !hasMissingColumnError(accountsResult.error, ["initial_balance"]) &&
        !hasMissingColumnError(accountsResult.error, ["bank_code"])
      ) {
        return { data: [] as RawAccount[], error: accountsResult.error };
      }

      const fallbackAccountSelect =
        hasMissingColumnError(accountsResult.error, ["bank_code"]) &&
        hasMissingColumnError(accountsResult.error, ["initial_balance"])
          ? "id,name,balance"
          : hasMissingColumnError(accountsResult.error, ["bank_code"])
            ? "id,name,balance,initial_balance"
            : "id,name,balance,bank_code";

      const legacyAccountsResult = await supabase
        .from("accounts")
        .select(fallbackAccountSelect)
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (legacyAccountsResult.error) {
        return { data: [] as RawAccount[], error: legacyAccountsResult.error };
      }

      return {
        data: (legacyAccountsResult.data ?? []) as unknown as RawAccount[],
        error: null as unknown,
      };
    }

    async function loadTransactionsForDashboard() {
      const transactionsResult = await supabase
        .from("transactions")
        .select("id,type,amount,value,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid")
        .eq("user_id", userId)
        .lte("date", queryEnd)
        .order("date", { ascending: false });

      if (!transactionsResult.error) {
        return {
          data: normalizeTransactionAmounts((transactionsResult.data ?? []) as RawTransaction[]),
          error: null as unknown,
        };
      }

      if (!hasMissingColumnError(transactionsResult.error, ["value", "amount"])) {
        return { data: [] as Transaction[], error: transactionsResult.error };
      }

      const fallbackSelect = hasMissingColumnError(transactionsResult.error, ["value"])
        ? "id,type,amount,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid"
        : "id,type,value,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid";

      const legacyTransactionsResult = await supabase
        .from("transactions")
        .select(fallbackSelect)
        .eq("user_id", userId)
        .lte("date", queryEnd)
        .order("date", { ascending: false });

      if (legacyTransactionsResult.error) {
        return { data: [] as Transaction[], error: legacyTransactionsResult.error };
      }

      return {
        data: normalizeTransactionAmounts((legacyTransactionsResult.data ?? []) as RawTransaction[]),
        error: null as unknown,
      };
    }

    async function loadCardTransactionsForDashboard() {
      const cardTransactionsResult = await supabase
        .from("transactions")
        .select("id,type,amount,value,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid")
        .eq("user_id", userId)
        .not("card_id", "is", null)
        .order("date", { ascending: false });

      if (!cardTransactionsResult.error) {
        return {
          data: normalizeTransactionAmounts((cardTransactionsResult.data ?? []) as RawTransaction[]),
          error: null as unknown,
        };
      }

      if (!hasMissingColumnError(cardTransactionsResult.error, ["value", "amount"])) {
        return { data: [] as Transaction[], error: cardTransactionsResult.error };
      }

      const fallbackSelect = hasMissingColumnError(cardTransactionsResult.error, ["value"])
        ? "id,type,amount,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid"
        : "id,type,value,date,account_id,card_id,description,category,is_installment,installment_total,installments_paid,is_paid";

      const legacyCardTransactionsResult = await supabase
        .from("transactions")
        .select(fallbackSelect)
        .eq("user_id", userId)
        .not("card_id", "is", null)
        .order("date", { ascending: false });

      if (legacyCardTransactionsResult.error) {
        return { data: [] as Transaction[], error: legacyCardTransactionsResult.error };
      }

      return {
        data: normalizeTransactionAmounts((legacyCardTransactionsResult.data ?? []) as RawTransaction[]),
        error: null as unknown,
      };
    }

    async function loadTransfersForDashboard() {
      const transfersResult = await supabase
        .from("transfers")
        .select("id,from_account_id,to_account_id,amount,value,date")
        .eq("user_id", userId)
        .lte("date", end)
        .order("date", { ascending: false });

      if (!transfersResult.error) {
        return {
          data: normalizeTransferAmounts((transfersResult.data ?? []) as RawTransfer[]),
          error: null as unknown,
        };
      }

      if (!hasMissingColumnError(transfersResult.error, ["value", "amount"])) {
        return { data: [] as Transfer[], error: transfersResult.error };
      }

      const fallbackSelect = hasMissingColumnError(transfersResult.error, ["value"])
        ? "id,from_account_id,to_account_id,amount,date"
        : "id,from_account_id,to_account_id,value,date";

      const legacyTransfersResult = await supabase
        .from("transfers")
        .select(fallbackSelect)
        .eq("user_id", userId)
        .lte("date", end)
        .order("date", { ascending: false });

      if (legacyTransfersResult.error) {
        return { data: [] as Transfer[], error: legacyTransfersResult.error };
      }

      return {
        data: normalizeTransferAmounts((legacyTransfersResult.data ?? []) as RawTransfer[]),
        error: null as unknown,
      };
    }

    try {
      const [
        accountsResult,
        transactionsResult,
        cardTransactionsResult,
        cardsResult,
        transfersResult,
      ] = await Promise.all([
        loadAccountsForDashboard(),
        loadTransactionsForDashboard(),
        loadCardTransactionsForDashboard(),
        loadCardsForDashboard(),
        loadTransfersForDashboard(),
      ]);

      if (
        accountsResult.error ||
        transactionsResult.error ||
        cardTransactionsResult.error ||
        cardsResult.error ||
        transfersResult.error
      ) {
        const error =
          accountsResult.error ||
          transactionsResult.error ||
          cardTransactionsResult.error ||
          cardsResult.error ||
          transfersResult.error;
        if (isTransientNetworkError(error)) {
          console.warn("[home] supabase load error:", getErrorMessage(error));
        } else {
          console.error("Supabase load error", getErrorMessage(error), error);
        }
        const errorCode =
          error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : null;
        if (errorCode === "42P01") {
          setErrorMsg(t("home.schemaMissing"));
        } else {
          setErrorMsg(t("home.dataLoadError"));
        }
        setLoading(false);
        return;
      }

      const transactions = transactionsResult.data;
      const nextCardTransactions = cardTransactionsResult.data;
      const transfers = transfersResult.data;
      const monthTx = buildMonthTransactions(transactions, selectedMonth);
      const monthTransfers = buildMonthTransfers(transfers, selectedMonth);
      const hasHistoricalAccountBalances =
        accountsResult.data.length > 0 &&
        accountsResult.data.every((account) => account.initial_balance != null);
      const hasStoredAccountBalances =
        accountsResult.data.length > 0 &&
        accountsResult.data.every((account) => account.balance != null);
      const nextAccounts = accountsResult.data.map((account) => {
        const storedBalance =
          account.balance != null && Number.isFinite(Number(account.balance))
            ? Number(account.balance)
            : null;
        return {
          id: account.id,
          name: account.name,
          bank_code: account.bank_code ?? null,
          balance:
            storedBalance ??
            (hasHistoricalAccountBalances
              ? computeEffectiveAccountBalance(account, transactions, transfers)
              : computePeriodAccountBalance(account.id, monthTx, monthTransfers)),
        } satisfies Account;
      });
      const nextCards = (cardsResult.data ?? []) as CreditCard[];

      const total = nextAccounts.reduce(
        (sum, account) => sum + (Number(account.balance) || 0),
        0,
      );
      const monthIncome = monthTx.reduce((sum, tx) => {
        return tx.type === "income" ? sum + tx.displayAmount : sum;
      }, 0);
      const monthExpenses = monthTx.reduce((sum, tx) => {
        return tx.type === "expense" || tx.type === "card_expense"
          ? sum + tx.displayAmount
          : sum;
      }, 0);
      const monthNet = monthIncome - monthExpenses;
      const hasMonthActivity = monthIncome > 0 || monthExpenses > 0;

      setTotalBalance(hasMonthActivity ? monthNet : total);
      setAccountBalanceTotal(total);
      setUsesHistoricalAccountBalances(!hasStoredAccountBalances && hasHistoricalAccountBalances);
      setIncome(monthIncome);
      setExpenses(monthExpenses);
      setAccounts(nextAccounts);
      setCards(nextCards);
      setTransactions(transactions);
      setCardTransactions(nextCardTransactions);
      setLoading(false);
    } catch (error) {
      if (isTransientNetworkError(error)) {
        console.warn("[home] supabase request failed:", getErrorMessage(error));
      } else {
        console.error("[home] unexpected load error:", error);
      }
      setErrorMsg(t("home.dataLoadError"));
      setLoading(false);
    }
  }, [selectedMonth, t, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function handleRefresh() {
      loadData();
    }

    window.addEventListener("data-refresh", handleRefresh);
    return () => window.removeEventListener("data-refresh", handleRefresh);
  }, [loadData]);

  const monthOptions = useMemo(
    () => getMonthOptions(language),
    [language],
  );

  const monthTransactions = useMemo(
    () => buildMonthTransactions(transactions, selectedMonth),
    [transactions, selectedMonth],
  );

  const flowSeries = useMemo(
    () => buildFlowSeries(monthTransactions, selectedMonth),
    [monthTransactions, selectedMonth],
  );
  const flowMetrics = useMemo(() => {
    const days = flowSeries.length || 1;
    const totalIncome = flowSeries.reduce((sum, row) => sum + row.income, 0);
    const totalExpense = flowSeries.reduce((sum, row) => sum + row.expense, 0);
    const maxIncomeDay = flowSeries.reduce(
      (acc, row) => (row.income > acc.value ? { date: row.date, value: row.income } : acc),
      { date: selectedMonth, value: 0 },
    );
    const maxExpenseDay = flowSeries.reduce(
      (acc, row) => (row.expense > acc.value ? { date: row.date, value: row.expense } : acc),
      { date: selectedMonth, value: 0 },
    );

    return {
      totalIncome,
      totalExpense,
      avgIncome: totalIncome / days,
      avgExpense: totalExpense / days,
      netTotal: totalIncome - totalExpense,
      avgNet: (totalIncome - totalExpense) / days,
      maxIncomeDay: {
        label: maxIncomeDay.value ? formatShortDate(maxIncomeDay.date, language) : "--",
        value: maxIncomeDay.value,
      },
      maxExpenseDay: {
        label: maxExpenseDay.value ? formatShortDate(maxExpenseDay.date, language) : "--",
        value: maxExpenseDay.value,
      },
    };
  }, [flowSeries, selectedMonth, language]);

  const monthOverMonth = useMemo(() => {
    const previousMonth = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() - 1,
      1,
    );
    const previousMonthTransactions = buildMonthTransactions(transactions, previousMonth);
    const previousIncome = previousMonthTransactions.reduce((sum, tx) => {
      return tx.type === "income" ? sum + tx.displayAmount : sum;
    }, 0);
    const previousExpenses = previousMonthTransactions.reduce((sum, tx) => {
      return tx.type === "expense" || tx.type === "card_expense"
        ? sum + tx.displayAmount
        : sum;
    }, 0);

    return {
      incomePct: getMonthOverMonthChange(income, previousIncome),
      expensesPct: getMonthOverMonthChange(expenses, previousExpenses),
    };
  }, [expenses, income, selectedMonth, transactions]);
  const incomeDirection = getChangeDirection(monthOverMonth.incomePct);
  const expensesDirection = getChangeDirection(monthOverMonth.expensesPct);

  const monthProgress = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const currentMonthKey = now.getFullYear() * 12 + now.getMonth();
    const selectedMonthKey = year * 12 + month;

    if (selectedMonthKey < currentMonthKey) {
      return { daysInMonth, elapsedDays: daysInMonth };
    }
    if (selectedMonthKey > currentMonthKey) {
      return { daysInMonth, elapsedDays: 0 };
    }
    return { daysInMonth, elapsedDays: now.getDate() };
  }, [selectedMonth]);

  const monthProjection = useMemo(() => {
    if (monthProgress.elapsedDays <= 0) return null;
    const projectedIncome = (income / monthProgress.elapsedDays) * monthProgress.daysInMonth;
    const projectedExpense = (expenses / monthProgress.elapsedDays) * monthProgress.daysInMonth;
    return {
      income: projectedIncome,
      expense: projectedExpense,
      net: projectedIncome - projectedExpense,
    };
  }, [expenses, income, monthProgress]);

  const monthNet = income - expenses;
  const savingsRate = income > 0 ? (monthNet / income) * 100 : null;
  const expensePressure = income > 0 ? (expenses / income) * 100 : null;
  const expensePressureWidth = expensePressure == null ? 0 : Math.min(100, expensePressure);
  const expensePressureTone =
    expensePressure == null
      ? "bg-[#5DA7FF]"
      : expensePressure <= 70
        ? "bg-emerald-400"
        : expensePressure <= 100
          ? "bg-amber-400"
          : "bg-rose-400";

  const categoryChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    monthTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      const key = tx.category?.trim() || (language === "pt" ? "Sem categoria" : "No category");
      totals[key] = (totals[key] ?? 0) + tx.displayAmount;
    });
    const sortedCategories = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const total = sortedCategories.reduce((sum, [, value]) => sum + value, 0);
    const divisor = total > 0 ? total : 1;
    return sortedCategories.map(([name, value], index) => ({
      name,
      value,
      percent: (value / divisor) * 100,
      color: getCategoryColor(index),
    }));
  }, [monthTransactions, language]);

  const categoryPaddingAngle = useMemo(() => {
    if (categoryChartData.length <= 4) return 1.8;
    if (categoryChartData.length <= 8) return 1.2;
    if (categoryChartData.length <= 14) return 0.8;
    return 0.4;
  }, [categoryChartData.length]);

  const totalCategoryAmount = useMemo(
    () => categoryChartData.reduce((sum, category) => sum + category.value, 0),
    [categoryChartData],
  );

  const highlightedCategory = useMemo(() => {
    if (categoryChartData.length === 0) return null;
    if (activeCategoryIndex == null) return categoryChartData[0];
    return categoryChartData[activeCategoryIndex] ?? categoryChartData[0];
  }, [activeCategoryIndex, categoryChartData]);

  useEffect(() => {
    if (activeCategoryIndex == null) return;
    if (activeCategoryIndex >= categoryChartData.length) {
      setActiveCategoryIndex(null);
    }
  }, [activeCategoryIndex, categoryChartData.length]);

  const cardPendingDueById = useMemo(() => {
    const pendingByCard: Record<string, number> = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    cardTransactions.forEach((tx) => {
      const dueState = getCardExpenseDueState(tx, today);
      if (!dueState || !tx.card_id) return;
      pendingByCard[tx.card_id] = (pendingByCard[tx.card_id] ?? 0) + dueState.pendingAmount;
    });

    return pendingByCard;
  }, [cardTransactions]);

  const cardReminders = useMemo<CardReminder[]>(() => {
    if (!user) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const year = today.getFullYear();
    const month = today.getMonth();

    return cards
      .map((card) => {
        const closingDay = Number(card.closing_day);
        const dueDay = Number(card.due_day);
        const pendingDue = cardPendingDueById[card.id] ?? 0;
        if (
          !Number.isFinite(closingDay) ||
          !Number.isFinite(dueDay) ||
          closingDay < 1 ||
          closingDay > 31 ||
          dueDay < 1 ||
          dueDay > 31 ||
          pendingDue <= 0
        ) {
          return null;
        }

        const closingDate = new Date(
          year,
          month,
          getSafeDayInMonth(year, month, closingDay),
        );
        const dueDate = new Date(year, month, getSafeDayInMonth(year, month, dueDay));

        if (today > dueDate) {
          const days = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          return {
            id: card.id,
            name: card.name,
            owner_type: card.owner_type ?? "self",
            friend_name: card.friend_name ?? null,
            dismissKey: buildCardReminderDismissKey(
              user.id,
              card.id,
              "expired",
              closingDay,
              dueDay,
              today,
            ),
            status: "expired" as const,
            days,
            closingDay,
            dueDay,
          };
        }

        if (today >= closingDate) {
          const days = Math.floor(
            (today.getTime() - closingDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          return {
            id: card.id,
            name: card.name,
            owner_type: card.owner_type ?? "self",
            friend_name: card.friend_name ?? null,
            dismissKey: buildCardReminderDismissKey(
              user.id,
              card.id,
              "closed",
              closingDay,
              dueDay,
              today,
            ),
            status: "closed" as const,
            days,
            closingDay,
            dueDay,
          };
        }

        return null;
      })
      .filter((card): card is CardReminder => Boolean(card))
      .filter((card) => !dismissedCardReminderKeys[card.dismissKey])
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
        if (a.days !== b.days) return b.days - a.days;
        return a.name.localeCompare(b.name);
      });
  }, [cards, cardPendingDueById, dismissedCardReminderKeys, user]);

  const cardUsedById = useMemo(() => {
    const usage: Record<string, number> = {};

    cardTransactions.forEach((tx) => {
      if (!isCardLinkedExpense(tx) || !tx.card_id) return;

      const amount = Number(tx.amount) || 0;
      if (amount <= 0) return;

      let outstanding = amount;
      const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
      const isInstallment = totalInstallments > 0;

      if (isInstallment) {
        const paidInstallments = Math.min(
          Math.max(Number(tx.installments_paid) || 0, 0),
          totalInstallments,
        );
        const paidAmount = (amount / totalInstallments) * paidInstallments;
        outstanding = Math.max(amount - paidAmount, 0);
      } else if (tx.is_paid) {
        outstanding = 0;
      }

      usage[tx.card_id] = (usage[tx.card_id] ?? 0) + outstanding;
    });

    return usage;
  }, [cardTransactions]);

  const cardUsedTotal = useMemo(
    () => Object.values(cardUsedById).reduce((sum, value) => sum + value, 0),
    [cardUsedById],
  );
  const cardInsightsById = useMemo<Record<string, CardInsight>>(() => {
    const today = new Date();
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const insights: Record<string, CardInsight> = {};

    cards.forEach((card) => {
      const limitAmount = Number(card.limit_amount) || 0;
      const closingDay = Number(card.closing_day) || 1;
      const dueDay = Number(card.due_day) || 1;
      const currentClosingDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth(), closingDay),
      );
      const nextClosingDate =
        currentDate.getTime() <= currentClosingDate.getTime()
          ? currentClosingDate
          : new Date(
              currentDate.getFullYear(),
              currentDate.getMonth() + 1,
              getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth() + 1, closingDay),
            );
      const currentDueDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth(), dueDay),
      );
      const nextDueDate =
        currentDate.getTime() <= currentDueDate.getTime()
          ? currentDueDate
          : new Date(
              currentDate.getFullYear(),
              currentDate.getMonth() + 1,
              getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth() + 1, dueDay),
            );

      const usedTotal = cardUsedById[card.id] ?? 0;
      let currentStatement = 0;
      let nextStatement = 0;
      let overdueAmount = 0;

      cardTransactions.forEach((tx) => {
        if (!isCardLinkedExpense(tx) || tx.card_id !== card.id) return;

        const amount = Number(tx.amount) || 0;
        if (amount <= 0) return;

        const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
        const paidInstallments = Math.min(
          Math.max(Number(tx.installments_paid) || 0, 0),
          totalInstallments,
        );

        if (totalInstallments > 0) {
          const perInstallment = amount / totalInstallments;
          const txDate = parseLocalDate(tx.date);
          if (!txDate) return;

          for (let index = paidInstallments; index < totalInstallments; index += 1) {
            const installmentDate = new Date(txDate.getFullYear(), txDate.getMonth() + index, txDate.getDate());
            const installmentTx = {
              ...tx,
              date: toDateString(installmentDate),
              amount: perInstallment,
              installment_total: null,
              installments_paid: null,
              is_paid: false,
            } satisfies Transaction;
            const timing = getCardChargeTiming(installmentTx, card, currentDate);
            if (timing === "overdue") overdueAmount += perInstallment;
            if (timing === "current") currentStatement += perInstallment;
            if (timing === "next") nextStatement += perInstallment;
          }
          return;
        }

        if (tx.is_paid) return;
        const timing = getCardChargeTiming(tx, card, currentDate);
        if (timing === "overdue") overdueAmount += amount;
        if (timing === "current") currentStatement += amount;
        if (timing === "next") nextStatement += amount;
      });

      insights[card.id] = {
        usedTotal,
        currentStatement,
        nextStatement,
        overdueAmount,
        availableLimit: Math.max(limitAmount - usedTotal, 0),
        utilizationPercent: limitAmount > 0 ? Math.min((usedTotal / limitAmount) * 100, 100) : 0,
        daysUntilClosing: Math.max(
          Math.ceil((nextClosingDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        ),
        daysUntilDue: Math.max(
          Math.ceil((nextDueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        ),
        statementStatus: currentStatement + overdueAmount > 0 ? "closed" : "open",
      };
    });

    return insights;
  }, [cards, cardTransactions, cardUsedById]);
  const openStatementsCount = useMemo(
    () => cards.filter((card) => (cardInsightsById[card.id]?.statementStatus ?? "open") === "open").length,
    [cards, cardInsightsById],
  );
  const closedStatementsCount = useMemo(
    () => cards.filter((card) => (cardInsightsById[card.id]?.statementStatus ?? "open") === "closed").length,
    [cards, cardInsightsById],
  );
  const positiveAccountsCount = useMemo(
    () => accounts.filter((account) => (Number(account.balance) || 0) > 0).length,
    [accounts],
  );
  const averageAccountBalance = useMemo(
    () => (accounts.length ? accountBalanceTotal / accounts.length : 0),
    [accountBalanceTotal, accounts.length],
  );
  const largestAccount = useMemo(() => {
    if (!accounts.length) return null;
    return [...accounts].sort(
      (a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0),
    )[0] ?? null;
  }, [accounts]);
  const displayName =
    (user?.user_metadata?.username as string | undefined) ||
    profile.name ||
    user?.email ||
    "Guim Financial";
  const metadataAvatar =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url.trim()
      : "";
  const avatarSrc = (profile.avatarUrl ?? "").trim() || metadataAvatar;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  function resetQuickAddState() {
    quickAddRecognitionRef.current?.stop();
    quickAddRecognitionRef.current = null;
    setQuickAddListening(false);
    setQuickAddInput("");
    setQuickAddParsing(false);
    setQuickAddSaving(false);
    setQuickAddError(null);
    setQuickAddInfo(null);
    setQuickAddResult(null);
    setQuickAddForm(buildEmptyQuickAddForm(currency));
  }

  function openQuickAddModal() {
    resetQuickAddState();
    setQuickAddOpen(true);
  }

  function closeQuickAddModal() {
    if (quickAddSaving) return;
    resetQuickAddState();
    setQuickAddOpen(false);
  }

  async function updateAccountBalance(accountId: string, delta: number) {
    if (!user) return;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    const nextBalance = (Number(account.balance) || 0) + delta;
    await supabase
      .from("accounts")
      .update({ balance: nextBalance })
      .eq("id", accountId)
      .eq("user_id", user.id);
  }

  function applyQuickAddResult(result: QuickAddParseResult) {
    const matchedAccount = findEntityByName(accounts, result.accountName);
    const matchedCard = findEntityByName(cards, result.cardName);
    const nextType =
      result.entryType === "unknown" ? "expense" : result.entryType;

    setQuickAddResult(result);
    setQuickAddForm({
      entryType: nextType,
      amount:
        result.amount && result.amount > 0
          ? formatCentsFromNumber(result.amount, currency)
          : formatCentsInput("", currency),
      description: result.description ?? "",
      category: result.category ?? "",
      date: result.date ?? toDateString(new Date()),
      accountId: matchedAccount?.id ?? null,
      cardId: matchedCard?.id ?? null,
    });
  }

  async function handleParseQuickAdd(textOverride?: string) {
    const rawText = (textOverride ?? quickAddInput).trim();
    if (!rawText) {
      setQuickAddError(
        language === "pt"
          ? "Digite ou fale o lancamento que voce quer adicionar."
          : "Type or speak the entry you want to add.",
      );
      return;
    }

    setQuickAddParsing(true);
    setQuickAddError(null);
    setQuickAddInfo(null);

    try {
      const response = await fetch("/api/quick-add-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText,
          language,
          today: toDateString(new Date()),
          accounts: accounts.map((account) => account.name),
          cards: cards.map((card) => card.name),
        }),
      });

      const payload = (await response.json()) as { result?: QuickAddParseResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "parse_failed");
      }

      applyQuickAddResult(payload.result);
      setQuickAddInfo(
        payload.result.source === "ai"
          ? language === "pt"
            ? "Interpretado com IA. Confira antes de salvar."
            : "Interpreted with AI. Please review before saving."
          : language === "pt"
            ? "Interpretacao rapida pronta. Confira antes de salvar."
            : "Quick interpretation ready. Please review before saving.",
      );
    } catch (error) {
      console.error("Quick add parse error:", error);
      setQuickAddError(
        language === "pt"
          ? "Nao consegui interpretar esse lancamento agora."
          : "I couldn't interpret that entry right now.",
      );
    } finally {
      setQuickAddParsing(false);
    }
  }

  function handleStartQuickAddListening() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setQuickAddError(
        language === "pt"
          ? "O navegador nao suporta entrada por voz aqui."
          : "This browser does not support voice input here.",
      );
      return;
    }

    quickAddRecognitionRef.current?.stop();

    const recognition = new Recognition();
    quickAddRecognitionRef.current = recognition;
    recognition.lang = language === "pt" ? "pt-BR" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      setQuickAddListening(false);
      quickAddRecognitionRef.current = null;
      if (!transcript) return;
      setQuickAddInput(transcript);
      void handleParseQuickAdd(transcript);
    };
    recognition.onerror = (event) => {
      setQuickAddListening(false);
      quickAddRecognitionRef.current = null;
      const errorCode = event.error ?? "unknown";
      let message: string;

      if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
        message =
          language === "pt"
            ? "Permita o uso do microfone no navegador para falar com o app."
            : "Allow microphone access in your browser to speak to the app.";
      } else if (errorCode === "network") {
        message =
          language === "pt"
            ? "A voz falhou por rede ou indisponibilidade do servico. Voce pode digitar normalmente."
            : "Voice failed due to a network or service issue. You can type normally instead.";
      } else if (errorCode === "no-speech" || errorCode === "audio-capture") {
        message =
          language === "pt"
            ? "Nao ouvi sua fala. Tente novamente ou digite o lancamento."
            : "I couldn't hear your speech. Try again or type the entry.";
      } else if (errorCode === "aborted") {
        message =
          language === "pt"
            ? "A captura de voz foi cancelada."
            : "Voice capture was cancelled.";
      } else {
        message =
          language === "pt"
            ? "Nao foi possivel capturar sua voz agora. Voce pode digitar o lancamento."
            : "I couldn't capture your voice right now. You can type the entry instead.";
      }

      setQuickAddInfo(null);
      setQuickAddError(message);
    };
    recognition.onend = () => {
      setQuickAddListening(false);
      quickAddRecognitionRef.current = null;
    };

    setQuickAddError(null);
    setQuickAddInfo(
      language === "pt" ? "Ouvindo voce..." : "Listening...",
    );
    setQuickAddListening(true);
    recognition.start();
  }

  async function handleSaveQuickAdd() {
    if (!user) return;

    const parsedAmount = parseCentsInput(quickAddForm.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setQuickAddError(t("newEntry.amountError"));
      return;
    }

    if (
      (quickAddForm.entryType === "income" || quickAddForm.entryType === "expense") &&
      !quickAddForm.accountId
    ) {
      setQuickAddError(t("newEntry.selectAccountError"));
      return;
    }

    if (quickAddForm.entryType === "card_expense" && !quickAddForm.cardId) {
      setQuickAddError(t("newEntry.selectCardError"));
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError(null);

    const { error } = await supabase.from("transactions").insert([
      {
        user_id: user.id,
        type: quickAddForm.entryType,
        account_id:
          quickAddForm.entryType === "income" || quickAddForm.entryType === "expense"
            ? quickAddForm.accountId
            : null,
        card_id: quickAddForm.entryType === "card_expense" ? quickAddForm.cardId : null,
        amount: parsedAmount,
        description: quickAddForm.description.trim() || null,
        category: quickAddForm.category.trim() || null,
        date: quickAddForm.date,
        is_fixed: quickAddForm.entryType !== "income" ? false : null,
        is_installment: null,
        installment_total: null,
        installments_paid: null,
        is_paid: null,
      },
    ]);

    if (error) {
      console.error("Quick add save error:", error);
      setQuickAddSaving(false);
      setQuickAddError(t("newEntry.saveError"));
      return;
    }

    if (quickAddForm.entryType === "income" || quickAddForm.entryType === "expense") {
      const delta = quickAddForm.entryType === "income" ? parsedAmount : -parsedAmount;
      await updateAccountBalance(quickAddForm.accountId!, delta);
    }

    setQuickAddSaving(false);
    closeQuickAddModal();
    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleRemoveAccount(accountId: string, accountName: string) {
    if (!user) return;
    if (deletingAccountId) return;
    const ok = window.confirm(
      `Tem certeza que deseja remover a conta "${accountName}"?`,
    );
    if (!ok) return;

    setDeletingAccountId(accountId);
    const { error: txError } = await supabase
      .from("transactions")
      .delete()
      .eq("account_id", accountId);
    if (txError) {
      console.error("Error deleting account transactions:", txError);
      setDeletingAccountId(null);
      return;
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", user.id);
    setDeletingAccountId(null);
    if (error) {
      console.error("Error deleting account:", error);
      return;
    }

    loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleRemoveCard(cardId: string, cardName: string) {
    if (!user) return;
    if (deletingCardId) return;
    const ok = window.confirm(
      `Tem certeza que deseja remover o cartao "${cardName}"?`,
    );
    if (!ok) return;

    setDeletingCardId(cardId);
    const { error } = await supabase
      .from("credit_cards")
      .delete()
      .eq("id", cardId)
      .eq("user_id", user.id);
    setDeletingCardId(null);
    if (error) {
      console.error("Error deleting credit card:", error);
      return;
    }

    loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleMarkCardReminderPaid(card: CardReminder) {
    if (!user) return;
    if (payingReminderCardId) return;

    const confirmationMessage = language === "pt"
      ? `Marcar a fatura do cartão "${card.name}" como paga?`
      : `Mark the "${card.name}" card statement as paid?`;
    if (!window.confirm(confirmationMessage)) return;

    setErrorMsg(null);
    setPayingReminderCardId(card.id);

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueTransactions = cardTransactions
        .filter((tx) => tx.card_id === card.id)
        .map((tx) => ({ tx, settlement: getCardExpenseSettlementUpdate(tx, today) }))
        .filter(
          (
            item,
          ): item is {
            tx: Transaction;
            settlement: NonNullable<ReturnType<typeof getCardExpenseSettlementUpdate>>;
          } => Boolean(item.settlement),
        );

      for (const item of dueTransactions) {
        const { error } = await supabase
          .from("transactions")
          .update(item.settlement.update)
          .eq("id", item.tx.id)
          .eq("user_id", user.id);

        if (error) {
          throw error;
        }

        if (item.tx.account_id && Number.isFinite(item.settlement.balanceDelta)) {
          await updateAccountBalance(item.tx.account_id, -item.settlement.balanceDelta);
        }
      }

      const nextDismissals = {
        ...dismissedCardReminderKeys,
        [card.dismissKey]: true as const,
      };
      saveCardReminderDismissals(nextDismissals);
      setDismissedCardReminderKeys(nextDismissals);
      await loadData();
      window.dispatchEvent(new Event("data-refresh"));
    } catch (error) {
      console.error("Error marking card reminder paid:", error);
      setErrorMsg(t("home.cardReminderMarkPaidError"));
    } finally {
      setPayingReminderCardId(null);
    }
  }

  const FlowTooltip = ({ active, payload, label }: TooltipContentProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as FlowRow | undefined;
    if (!row) return null;
    return (
      <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3 text-xs text-[#E4E7EC] shadow-lg">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#8B94A6]">
          Dia {label}
        </p>
        <div className="mt-2 grid gap-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#67D6B2]">{t("home.income")}</span>
            <span className="font-semibold">{formatCurrency(row.income, language, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#F0A3A3]">{t("home.expenses")}</span>
            <span className="font-semibold">{formatCurrency(row.expense, language, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#EAC37A]">Saldo diario</span>
            <span className="font-semibold">{formatCurrency(row.netDay, language, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#9AB0C9]">Saldo acumulado</span>
            <span className="font-semibold">{formatCurrency(row.net, language, currency)}</span>
          </div>
        </div>
      </div>
    );
  };

  const CategoryTooltip = ({ active, payload }: TooltipContentProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload as
      | { name: string; value: number; percent: number }
      | undefined;
    if (!item) return null;
    return (
      <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3 text-xs text-[#E4E7EC] shadow-lg">
        <p className="font-semibold text-[#E7ECF2]">{item.name}</p>
        <p className="mt-1 text-[#9AA3B2]">{formatCurrency(item.value, language, currency)}</p>
        <p className="text-[#9AA3B2]">{formatPercent(item.percent, language)}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-lg font-semibold text-[#E2E6ED]">{monthTitle}</p>
            <p className="text-xs text-[#9098A6]">
              {selectedMonth.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMonthOpen((value) => !value)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1A2230] bg-[#111723]"
            >
              <AppIcon name="chevron-down" size={18} color="#A3ABB9" />
            </button>
            {monthOpen ? (
              <div className="absolute left-0 top-11 z-20 w-44 rounded-2xl border border-[#1B2230] bg-[#111723] p-2 text-xs text-[#C7CEDA] shadow-xl">
                {monthOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-[#151A27]"
                    onClick={() => {
                      setSelectedMonth(option.value);
                      setMonthOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-[#8B94A6] hover:bg-[#151A27]"
                  onClick={() => setMonthOpen(false)}
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <button
            type="button"
            onClick={openQuickAddModal}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#245A55] bg-[#123430] px-3 py-2 text-xs font-semibold text-[#7AF0D0] transition hover:border-[#2D7A72] hover:bg-[#15413B]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2A8A7D] bg-[#0F141E]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4a3 3 0 013 3v5a3 3 0 01-6 0V7a3 3 0 013-3z" />
                <path d="M19 11a7 7 0 01-14 0" />
                <path d="M12 18v3" />
                <path d="M8 21h8" />
              </svg>
            </span>
            <span className="sm:hidden">{language === "pt" ? "Voz" : "Voice"}</span>
            <span className="hidden sm:inline">
              {language === "pt" ? "Entrada rapida" : "Quick add"}
            </span>
          </button>
          <Link href="/profile" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#1A2230] bg-[#101620] text-xs font-semibold text-[#E2E6ED] transition group-hover:border-[#2B364B]">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt="Profile avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-[#E2E6ED]">{displayName}</span>
              <span className="text-[10px] text-[#8B94A6]">{profileSecondaryLabel}</span>
            </div>
          </Link>
        </div>
      </div>

      {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

      {quickAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#060A11]/80 px-3 pb-3 pt-16 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#1E2A3C] bg-[#0E1420] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="sticky top-0 z-10 border-b border-[#1B2330] bg-[#0E1420]/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-[#E7ECF2]">
                    {language === "pt" ? "Entrada rapida com voz" : "Voice quick add"}
                  </p>
                  <p className="mt-1 text-xs text-[#8B94A6]">
                    {language === "pt"
                      ? "Fale ou digite um lancamento, revise e salve."
                      : "Speak or type an entry, review it, and save."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeQuickAddModal}
                  className="rounded-full border border-[#263043] bg-[#111826] px-3 py-1 text-xs text-[#A8B2C3] transition hover:border-[#344159] hover:text-[#E7ECF2]"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-[#1B2433] bg-[#111826] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7EEAD5]">
                  {language === "pt" ? "Comando" : "Command"}
                </p>
                <p className="mt-1 text-xs text-[#8B94A6]">
                  {language === "pt"
                    ? 'Ex.: "adicione uma despesa no cartao nubank de 56 reais do uber ontem"'
                    : 'Ex.: "add a 56 card expense on Nubank for Uber yesterday"'}
                </p>
                <textarea
                  value={quickAddInput}
                  onChange={(event) => setQuickAddInput(event.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-2xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none transition placeholder:text-[#627086] focus:border-[#2B8C80]"
                  placeholder={
                    language === "pt"
                      ? "Descreva o lancamento em linguagem natural"
                      : "Describe the entry in natural language"
                  }
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleParseQuickAdd()}
                    disabled={quickAddParsing || quickAddSaving}
                    className="rounded-full border border-[#2A8A7D] bg-[#143A34] px-4 py-2 text-xs font-semibold text-[#7AF0D0] transition hover:border-[#35B7A6] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {quickAddParsing
                      ? language === "pt"
                        ? "Interpretando..."
                        : "Interpreting..."
                      : language === "pt"
                        ? "Interpretar"
                        : "Interpret"}
                  </button>
                  <button
                    type="button"
                    onClick={handleStartQuickAddListening}
                    disabled={!quickAddSpeechSupported || quickAddListening || quickAddSaving}
                    className="rounded-full border border-[#2B364B] bg-[#111826] px-4 py-2 text-xs font-semibold text-[#C7D0DD] transition hover:border-[#4A5D79] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {quickAddListening
                      ? language === "pt"
                        ? "Ouvindo..."
                        : "Listening..."
                      : language === "pt"
                        ? "Usar voz"
                        : "Use voice"}
                  </button>
                  {!quickAddSpeechSupported ? (
                    <span className="text-[11px] text-[#8B94A6]">
                      {language === "pt"
                        ? "Seu navegador nao liberou voz aqui, mas o texto continua funcionando."
                        : "Your browser does not support voice here, but text still works."}
                    </span>
                  ) : null}
                </div>
              </div>

              {quickAddError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {quickAddError}
                </div>
              ) : null}

              {quickAddInfo ? (
                <div className="rounded-2xl border border-[#2A8A7D]/35 bg-[#123430]/55 px-4 py-3 text-sm text-[#A9F5E5]">
                  {quickAddInfo}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#1B2433] bg-[#111826] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#E7ECF2]">
                      {language === "pt" ? "Confirmacao" : "Confirmation"}
                    </p>
                    {quickAddResult ? (
                      <span className="rounded-full border border-[#2B364B] bg-[#0E1420] px-3 py-1 text-[11px] text-[#98A7BC]">
                        {language === "pt" ? "Confianca" : "Confidence"}{" "}
                        {Math.round(quickAddResult.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                        {language === "pt" ? "Tipo" : "Type"}
                      </span>
                      <select
                        value={quickAddForm.entryType}
                        onChange={(event) =>
                          setQuickAddForm((current) => ({
                            ...current,
                            entryType: event.target.value as QuickAddEntryType,
                            accountId:
                              event.target.value === "card_expense" ? null : current.accountId,
                            cardId:
                              event.target.value === "card_expense" ? current.cardId : null,
                          }))
                        }
                        className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none focus:border-[#2B8C80]"
                      >
                        <option value="expense">{language === "pt" ? "Despesa" : "Expense"}</option>
                        <option value="card_expense">
                          {language === "pt" ? "Despesa no cartao" : "Card expense"}
                        </option>
                        <option value="income">{language === "pt" ? "Receita" : "Income"}</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                        {language === "pt" ? "Valor" : "Amount"}
                      </span>
                      <input
                        value={quickAddForm.amount}
                        onChange={(event) =>
                          setQuickAddForm((current) => ({
                            ...current,
                            amount: formatCentsInput(event.target.value, currency),
                          }))
                        }
                        inputMode="decimal"
                        className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none placeholder:text-[#627086] focus:border-[#2B8C80]"
                        placeholder={language === "pt" ? "R$ 0,00" : "0.00"}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                        {language === "pt" ? "Descricao" : "Description"}
                      </span>
                      <input
                        value={quickAddForm.description}
                        onChange={(event) =>
                          setQuickAddForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none placeholder:text-[#627086] focus:border-[#2B8C80]"
                        placeholder={language === "pt" ? "Ex.: Uber" : "Ex.: Uber"}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                        {language === "pt" ? "Categoria" : "Category"}
                      </span>
                      <input
                        value={quickAddForm.category}
                        onChange={(event) =>
                          setQuickAddForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none placeholder:text-[#627086] focus:border-[#2B8C80]"
                        placeholder={language === "pt" ? "Opcional" : "Optional"}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                        {language === "pt" ? "Data" : "Date"}
                      </span>
                      <input
                        type="date"
                        value={quickAddForm.date}
                        onChange={(event) =>
                          setQuickAddForm((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none focus:border-[#2B8C80]"
                      />
                    </label>

                    {quickAddForm.entryType === "card_expense" ? (
                      <label className="block">
                        <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                          {language === "pt" ? "Cartao" : "Card"}
                        </span>
                        <select
                          value={quickAddForm.cardId ?? ""}
                          onChange={(event) =>
                            setQuickAddForm((current) => ({
                              ...current,
                              cardId: event.target.value || null,
                            }))
                          }
                          className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none focus:border-[#2B8C80]"
                        >
                          <option value="">{language === "pt" ? "Selecione um cartao" : "Select a card"}</option>
                          {cards.map((card) => (
                            <option key={card.id} value={card.id}>
                              {card.name}
                              {card.owner_type === "friend" && card.friend_name
                                ? ` (${card.friend_name})`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="block">
                        <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8B94A6]">
                          {language === "pt" ? "Conta" : "Account"}
                        </span>
                        <select
                          value={quickAddForm.accountId ?? ""}
                          onChange={(event) =>
                            setQuickAddForm((current) => ({
                              ...current,
                              accountId: event.target.value || null,
                            }))
                          }
                          className="w-full rounded-xl border border-[#202A39] bg-[#0B111B] px-4 py-3 text-sm text-[#E7ECF2] outline-none focus:border-[#2B8C80]"
                        >
                          <option value="">{language === "pt" ? "Selecione uma conta" : "Select an account"}</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1B2433] bg-[#111826] p-4">
                  <p className="text-sm font-semibold text-[#E7ECF2]">
                    {language === "pt" ? "Leitura do comando" : "Command reading"}
                  </p>
                  {quickAddResult ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-[#223047] bg-[#0B111B] p-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8B94A6]">
                          {language === "pt" ? "Entrada detectada" : "Detected entry"}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#E7ECF2]">
                          {quickAddResult.entryType === "income"
                            ? language === "pt"
                              ? "Receita"
                              : "Income"
                            : quickAddResult.entryType === "card_expense"
                              ? language === "pt"
                                ? "Despesa no cartao"
                                : "Card expense"
                              : language === "pt"
                                ? "Despesa"
                                : "Expense"}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#223047] bg-[#0B111B] p-3">
                          <p className="text-[11px] text-[#8B94A6]">{language === "pt" ? "Conta" : "Account"}</p>
                          <p className="mt-1 text-sm text-[#E7ECF2]">
                            {quickAddResult.accountName || "--"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#223047] bg-[#0B111B] p-3">
                          <p className="text-[11px] text-[#8B94A6]">{language === "pt" ? "Cartao" : "Card"}</p>
                          <p className="mt-1 text-sm text-[#E7ECF2]">
                            {quickAddResult.cardName || "--"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#223047] bg-[#0B111B] p-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8B94A6]">
                          {language === "pt" ? "Campos para revisar" : "Fields to review"}
                        </p>
                        {quickAddResult.missingFields.length === 0 ? (
                          <p className="mt-2 text-sm text-[#A9F5E5]">
                            {language === "pt"
                              ? "Tudo essencial foi entendido. Revise e salve."
                              : "Everything essential was understood. Review and save."}
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {quickAddResult.missingFields.map((field) => (
                              <span
                                key={field}
                                className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-[#283446] bg-[#0B111B] px-4 py-6 text-sm text-[#8B94A6]">
                      {language === "pt"
                        ? "Depois de interpretar o comando, os campos aparecem prontos para voce confirmar."
                        : "After interpreting the command, the fields will be prepared here for confirmation."}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1B2330] pt-1">
                <button
                  type="button"
                  onClick={closeQuickAddModal}
                  className="rounded-full border border-[#263043] bg-[#111826] px-4 py-2 text-sm text-[#A8B2C3] transition hover:border-[#344159] hover:text-[#E7ECF2]"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveQuickAdd()}
                  disabled={quickAddSaving || quickAddParsing}
                  className="rounded-full border border-[#2A8A7D] bg-[#143A34] px-5 py-2 text-sm font-semibold text-[#7AF0D0] transition hover:border-[#35B7A6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {quickAddSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <div className="rounded-2xl border border-[#1B2230] bg-[#141A25] p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#8D96A6]">{t("home.balanceLabel")}</p>
            <button
              type="button"
              onClick={() => setShowBalance((value) => !value)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1C2332] bg-[#0F141E]"
            >
              <AppIcon
                name={showBalance ? "eye-off" : "eye"}
                size={16}
                color="#A3ABB9"
              />
            </button>
          </div>
          <p className="mt-4 text-3xl font-semibold text-[#E7ECF2]">
            {loading ? "..." : showBalance ? formatCurrency(totalBalance, language, currency) : "****"}
          </p>
          <p className="mt-3 text-xs text-[#8D96A6]">
            {t("home.total")} {loading ? "..." : formatCurrency(totalBalance, language, currency)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Contas ativas" : "Active accounts"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#E7ECF2]">{accounts.length}</p>
            </div>
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Em cartoes" : "Card usage"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#E7ECF2]">
                {loading ? "..." : formatCurrency(cardUsedTotal, language, currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#E3E9F1]">{t("home.inflowVsOutflow")}</p>
            <span className="text-[11px] text-[#8D96A6]">{t("home.vsLastMonth")}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#1E2636] bg-[#0F141E] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#48C59F]">
                    <AppIcon name="plus" size={14} color="#0C1018" />
                  </div>
                  <div>
                    <p className="text-xs text-[#8D96A6]">{t("home.income")}</p>
                    <p className="text-lg font-semibold text-[#E3E9F1]">
                      {loading ? "..." : formatCurrency(income, language, currency)}
                    </p>
                  </div>
                </div>
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                    monthOverMonth.incomePct == null || incomeDirection === "neutral"
                      ? "bg-[#172031] text-[#9AA3B2]"
                      : incomeDirection === "up"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  <AppIcon
                    name={
                      monthOverMonth.incomePct == null || incomeDirection === "neutral"
                        ? "arrow-right"
                        : incomeDirection === "up"
                          ? "arrow-up"
                          : "arrow-down"
                    }
                    size={12}
                    color="currentColor"
                  />
                  {loading
                    ? "..."
                    : monthOverMonth.incomePct == null
                      ? "--"
                      : formatChangePercent(monthOverMonth.incomePct, language)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#1E2636] bg-[#0F141E] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E46E6E]">
                    <AppIcon name="arrow-down" size={14} color="#0C1018" />
                  </div>
                  <div>
                    <p className="text-xs text-[#8D96A6]">{t("home.expenses")}</p>
                    <p className="text-lg font-semibold text-[#E3E9F1]">
                      {loading ? "..." : formatCurrency(expenses, language, currency)}
                    </p>
                  </div>
                </div>
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                    monthOverMonth.expensesPct == null || expensesDirection === "neutral"
                      ? "bg-[#172031] text-[#9AA3B2]"
                      : expensesDirection === "down"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  <AppIcon
                    name={
                      monthOverMonth.expensesPct == null || expensesDirection === "neutral"
                        ? "arrow-right"
                        : expensesDirection === "up"
                          ? "arrow-up"
                          : "arrow-down"
                    }
                    size={12}
                    color="currentColor"
                  />
                  {loading
                    ? "..."
                    : monthOverMonth.expensesPct == null
                      ? "--"
                      : formatChangePercent(monthOverMonth.expensesPct, language)}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#8D96A6]">
            {t("home.balanceAfterExpenses")}:{" "}
            {loading ? "..." : formatCurrency(monthNet, language, currency)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Resultado do mes" : "Month result"}
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  monthNet >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {loading ? "..." : formatSignedCurrency(monthNet, language, currency)}
              </p>
            </div>
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Taxa de poupanca" : "Savings rate"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#E7ECF2]">
                {loading
                  ? "..."
                  : savingsRate == null
                    ? "--"
                    : formatPercent(savingsRate, language)}
              </p>
            </div>
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Media desp./dia" : "Avg exp./day"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#E7ECF2]">
                {loading
                  ? "..."
                  : monthProgress.elapsedDays > 0
                    ? formatCurrency(expenses / monthProgress.elapsedDays, language, currency)
                    : "--"}
              </p>
            </div>
            <div className="rounded-lg border border-[#1E2636] bg-[#0F141E] p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#8D96A6]">
                {language === "pt" ? "Projecao do mes" : "Month projection"}
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  (monthProjection?.net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {loading
                  ? "..."
                  : monthProjection
                    ? formatSignedCurrency(monthProjection.net, language, currency)
                    : "--"}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-[#1E2636] bg-[#0F141E] p-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-[#8D96A6]">
              <span>{language === "pt" ? "Pressao de despesas" : "Expense pressure"}</span>
              <span>
                {loading
                  ? "..."
                  : expensePressure == null
                    ? "--"
                    : formatPercent(expensePressure, language)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#111827]">
              <div
                className={`h-2 rounded-full ${expensePressureTone}`}
                style={{ width: `${expensePressureWidth}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("home.categories")}</p>
            <span className="text-[11px] text-[#8B94A6]">
              {t("transactions.monthSummary")}
            </span>
          </div>
          {categoryChartData.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("transactions.empty")}</p>
          ) : (
            <div className="rounded-xl border border-[#1E2636] bg-[#0F141E] p-3">
              <p className="text-xs font-semibold text-[#D7DDEA]">
                {language === "pt"
                  ? "Principais categorias de despesas"
                  : "Top expense categories"}
              </p>
              <p className="mt-1 text-[11px] text-[#8B94A6]">
                {language === "pt" ? "Resumo do mes" : "Month summary"}:{" "}
                {formatCurrency(totalCategoryAmount, language, currency)}
              </p>

              <div className="relative mt-3 grid grid-cols-[1fr_126px] items-center gap-1 overflow-hidden">
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {categoryChartData.map((category, index) => (
                    <div
                      key={category.name}
                      className={`flex items-center gap-2 rounded-lg px-1 py-1 transition-colors ${
                        activeCategoryIndex === index
                          ? "bg-[#171E2B]"
                          : "hover:bg-[#141B27]"
                      }`}
                      onMouseEnter={() => setActiveCategoryIndex(index)}
                      onMouseLeave={() => setActiveCategoryIndex(null)}
                    >
                      <span
                        className="h-9 w-1.5 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#E7ECF2]">
                          {index + 1}. {category.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-[#9AA3B2]">
                          <span>{formatPercent(category.percent, language)}</span>
                          <span className="text-[#7F8A9B]">·</span>
                          <span>{formatCurrency(category.value, language, currency)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-40 w-[176px] -mr-12 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%" minHeight={120}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="62%"
                        cy="50%"
                        startAngle={90}
                        endAngle={-270}
                        innerRadius="58%"
                        outerRadius="84%"
                        paddingAngle={categoryPaddingAngle}
                        stroke="none"
                        onMouseEnter={(_, index) => setActiveCategoryIndex(index)}
                        onMouseLeave={() => setActiveCategoryIndex(null)}
                        isAnimationActive
                        animationDuration={850}
                        animationEasing="ease-out"
                      >
                        {categoryChartData.map((category, index) => (
                          <Cell
                            key={`${category.name}-${index}`}
                            fill={category.color}
                            fillOpacity={
                              activeCategoryIndex == null || activeCategoryIndex === index
                                ? 1
                                : 0.28
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={CategoryTooltip}
                        cursor={false}
                        wrapperStyle={{ outline: "none" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#E4E7EC]">
                {t("home.monthlyFlow")}
              </p>
              <p className="text-xs text-[#8B94A6]">{t("home.inflowVsOutflow")}</p>
            </div>
            <div className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[11px] text-[#9AA3B2]">
              {t("home.last30Days")}
            </div>
          </div>

          <div className="mt-5 h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={180}>
              <ComposedChart data={flowSeries}>
                <defs>
                  <linearGradient id="homeNetFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5DA7FF" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#5DA7FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1C2332" strokeDasharray="4 6" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#6E7A8C"
                  tick={{ fill: "#9AA3B2", fontSize: 10 }}
                  axisLine={{ stroke: "#1C2332" }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#6E7A8C"
                  tick={{ fill: "#9AA3B2", fontSize: 10 }}
                  axisLine={{ stroke: "#1C2332" }}
                  tickFormatter={(value) => formatCurrency(value, language, currency)}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={FlowTooltip} />
                <Legend wrapperStyle={{ color: "#E2E6ED", fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#1C2332" strokeDasharray="4 6" />
                <ReferenceLine
                  y={flowMetrics.avgIncome}
                  stroke="#48C59F"
                  strokeDasharray="4 6"
                  strokeOpacity={0.35}
                />
                <ReferenceLine
                  y={flowMetrics.avgExpense}
                  stroke="#E46E6E"
                  strokeDasharray="4 6"
                  strokeOpacity={0.35}
                />
                <Bar
                  dataKey="income"
                  name={t("home.income")}
                  fill="#4FC3A1"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  dataKey="expense"
                  name={t("home.expenses")}
                  fill="#E36B6B"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={18}
                />
                <Line
                  type="monotone"
                  dataKey="netDay"
                  name="Saldo diario"
                  stroke="#EAC37A"
                  strokeDasharray="4 6"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Saldo acumulado"
                  stroke="#5DA7FF"
                  fill="url(#homeNetFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("home.accounts")}</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A2230] bg-[#101620]">
              <AppIcon name="wallet" size={16} color="#92A0B7" />
            </span>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                {language === "pt" ? "Saldo total" : "Total balance"}
              </p>
              <p className="mt-2 text-lg font-semibold text-[#E5E8EF]">
                {loading ? "..." : formatCurrency(accountBalanceTotal, language, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                {language === "pt" ? "Contas positivas" : "Positive accounts"}
              </p>
              <p className="mt-2 text-lg font-semibold text-[#5DD6C7]">
                {positiveAccountsCount}/{accounts.length}
              </p>
            </div>
            <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                {language === "pt" ? "Media por conta" : "Average per account"}
              </p>
              <p className="mt-2 text-lg font-semibold text-[#E5E8EF]">
                {loading ? "..." : formatCurrency(averageAccountBalance, language, currency)}
              </p>
            </div>
          </div>
          {accounts.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.noAccounts")}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-xl border border-[#1C2332] bg-[#0F141E] p-3"
                >
                  <div className="relative shrink-0">
                    <BankBrandBadge bankCode={account.bank_code} size="sm" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0F141E] ${
                        (Number(account.balance) || 0) > 0 ? "bg-[#4FC3A1]" : "bg-[#64748B]"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#E4E7EC]">{account.name}</p>
                      {largestAccount?.id === account.id ? (
                        <span className="rounded-full border border-[#2E6C79] bg-[#173038] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#91E6DA]">
                          {language === "pt" ? "Maior saldo" : "Top balance"}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-lg font-semibold text-[#E5E8EF]">
                      {loading ? "..." : formatCurrency(Number(account.balance) || 0, language, currency)}
                    </p>
                    <p className="text-xs text-[#8B94A6]">
                      {usesHistoricalAccountBalances
                        ? language === "pt"
                          ? "Saldo atual da conta"
                          : "Current account balance"
                        : language === "pt"
                          ? "Movimento do mes selecionado"
                          : "Selected month movement"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAccount(account.id, account.name)}
                    disabled={deletingAccountId === account.id}
                    className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-[11px] text-[#8B94A6] hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                  >
                    {deletingAccountId === account.id ? "Removendo..." : "Remover"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-[#1C2332] pt-3 text-sm">
            <span className="text-[#8B94A6]">
              {language === "pt" ? "Resumo das contas" : "Accounts summary"}
            </span>
            <span className="font-semibold text-[#C7CEDA]">
              {t("home.total")} {loading ? "..." : formatCurrency(accountBalanceTotal, language, currency)}
            </span>
          </div>
        </div>


        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("home.creditCards")}</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A2230] bg-[#101620]">
              <AppIcon name="credit-card" size={16} color="#92A0B7" />
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-[#3A8F8A] bg-[#163137] px-3 py-1 text-[#64D1C4]">
              {t("home.openStatements")} {openStatementsCount}
            </span>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[#8B94A6]">
              {t("home.closedStatements")} {closedStatementsCount}
            </span>
          </div>
          {cards.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.noCards")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((card) => {
                const isFriendCard = (card.owner_type ?? "self") === "friend";
                const insight = cardInsightsById[card.id];
                const statementStatus = insight?.statementStatus ?? "open";
                return (
                  <div
                    key={card.id}
                    className={`min-w-0 rounded-xl px-4 py-3 ${
                      isFriendCard
                        ? "border border-[#25404B] bg-[#10212A]"
                        : "border border-[#1C2332] bg-[#0F141E]"
                    }`}
                  >
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BankBrandBadge bankCode={card.bank_code} size="sm" />
                      <p className="min-w-0 break-words text-sm font-semibold text-[#E4E7EC]">{card.name}</p>
                       {isFriendCard ? (
                          <span className="rounded-full border border-[#2E6C79] bg-[#173038] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#91E6DA]">
                            {t("cards.ownerBadgeFriend")}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                            statementStatus === "closed"
                              ? "border-amber-500/45 bg-amber-500/10 text-amber-200"
                              : "border-[#2A8C73] bg-[#163137] text-[#91E6DA]"
                          }`}
                        >
                          {statementStatus === "closed"
                            ? t("home.closedStatements")
                            : t("home.openStatements")}
                        </span>
                      </div>
                      {isFriendCard && card.friend_name ? (
                        <p className="mt-1 text-xs text-[#A8D7D1]">
                          {t("home.friendCardOwner")}: {card.friend_name}
                        </p>
                      ) : null}
                      <p className="text-xs text-[#8B94A6]">
                        {t("cards.closes")} {card.closing_day} - {t("cards.due")} {card.due_day}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 rounded-xl border border-[#1B2230] bg-[#111723] p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                            {language === "pt" ? "Fatura atual" : "Current statement"}
                          </p>
                          <p className="mt-2 break-words text-xl font-semibold leading-tight text-[#E4E7EC] sm:text-2xl">
                            {formatCurrency(
                              (insight?.currentStatement ?? 0) + (insight?.overdueAmount ?? 0),
                              language,
                              currency,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-[#8B94A6]">
                            {insight && insight.currentStatement + insight.overdueAmount > 0
                              ? language === "pt"
                                ? `Vence em ${insight.daysUntilDue} ${getDayWord(insight.daysUntilDue, language)}`
                                : `Due in ${insight.daysUntilDue} ${getDayWord(insight.daysUntilDue, language)}`
                              : language === "pt"
                                ? "Sem fatura pendente"
                                : "No statement due"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-[#1B2230] bg-[#111723] p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                            {language === "pt" ? "Proxima fatura" : "Next statement"}
                          </p>
                          <p className="mt-2 break-words text-xl font-semibold leading-tight text-[#E4E7EC] sm:text-2xl">
                            {formatCurrency(insight?.nextStatement ?? 0, language, currency)}
                          </p>
                          <p className="mt-1 text-xs text-[#8B94A6]">
                            {language === "pt"
                              ? `Fecha em ${insight?.daysUntilClosing ?? 0} ${getDayWord(insight?.daysUntilClosing ?? 0, language)}`
                              : `Closes in ${insight?.daysUntilClosing ?? 0} ${getDayWord(insight?.daysUntilClosing ?? 0, language)}`}
                          </p>
                        </div>
                      </div>
                      <div className={`mt-4 h-1.5 rounded-full ${isFriendCard ? "bg-[#173038]" : "bg-[#1A2230]"}`}>
                        <div
                          className="h-1.5 rounded-full bg-[#5DD6C7]"
                          style={{
                            width: `${Math.min(100, Math.max(0, insight?.utilizationPercent ?? 0))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="grid min-w-0 flex-1 gap-3 text-[11px] sm:grid-cols-3">
                          <div className="min-w-0">
                            <p className={isFriendCard ? "text-[#A8D7D1]" : "text-[#8B94A6]"}>{t("home.cardLimitAvailable")}</p>
                            <p className="break-words font-semibold leading-tight text-[#5DD6C7]">
                              {loading ? "..." : formatCurrency(insight?.availableLimit ?? 0, language, currency)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className={isFriendCard ? "text-[#A8D7D1]" : "text-[#8B94A6]"}>{t("home.cardLimitUsed")}</p>
                            <p className="break-words font-semibold leading-tight text-[#E4E7EC]">
                              {loading ? "..." : formatCurrency(insight?.usedTotal ?? 0, language, currency)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className={isFriendCard ? "text-[#A8D7D1]" : "text-[#8B94A6]"}>{t("home.cardLimitTotal")}</p>
                            <p className="break-words font-semibold leading-tight text-[#E4E7EC]">
                              {loading
                                ? "..."
                                : formatCurrency(Number(card.limit_amount) || 0, language, currency)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCard(card.id, card.name)}
                          disabled={deletingCardId === card.id}
                          className={`self-start rounded-full bg-[#0F141E] px-3 py-1 text-[11px] disabled:opacity-60 lg:self-auto ${
                            isFriendCard
                              ? "border border-[#2E6C79] text-[#A8D7D1] hover:border-red-500/60 hover:text-red-300"
                              : "border border-[#2A3140] text-[#8B94A6] hover:border-red-500/60 hover:text-red-400"
                          }`}
                        >
                          {deletingCardId === card.id ? "Removendo..." : "Remover"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#1B2230] bg-[#111723] p-4 sm:col-span-2 lg:col-span-6 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("transactions.title")}</p>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[11px] text-[#9AA3B2]">
              {t("transactions.monthSummary")}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8B94A6]">
            <span>Transacoes do mes</span>
            <span>{monthTransactions.length}</span>
          </div>
          {monthTransactions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#1C2332] bg-[#0F141E] px-4 py-8">
              <p className="text-xs text-[#8B94A6]">{t("transactions.empty")}</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="divide-y divide-[#1C2332]">
                {monthTransactions.map((tx) => {
                  const isIncome = tx.type === "income";
                  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
                  const isInstallment = totalInstallments > 0;
                  const paidInstallments = Math.max(0, Number(tx.installments_paid) || 0);
                  return (
                    <div
                      key={tx.displayId}
                      className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#E4E7EC]">
                          {tx.description || tx.category || "--"}
                        </p>
                        <p className="text-xs text-[#8B94A6]">
                          {(() => {
                            if (/^\d{4}-\d{2}-\d{2}$/.test(tx.displayDate)) {
                              const [y, m, d] = tx.displayDate.split("-").map(Number);
                              if (y && m && d) {
                                return new Date(y, m - 1, d).toLocaleDateString(
                                  language === "pt" ? "pt-BR" : "en-US",
                                );
                              }
                            }
                            return new Date(tx.displayDate).toLocaleDateString(
                              language === "pt" ? "pt-BR" : "en-US",
                            );
                          })()}
                        </p>
                        {isInstallment ? (
                          <span
                            className={`mt-1 inline-flex rounded-full border px-2 py-[2px] text-[10px] ${
                              paidInstallments >= totalInstallments
                                ? "border-emerald-500/40 text-emerald-300"
                                : "border-amber-500/40 text-amber-300"
                            }`}
                          >
                            {paidInstallments >= totalInstallments ? "Pago" : "Em aberto"}
                          </span>
                        ) : null}
                        {tx.isBudgetCarryover ? (
                          <span className="mt-1 inline-flex rounded-full border border-[#5DA7FF]/40 bg-[#122033] px-2 py-[2px] text-[10px] text-[#9DC4FF]">
                            {t("transactions.nextMonthSalary")}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold sm:text-right ${
                          isIncome ? "text-[#4FC3A1]" : "text-[#E36B6B]"
                        }`}
                      >
                        {isIncome ? "+" : "-"} {formatCurrency(tx.displayAmount, language, currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#C7CEDA]">
                {t("home.cardReminderTitle")}
              </p>
              <p className="text-xs text-[#8B94A6]">
                {t("home.cardReminderSubtitle")}
              </p>
            </div>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[11px] text-[#9AA3B2]">
              {cardReminders.length}
            </span>
          </div>
          {cards.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.noCards")}</p>
          ) : cardReminders.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.cardReminderEmpty")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cardReminders.map((card) => {
                const isExpired = card.status === "expired";
                return (
                  <div
                    key={card.id}
                    className={`rounded-xl border px-4 py-3 ${
                      isExpired
                        ? "border-red-500/35 bg-[#261419]"
                        : "border-amber-500/35 bg-[#241E12]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#E4E7EC]">{card.name}</p>
                        {card.owner_type === "friend" && card.friend_name ? (
                          <p className="mt-1 text-[11px] text-[#A8B2C3]">
                            {t("home.friendCardOwner")}: {card.friend_name}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-[#A8B2C3]">
                          {t("cards.closes")} {card.closingDay} - {t("cards.due")} {card.dueDay}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          isExpired
                            ? "border-red-500/50 text-red-300"
                            : "border-amber-500/50 text-amber-300"
                        }`}
                      >
                        {isExpired
                          ? t("home.cardReminderExpiredBadge")
                          : t("home.cardReminderClosedBadge")}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <p
                        className={`text-xs ${
                          isExpired ? "text-red-200" : "text-amber-200"
                        }`}
                      >
                        {isExpired
                          ? t("home.cardReminderExpiredSince")
                          : t("home.cardReminderClosedSince")}{" "}
                        {card.days} {getDayWord(card.days, language)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleMarkCardReminderPaid(card)}
                        disabled={payingReminderCardId === card.id}
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                          isExpired
                            ? "border-red-500/55 bg-red-500/10 text-red-100 hover:border-red-400"
                            : "border-amber-500/55 bg-amber-500/10 text-amber-100 hover:border-amber-400"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {payingReminderCardId === card.id
                          ? t("home.cardReminderPaying")
                          : t("home.cardReminderMarkPaid")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


