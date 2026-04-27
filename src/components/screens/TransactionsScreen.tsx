"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getMonthShortName } from "../../../shared/i18n";
import { formatCurrencyValue } from "../../../shared/currency";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";

type Transaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string;
  description: string | null;
  category: string | null;
  date: string;
  account_id: string | null;
  card_id: string | null;
  is_fixed: boolean | null;
  is_installment: boolean | null;
  installment_total: number | null;
  installments_paid: number | null;
  is_paid: boolean | null;
};

type DisplayTransaction = Transaction & {
  baseId: string;
  displayId: string;
  displayDate: string;
  effectiveDate: string;
  displayAmount: number;
  installmentIndex?: number | null;
  isBudgetCarryover?: boolean;
};

type Account = {
  id: string;
  balance: number | string;
};

type CreditCard = {
  id: string;
  name: string;
};

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

function getMonthLabel(date: Date, language: "pt" | "en") {
  const month = date.getMonth();
  const year = date.getFullYear();
  return `${getMonthShortName(language, month)} ${year}`;
}

function getMonthOptions(language: "pt" | "en", total = 12) {
  const options: { label: string; value: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < total; i += 1) {
    const value = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ label: getMonthLabel(value, language), value });
  }
  return options;
}

function formatCurrency(value: number, language: "pt" | "en", currency: "BRL" | "EUR") {
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

function isSameMonth(date: Date, month: Date) {
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
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

function addMonthsClamped(date: Date, monthsToAdd: number) {
  const targetMonthStart = new Date(
    date.getFullYear(),
    date.getMonth() + monthsToAdd,
    1,
  );
  const lastDayOfTargetMonth = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const safeDay = Math.min(date.getDate(), lastDayOfTargetMonth);
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    safeDay,
  );
}

function toDateInputValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseLocalDate(value);
  return parsed ? toDateString(parsed) : "";
}

function formatDate(value: string, language: "pt" | "en") {
  const date = parseLocalDate(value) ?? new Date(value);
  return date.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US");
}

