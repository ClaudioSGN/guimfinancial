"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getMonthShortName } from "../../../shared/i18n";
import { useLanguage } from "@/lib/language";
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
  displayAmount: number;
  installmentIndex?: number | null;
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

function formatCurrency(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseLocalDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d);
    }
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
  const { user } = useAuth();
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
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
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
    const { end } = getMonthRange(selectedMonth);
    const txColumns =
      "id,type,amount,description,category,date,account_id,card_id,is_fixed,is_installment,installment_total,installments_paid,is_paid";
    const txColumnsFallback =
      "id,type,amount,description,category,date,account_id,card_id,is_installment,installment_total,installments_paid,is_paid";

    const [txResultWithFixed, accountsResult, cardsResult] = await Promise.all([
      supabase
        .from("transactions")
        .select(txColumns)
        .eq("user_id", user.id)
        .lte("date", end)
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
        .lte("date", end)
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
            displayAmount: amount,
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
          displayAmount: amount,
        },
      ];
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
    setEditAmount(String(Number(tx.amount) || 0));
    setEditCategory(tx.category ?? "");
    setEditDate(toDateInputValue(tx.date));
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
    const parsedAmount = Number(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEditError("Valor invalido.");
      return;
    }
    if (!editDate) {
      setEditError("Escolha uma data.");
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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1E232E] bg-[#111723] text-[#8B94A6]"
          aria-label="Filter"
        >
          <AppIcon name="list" size={18} />
        </button>

        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="flex items-center gap-2 rounded-full border border-[#2A3140] bg-[#141A25] px-5 py-2 text-sm font-semibold text-[#C7CEDA]"
        >
          {filter === "income"
            ? "Receitas"
            : filter === "expense"
              ? "Despesas"
              : "Transações"}
          <AppIcon name="chevron-down" size={16} />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1E232E] bg-[#111723] text-[#8B94A6]">
          <span className="text-lg leading-none">...</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-sm text-[#C7CEDA]">
        <button
          type="button"
          onClick={() => {
            const prev = new Date(selectedMonth);
            prev.setMonth(prev.getMonth() - 1);
            setSelectedMonth(prev);
          }}
          className="rounded-full border border-[#1E232E] bg-[#111723] px-2 py-1 text-[#8B94A6]"
        >
          <AppIcon name="arrow-left" size={14} />
        </button>
        <button
          type="button"
          onClick={() => setMonthOpen((value) => !value)}
          className="rounded-full border border-[#2A3140] bg-[#141A25] px-4 py-1.5 text-sm font-semibold text-[#C7CEDA]"
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = new Date(selectedMonth);
            next.setMonth(next.getMonth() + 1);
            setSelectedMonth(next);
          }}
          className="rounded-full border border-[#1E232E] bg-[#111723] px-2 py-1 text-[#8B94A6]"
        >
          <AppIcon name="arrow-right" size={14} />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1E232E] bg-[#101620] text-[#8B94A6]">
            <AppIcon name="wallet" size={16} />
          </div>
          <div>
            <p className="text-xs text-[#8B94A6]">Saldo atual</p>
            <p className="text-sm font-semibold text-[#5DD6C7]">
              {loading ? "..." : formatCurrency(totalBalance, language)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1E232E] bg-[#101620] text-[#8B94A6]">
            <AppIcon name="calendar" size={16} />
          </div>
          <div>
            <p className="text-xs text-[#8B94A6]">Balanço mensal</p>
            <p className="text-sm font-semibold text-[#5DD6C7]">
              {loading ? "..." : formatCurrency(monthNet, language)}
            </p>
          </div>
        </div>
      </div>

      {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

      <div className="flex flex-col gap-3">
        {filteredTransactions.length === 0 ? (
          <p className="text-center text-xs text-[#8B94A6]">
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
            const installmentOffset = isInstallment
              ? getInstallmentMonthOffset(item.date, selectedMonth)
              : null;
            const canPayInstallment =
              isInstallment &&
              installmentOffset !== null &&
              installmentOffset === paidInstallments &&
              paidInstallments < totalInstallments;
            const canUndoInstallment = isInstallment && paidInstallments > 0;
            const title =
              item.description ||
              (isIncome
                ? t("newEntry.income")
                : isCard
                  ? t("newEntry.cardExpense")
                  : t("newEntry.expense"));
            const baseTx = baseTxById.get(item.baseId) ?? null;
            const cardName = isCard && item.card_id ? cardNameById.get(item.card_id) : null;
            return (
              <div
                key={item.displayId}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#1E232E] bg-[#121621] p-4"
              >
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-[#E4E7EC]">{title}</p>
                  <p className="text-xs text-[#8A93A3]">
                    {formatDate(item.displayDate, language)} ·{" "}
                    {item.category ?? (language === "pt" ? "Sem categoria" : "No category")}
                  </p>
                  {cardName ? (
                    <p className="text-[11px] text-[#7EA0D8]">
                      {language === "pt" ? "Cartao" : "Card"}: {cardName}
                    </p>
                  ) : null}
                  {isInstallment ? (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8A93A3]">
                      <span>
                        Parcelas: {paidInstallments}/{totalInstallments}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-[2px] text-[10px] ${
                          paidInstallments >= totalInstallments
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-amber-500/40 text-amber-300"
                        }`}
                      >
                        {paidInstallments >= totalInstallments ? "Pago" : "Em aberto"}
                      </span>
                    </div>
                  ) : null}
                  {isFixedExpense ? (
                    <span className="inline-flex rounded-full border border-[#3A8F8A] bg-[#163137] px-2 py-[2px] text-[10px] text-[#64D1C4]">
                      {t("newEntry.fixedExpense")}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <p
                    className={`text-sm font-semibold ${
                      isIncome ? "text-[#5DD6C7]" : "text-[#F59E8B]"
                    }`}
                  >
                    {isIncome ? "+" : "-"} {formatCurrency(amount, language)}
                  </p>
                  <div className="flex items-center gap-2">
                    {canPayInstallment ? (
                      <button
                        type="button"
                        onClick={() => baseTx && handleMarkInstallmentPaid(baseTx)}
                        disabled={installmentSavingId === item.baseId}
                        className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-60"
                      >
                        {installmentSavingId === item.baseId
                          ? t("common.saving")
                          : "Registrar parcela"}
                      </button>
                    ) : null}
                    {isInstallment ? (
                      <button
                        type="button"
                        onClick={() => baseTx && handleUndoInstallmentPaid(baseTx)}
                        disabled={!canUndoInstallment || undoSavingId === item.baseId}
                        className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-60"
                      >
                        {undoSavingId === item.baseId
                          ? t("common.saving")
                          : "Desfazer parcela"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => baseTx && openEdit(baseTx)}
                      className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-[#5DD6C7] hover:text-[#5DD6C7]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => baseTx && handleRemove(baseTx)}
                      disabled={deletingId === item.baseId}
                      className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                    >
                      {deletingId === item.baseId
                        ? t("common.saving")
                        : t("transactions.remove")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingTx ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#1B2230] bg-[#111723] p-5 text-[#E4E7EC] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar transacao</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="text-xs text-[#8B94A6] hover:text-[#C7CEDA]"
              >
                Fechar
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <div className="space-y-1">
                <label className="text-xs text-[#8B94A6]">Descricao</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  className="w-full rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none focus:border-[#5DD6C7]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[#8B94A6]">Valor (R$)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={editAmount}
                    onChange={(event) => setEditAmount(event.target.value)}
                    className="w-full rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none focus:border-[#5DD6C7]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#8B94A6]">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    className="w-full rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none focus:border-[#5DD6C7]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[#8B94A6]">Categoria</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                  className="w-full rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none focus:border-[#5DD6C7]"
                  placeholder="Ex: Mercado"
                />
              </div>
              {editError ? <p className="text-xs text-red-400">{editError}</p> : null}
              <button
                type="submit"
                disabled={editSaving}
                className="w-full rounded-full bg-[#E4E7EC] px-3 py-2 text-xs font-semibold text-[#0B0E13] hover:bg-white disabled:opacity-60"
              >
                {editSaving ? "Salvando..." : "Salvar"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {monthOpen ? (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-[#0B0E13]/60" />
          <div
            className="absolute left-1/2 top-24 w-56 -translate-x-1/2 rounded-2xl border border-[#1B2230] bg-[#111723] p-2 text-xs text-[#C7CEDA]"
            onClick={(e) => e.stopPropagation()}
          >
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
        </div>
      ) : null}

      {filterOpen ? (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-[#0B0E13]/60" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-[#1E232E] bg-[#121621] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#2A3140]" />
            <div className="flex flex-col gap-2 text-center text-sm text-[#8B94A6]">
              <button
                type="button"
                className="rounded-2xl bg-[#101620] py-3 text-[#5DD6C7]"
                onClick={() => {
                  setFilter("expense");
                  setFilterOpen(false);
                }}
              >
                Despesas
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[#101620] py-3 text-[#5DD6C7]"
                onClick={() => {
                  setFilter("income");
                  setFilterOpen(false);
                }}
              >
                Receitas
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[#101620] py-3 text-[#5DD6C7]"
                onClick={() => {
                  setFilter("all");
                  setFilterOpen(false);
                }}
              >
                Transações
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[#0F141E] py-3 text-[#8B94A6]"
                onClick={() => setFilterOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}