export function TransactionsScreen() {
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const { user } = useAuth();
  const emptyMoneyValue = formatCentsInput("", currency);
  const [loading, setLoading] = useState(true);
  const [baseTransactions, setBaseTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [installmentSavingId, setInstallmentSavingId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState(emptyMoneyValue);
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [undoSavingId, setUndoSavingId] = useState<string | null>(null);

  const monthLabel = useMemo(
    () => getMonthLabel(selectedMonth, language),
    [language, selectedMonth],
  );

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    const queryEnd = getTransactionsQueryEnd(selectedMonth);
    const txColumns =
      "id,type,amount,description,category,date,account_id,card_id,is_fixed,is_installment,installment_total,installments_paid,is_paid";
    const txColumnsFallback =
      "id,type,amount,description,category,date,account_id,card_id,is_installment,installment_total,installments_paid,is_paid";

    const [txResultWithFixed, accountsResult, cardsResult] = await Promise.all([
      supabase
        .from("transactions")
        .select(txColumns)
        .eq("user_id", user.id)
        .lte("date", queryEnd)
        .order("date", { ascending: false }),
      supabase.from("accounts").select("id,balance").eq("user_id", user.id),
      supabase.from("credit_cards").select("id,name").eq("user_id", user.id),
    ]);

    let txData = txResultWithFixed.data;
    let txError = txResultWithFixed.error;
    const rawError = `${txError?.code ?? ""} ${txError?.message ?? ""}`.toLowerCase();
    const missingFixedColumn =
      !!txError && txError.code === "42703" && rawError.includes("is_fixed");

    if (missingFixedColumn) {
      const fallback = await supabase
        .from("transactions")
        .select(txColumnsFallback)
        .eq("user_id", user.id)
        .lte("date", queryEnd)
        .order("date", { ascending: false });

      txError = fallback.error;
      txData = (fallback.data ?? []).map((item) => ({
        ...item,
        is_fixed: null,
      }));
    }

    if (txError) {
      setErrorMsg(t("transactions.loadError"));
      setLoading(false);
      return;
    }

    if (cardsResult.error) {
      setErrorMsg(t("transactions.loadError"));
      setLoading(false);
      return;
    }

    setBaseTransactions((txData ?? []) as Transaction[]);
    setAccounts((accountsResult.data ?? []) as Account[]);
    setCards((cardsResult.data ?? []) as CreditCard[]);
    setLoading(false);
  }, [t, selectedMonth, user]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    function handleRefresh() {
      loadTransactions();
    }

    window.addEventListener("data-refresh", handleRefresh);
    return () => window.removeEventListener("data-refresh", handleRefresh);
  }, [loadTransactions]);

  const baseTxById = useMemo(
    () => new Map(baseTransactions.map((tx) => [tx.id, tx])),
    [baseTransactions],
  );
  const cardNameById = useMemo(
    () => new Map(cards.map((card) => [card.id, card.name])),
    [cards],
  );

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
      const isFixedExpense =
        !!tx.is_fixed && (tx.type === "expense" || tx.type === "card_expense");
      const monthOffset = (monthStart.getFullYear() - txDate.getFullYear()) * 12 +
        (monthStart.getMonth() - txDate.getMonth());

      if (isInstallment && totalInstallments > 0) {
        const perInstallment = amount / totalInstallments;
        const entries: DisplayTransaction[] = [];
        for (let i = 0; i < totalInstallments; i += 1) {
          const installmentDate = addMonthsClamped(txDate, i);
          if (installmentDate < monthStart || installmentDate > monthEnd) continue;
          entries.push({
            ...tx,
            baseId: tx.id,
            displayId: `${tx.id}-i${i + 1}`,
            displayDate: toDateString(installmentDate),
            effectiveDate: toDateString(installmentDate),
            displayAmount: perInstallment,
            installmentIndex: i + 1,
          });
        }
        return entries;
      }

      if (isFixedExpense) {
        if (monthOffset < 0) return [];
        const recurringDate = addMonthsClamped(txDate, monthOffset);
        if (recurringDate < monthStart || recurringDate > monthEnd) return [];
        return [
          {
            ...tx,
            baseId: tx.id,
            displayId: `${tx.id}-f${monthOffset}`,
            displayDate: toDateString(recurringDate),
            effectiveDate: toDateString(recurringDate),
            displayAmount: amount,
          },
        ];
      }

      if (isSalaryCarryoverCandidate(tx, txDate)) {
        const assignedMonth = new Date(txDate.getFullYear(), txDate.getMonth() - 1, 1);
        if (!isSameMonth(assignedMonth, month)) return [];
        return [
          {
            ...tx,
            baseId: tx.id,
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
          baseId: tx.id,
          displayId: tx.id,
          displayDate: tx.date,
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

  const monthTransactions = useMemo(
    () => buildMonthTransactions(baseTransactions, selectedMonth),
    [baseTransactions, selectedMonth],
  );

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return monthTransactions;
    return monthTransactions.filter((tx) =>
      filter === "income" ? tx.type === "income" : tx.type !== "income",
    );
  }, [filter, monthTransactions]);

  async function handleRemove(tx: Transaction) {
    if (!user) return;
    const id = tx.id;
    setErrorMsg(null);
    setDeletingId(id);

    let rollbackApplied = false;
    let rollbackDelta = 0;
    let rollbackAccountId: string | null = null;

    const amount = Number(tx.amount) || 0;
    const fallbackSingleAccountId =
      !tx.account_id && (tx.type === "income" || tx.type === "expense") && accounts.length === 1
        ? accounts[0]?.id ?? null
        : null;
    const targetAccountId = tx.account_id ?? fallbackSingleAccountId;

    if (targetAccountId && amount > 0) {
      if (tx.type === "income") {
        rollbackDelta = -amount;
      } else if (tx.type === "expense") {
        rollbackDelta = amount;
      } else if (tx.type === "card_expense") {
        const isInstallment = !!tx.is_installment && (tx.installment_total ?? 0) > 0;
        if (isInstallment) {
          const totalInstallments = Math.max(1, tx.installment_total ?? 1);
          const paidInstallments = Math.min(
            Math.max(tx.installments_paid ?? 0, 0),
            totalInstallments,
          );
          rollbackDelta = (amount / totalInstallments) * paidInstallments;
        } else if (tx.is_paid) {
          rollbackDelta = amount;
        }
      }
    }

    if (targetAccountId && rollbackDelta !== 0) {
      const current = accounts.find((account) => account.id === targetAccountId);
      if (current) {
        const nextBalance = (Number(current.balance) || 0) + rollbackDelta;
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({ balance: nextBalance })
          .eq("id", targetAccountId)
          .eq("user_id", user.id);
        if (balanceError) {
          setDeletingId(null);
          setErrorMsg(t("transactions.loadError"));
          return;
        }
        rollbackApplied = true;
        rollbackAccountId = targetAccountId;
      }
    }

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    setDeletingId(null);
    if (error) {
      if (rollbackApplied && rollbackAccountId && rollbackDelta !== 0) {
        const current = accounts.find((account) => account.id === rollbackAccountId);
        if (current) {
          const revertBalance = (Number(current.balance) || 0) - rollbackDelta;
          await supabase
            .from("accounts")
            .update({ balance: revertBalance })
            .eq("id", rollbackAccountId)
            .eq("user_id", user.id);
        }
      }
      setErrorMsg(t("transactions.loadError"));
      return;
    }
    loadTransactions();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleMarkInstallmentPaid(tx: Transaction) {
    if (!user) return;
    const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
    if (totalInstallments <= 0) return;
    const paid = Math.max(0, Number(tx.installments_paid) || 0);
    if (paid >= totalInstallments) return;
    const offset = getInstallmentMonthOffset(tx.date, selectedMonth);
    if (offset === null || offset !== paid) return;
    if (installmentSavingId) return;
    if (
      !window.confirm(
        "Registrar parcela? Voce pode desfazer em seguida.",
      )
    ) {
      return;
    }

    setInstallmentSavingId(tx.id);
    const nextPaid = paid + 1;
    const nextIsPaid = nextPaid >= totalInstallments;
    const { error } = await supabase
      .from("transactions")
      .update({
        installments_paid: nextPaid,
        is_paid: nextIsPaid,
      })
      .eq("id", tx.id)
      .eq("user_id", user.id);
    setInstallmentSavingId(null);

    if (error) {
      console.error("Erro ao registar pagamento de parcela:", error);
      setErrorMsg(t("transactions.loadError"));
      return;
    }

    const amount = Number(tx.amount) || 0;
    const perInstallment = amount / Math.max(totalInstallments, 1);
    if (tx.account_id && Number.isFinite(perInstallment)) {
      const current = accounts.find((account) => account.id === tx.account_id);
      if (current) {
        const nextBalance = (Number(current.balance) || 0) - perInstallment;
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({ balance: nextBalance })
          .eq("id", tx.account_id)
          .eq("user_id", user.id);
        if (balanceError) {
          console.error("Erro ao atualizar saldo da conta:", balanceError);
          setErrorMsg(t("transactions.loadError"));
        }
      }
    }

    loadTransactions();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleUndoInstallmentPaid(tx: Transaction) {
    if (!user) return;
    const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
    if (totalInstallments <= 0) return;
    const paid = Math.max(0, Number(tx.installments_paid) || 0);
    if (paid <= 0) return;
    if (undoSavingId) return;
    if (!window.confirm("Desfazer a ultima parcela registrada?")) return;
    setUndoSavingId(tx.id);
    const nextPaid = Math.max(paid - 1, 0);
    const nextIsPaid = nextPaid >= totalInstallments;
    const { error } = await supabase
      .from("transactions")
      .update({
        installments_paid: nextPaid,
        is_paid: nextIsPaid,
      })
      .eq("id", tx.id)
      .eq("user_id", user.id);
    setUndoSavingId(null);

    if (error) {
      console.error("Erro ao desfazer pagamento de parcela:", error);
      setErrorMsg(t("transactions.loadError"));
      return;
    }

    const amount = Number(tx.amount) || 0;
    const perInstallment = amount / Math.max(totalInstallments, 1);
    if (tx.account_id && Number.isFinite(perInstallment)) {
      const current = accounts.find((account) => account.id === tx.account_id);
      if (current) {
        const nextBalance = (Number(current.balance) || 0) + perInstallment;
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({ balance: nextBalance })
          .eq("id", tx.account_id)
          .eq("user_id", user.id);
        if (balanceError) {
          console.error("Erro ao atualizar saldo da conta:", balanceError);
          setErrorMsg(t("transactions.loadError"));
        }
      }
    }

    loadTransactions();
    window.dispatchEvent(new Event("data-refresh"));
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx);
    setEditDescription(tx.description ?? "");
    setEditAmount(formatCentsFromNumber(Number(tx.amount) || 0, currency));
    setEditCategory(tx.category ?? "");
    setEditDate(toDateInputValue(tx.date));
    setEditCardId(tx.card_id ?? null);
    setEditError(null);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditingTx(null);
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingTx || !user) return;

    setEditError(null);
    const parsedAmount = parseCentsInput(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEditError("Valor invalido.");
      return;
    }
    if (!editDate) {
      setEditError("Escolha uma data.");
      return;
    }
    if (editingTx.type === "card_expense" && !editCardId) {
      setEditError("Selecione um cartao.");
      return;
    }

    setEditSaving(true);
    const previousAmount = Number(editingTx.amount) || 0;
    const amountDelta = parsedAmount - previousAmount;

    const { error } = await supabase
      .from("transactions")
      .update({
        description: editDescription.trim() || null,
        amount: parsedAmount,
        category: editCategory.trim() || null,
        date: editDate,
        card_id: editingTx.type === "card_expense" ? editCardId : null,
      })
      .eq("id", editingTx.id)
      .eq("user_id", user.id);
    setEditSaving(false);

    if (error) {
      console.error("Error updating transaction:", error);
      setEditError("Erro ao editar transacao.");
      return;
    }

    if (editingTx.account_id && amountDelta !== 0) {
      const linkedAccount = accounts.find((account) => account.id === editingTx.account_id);
      if (linkedAccount) {
        const currentBalance = Number(linkedAccount.balance) || 0;
        const signedDelta = editingTx.type === "income" ? amountDelta : -amountDelta;
        const nextBalance = currentBalance + signedDelta;
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ balance: nextBalance })
          .eq("id", editingTx.account_id)
          .eq("user_id", user.id);
        if (accountError) {
          setEditError("Erro ao atualizar saldo da conta.");
          return;
        }
      }
    }

    setEditingTx(null);
    loadTransactions();
    window.dispatchEvent(new Event("data-refresh"));
  }

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => sum + (Number(account.balance) || 0),
        0,
      ),
    [accounts],
  );

  const monthNet = useMemo(() => {
    return monthTransactions.reduce((sum, tx) => {
      const amount = tx.displayAmount;
      if (tx.type === "income") return sum + amount;
      return sum - amount;
    }, 0);
  }, [monthTransactions]);

  const monthOptions = useMemo(
    () => getMonthOptions(language),
    [language],
  );

  function getInstallmentMonthOffset(startDate: string, targetMonth: Date) {
    const start = parseLocalDate(startDate);
    if (!start || Number.isNaN(start.getTime())) return null;
    return (targetMonth.getFullYear() - start.getFullYear()) * 12 +
      (targetMonth.getMonth() - start.getMonth());
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header: filter + month nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="ui-btn ui-btn-secondary ui-btn-sm gap-1.5"
        >
          <AppIcon name="list" size={14} />
          {filter === "income" ? "Receitas" : filter === "expense" ? "Despesas" : "Todos"}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { const prev = new Date(selectedMonth); prev.setMonth(prev.getMonth() - 1); setSelectedMonth(prev); }}
            className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 p-0"
          >
            <AppIcon name="arrow-left" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMonthOpen((v) => !v)}
            className="ui-btn ui-btn-secondary ui-btn-sm px-4"
          >
            {monthLabel}
          </button>
          <button
            type="button"
            onClick={() => { const next = new Date(selectedMonth); next.setMonth(next.getMonth() + 1); setSelectedMonth(next); }}
            className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 p-0"
          >
            <AppIcon name="arrow-right" size={14} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="ui-card flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)]">
            <AppIcon name="wallet" size={16} color="var(--accent)" />
          </div>
          <div>
            <p className="ui-eyebrow">{language === "pt" ? "Saldo atual" : "Current balance"}</p>
            <p className="ui-amount text-sm text-[var(--text-1)]">
              {loading ? "—" : formatCurrency(totalBalance, language, currency)}
            </p>
          </div>
        </div>
        <div className="ui-card flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)]">
            <AppIcon name="calendar" size={16} color="var(--accent)" />
          </div>
          <div>
            <p className="ui-eyebrow">{language === "pt" ? "Balanço mensal" : "Month balance"}</p>
            <p className={`ui-amount text-sm ${monthNet >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
              {loading ? "—" : formatCurrency(monthNet, language, currency)}
            </p>
          </div>
        </div>
      </div>

      {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}

      {/* Transactions list */}
      <div className="flex flex-col gap-2">
        {filteredTransactions.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--text-3)]">
            {loading ? t("common.loading") : t("transactions.empty")}
          </p>
        ) : (
          filteredTransactions.map((item) => {
            const amount = item.displayAmount;
            const isIncome = item.type === "income";
            const isCard = item.type === "card_expense";
            const isFixedExpense = !isIncome && !!item.is_fixed;
            const totalInstallments = Math.max(0, Number(item.installment_total) || 0);
            const isInstallment = totalInstallments > 0;
            const paidInstallments = Math.max(0, Number(item.installments_paid) || 0);
            const installmentOffset = isInstallment ? getInstallmentMonthOffset(item.date, selectedMonth) : null;
            const canPayInstallment = isInstallment && installmentOffset !== null && installmentOffset === paidInstallments && paidInstallments < totalInstallments;
            const canUndoInstallment = isInstallment && paidInstallments > 0;
            const title = item.description || (isIncome ? t("newEntry.income") : isCard ? t("newEntry.cardExpense") : t("newEntry.expense"));
            const baseTx = baseTxById.get(item.baseId) ?? null;
            const cardName = isCard && item.card_id ? cardNameById.get(item.card_id) : null;
            return (
              <div
                key={item.displayId}
                className="group ui-card flex min-w-0 flex-col gap-3 p-4 transition-colors hover:border-[var(--border-bright)] hover:bg-[var(--surface-2)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isIncome ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">{title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[var(--text-3)]">{formatDate(item.displayDate, language)}</span>
                      {item.category ? <span className="ui-badge ui-badge-neutral">{item.category}</span> : null}
                      {cardName ? <span className="ui-badge ui-badge-accent">{cardName}</span> : null}
                      {isInstallment ? (
                        <span className={`ui-badge ${paidInstallments >= totalInstallments ? "ui-badge-income" : "ui-badge-warning"}`}>
                          {paidInstallments}/{totalInstallments}x
                        </span>
                      ) : null}
                      {isFixedExpense ? <span className="ui-badge ui-badge-neutral">{t("newEntry.fixedExpense")}</span> : null}
                      {item.isBudgetCarryover ? <span className="ui-badge ui-badge-accent">{t("transactions.nextMonthSalary")}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className={`ui-amount text-sm ${isIncome ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {isIncome ? "+" : "-"}{formatCurrency(amount, language, currency)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {canPayInstallment ? (
                      <button type="button" onClick={() => baseTx && handleMarkInstallmentPaid(baseTx)} disabled={installmentSavingId === item.baseId} className="ui-btn ui-btn-secondary ui-btn-sm">
                        {installmentSavingId === item.baseId ? "..." : "Parcela"}
                      </button>
                    ) : null}
                    {isInstallment ? (
                      <button type="button" onClick={() => baseTx && handleUndoInstallmentPaid(baseTx)} disabled={!canUndoInstallment || undoSavingId === item.baseId} className="ui-btn ui-btn-secondary ui-btn-sm">
                        {undoSavingId === item.baseId ? "..." : "Desfazer"}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => baseTx && openEdit(baseTx)} className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--text-2)]">
                      Editar
                    </button>
                    <button type="button" onClick={() => baseTx && handleRemove(baseTx)} disabled={deletingId === item.baseId} className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--red)]">
                      {deletingId === item.baseId ? "..." : "×"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit modal */}
      {editingTx ? (
        <div className="ui-modal-backdrop fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={closeEdit}>
          <div className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-1)]">Editar transação</h2>
              <button type="button" onClick={closeEdit} className="ui-btn ui-btn-ghost ui-btn-sm">Fechar</button>
            </div>
            <form className="flex flex-col gap-3" onSubmit={handleEditSubmit}>
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Descrição</label>
                <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="ui-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">Valor ({currency})</label>
                  <input type="text" inputMode="numeric" value={editAmount} onChange={(e) => setEditAmount(formatCentsInput(e.target.value, currency))} className="ui-input" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">Data</label>
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="ui-input" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Categoria</label>
                <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Ex: Mercado" className="ui-input" />
              </div>
              {editingTx.type === "card_expense" ? (
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">Cartão</label>
                  <div className="flex flex-wrap gap-2">
                    {cards.length === 0 ? (
                      <span className="text-xs text-[var(--text-3)]">Nenhum cartão cadastrado.</span>
                    ) : cards.map((card) => (
                      <button key={card.id} type="button" onClick={() => setEditCardId(card.id)}
                        className={`ui-btn ui-btn-sm ${editCardId === card.id ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                        {card.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {editError ? <p className="text-xs text-[var(--red)]">{editError}</p> : null}
              <button type="submit" disabled={editSaving} className="ui-btn ui-btn-primary ui-btn-lg w-full">
                {editSaving ? "A guardar..." : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Month picker dropdown */}
      {monthOpen ? (
        <div className="ui-modal-backdrop fixed inset-0 z-40" onClick={() => setMonthOpen(false)}>
          <div className="absolute left-1/2 top-20 w-52 -translate-x-1/2 ui-card-2 ui-slide-up overflow-hidden p-1.5" onClick={(e) => e.stopPropagation()}>
            {monthOptions.map((option) => (
              <button key={option.label} type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text-1)] hover:bg-[var(--surface-3)]"
                onClick={() => { setSelectedMonth(option.value); setMonthOpen(false); }}>
                {option.label}
              </button>
            ))}
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)]" onClick={() => setMonthOpen(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Filter sheet */}
      {filterOpen ? (
        <div className="ui-modal-backdrop fixed inset-0 z-40" onClick={() => setFilterOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 ui-card-2 ui-slide-up rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border-bright)]" />
            <div className="flex flex-col gap-2">
              {(["expense", "income", "all"] as const).map((f) => (
                <button key={f} type="button"
                  className={`ui-btn ui-btn-lg w-full ${filter === f ? "ui-btn-primary" : "ui-btn-secondary"}`}
                  onClick={() => { setFilter(f); setFilterOpen(false); }}>
                  {f === "expense" ? "Despesas" : f === "income" ? "Receitas" : "Todos"}
                </button>
              ))}
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-lg w-full" onClick={() => setFilterOpen(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}







