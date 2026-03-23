"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { hasMissingTableError } from "@/lib/errorUtils";
import { useCurrency } from "@/lib/currency";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { formatCurrencyValue } from "../../shared/currency";

type BudgetRow = {
  id: string;
  category: string;
  amount: number | string;
  month_key: string;
};

type TransactionRow = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string;
  description: string | null;
  category: string | null;
  date: string;
  is_fixed: boolean | null;
  is_installment: boolean | null;
  installment_total: number | null;
};

type DisplayExpense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  dueDate: string;
};

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMonthsClamped(date: Date, monthsToAdd: number) {
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

function formatMonthLabel(date: Date, language: "pt" | "en") {
  return date.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

export function RecurringPlanningPanel({ language }: { language: "pt" | "en" }) {
  const { currency } = useCurrency();
  const emptyMoneyValue = formatCentsInput("", currency);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState(emptyMoneyValue);

  const monthKey = useMemo(() => getMonthKey(selectedMonth), [selectedMonth]);
  const formatCurrency = useCallback(
    (value: number) => formatCurrencyValue(value, language, currency),
    [currency, language],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const monthEnd = toDateString(
      new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0),
    );

    const [budgetResult, txResult] = await Promise.all([
      supabase
        .from("category_budgets")
        .select("id,category,amount,month_key")
        .eq("month_key", monthKey)
        .order("category", { ascending: true }),
      supabase
        .from("transactions")
        .select("id,type,amount,description,category,date,is_fixed,is_installment,installment_total")
        .lte("date", monthEnd)
        .order("date", { ascending: true }),
    ]);

    if (budgetResult.error) {
      if (hasMissingTableError(budgetResult.error, ["category_budgets"])) {
        setSchemaMissing(true);
        setBudgets([]);
      } else {
        setErrorMsg(
          language === "pt" ? "Falha ao carregar orcamentos." : "Failed to load budgets.",
        );
      }
    } else {
      setSchemaMissing(false);
      setBudgets((budgetResult.data ?? []) as BudgetRow[]);
    }

    if (txResult.error) {
      setTransactions([]);
      setErrorMsg(
        language === "pt" ? "Falha ao carregar transacoes." : "Failed to load transactions.",
      );
    } else {
      setTransactions((txResult.data ?? []) as TransactionRow[]);
    }

    setLoading(false);
  }, [language, monthKey, selectedMonth]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadData]);

  useEffect(() => {
    function handleRefresh() {
      void loadData();
    }
    window.addEventListener("data-refresh", handleRefresh);
    return () => window.removeEventListener("data-refresh", handleRefresh);
  }, [loadData]);

  const monthExpenses = (() => {
    const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const monthEnd = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    return transactions.flatMap((tx) => {
      const txDate = parseLocalDate(tx.date);
      if (!txDate) return [];

      const amount = Number(tx.amount) || 0;
      if (amount <= 0 || tx.type === "income") return [];

      const title =
        tx.description?.trim() ||
        tx.category?.trim() ||
        (language === "pt" ? "Lancamento" : "Entry");
      const category =
        tx.category?.trim() || (language === "pt" ? "Sem categoria" : "No category");

      const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
      if (totalInstallments > 0) {
        const perInstallment = amount / totalInstallments;
        const rows: DisplayExpense[] = [];
        for (let index = 0; index < totalInstallments; index += 1) {
          const dueDate = addMonthsClamped(txDate, index);
          if (dueDate < monthStart || dueDate > monthEnd) continue;
          rows.push({
            id: `${tx.id}-${index + 1}`,
            title,
            category,
            amount: perInstallment,
            dueDate: toDateString(dueDate),
          });
        }
        return rows;
      }

      if (tx.is_fixed) {
        const monthOffset =
          (monthStart.getFullYear() - txDate.getFullYear()) * 12 +
          (monthStart.getMonth() - txDate.getMonth());
        if (monthOffset < 0) return [];

        const dueDate = addMonthsClamped(txDate, monthOffset);
        if (dueDate < monthStart || dueDate > monthEnd) return [];

        return [
          {
            id: `${tx.id}-fixed-${monthOffset}`,
            title,
            category,
            amount,
            dueDate: toDateString(dueDate),
          },
        ];
      }

      if (txDate < monthStart || txDate > monthEnd) return [];
      return [
        {
          id: tx.id,
          title,
          category,
          amount,
          dueDate: toDateString(txDate),
        },
      ];
    });
  })();

  const spentByCategory = (() => {
    return monthExpenses.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {});
  })();

  const budgetSummary = (() => {
    return budgets.map((budget) => {
      const planned = Number(budget.amount) || 0;
      const spent = spentByCategory[budget.category] ?? 0;
      const remaining = planned - spent;
      const progress = planned > 0 ? Math.min((spent / planned) * 100, 100) : 0;
      return { ...budget, planned, spent, remaining, progress };
    });
  })();

  const fixedBills = (() => {
    const today = new Date();
    const currentMonthKey = getMonthKey(today);

    return monthExpenses
      .filter((item) => item.id.includes("-fixed-"))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((bill) => {
        const dueDate = parseLocalDate(bill.dueDate) ?? today;
        const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diffDays = Math.round(
          (dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
        );

        let status: "future" | "upcoming" | "today" | "overdue" = "future";
        if (monthKey === currentMonthKey) {
          if (diffDays < 0) status = "overdue";
          else if (diffDays === 0) status = "today";
          else status = "upcoming";
        }

        return { ...bill, diffDays, status };
      });
  })();

  function resetBudgetForm() {
    setEditingBudget(null);
    setFormCategory("");
    setFormAmount(formatCentsInput("", currency));
  }

  async function handleSaveBudget() {
    const amount = parseCentsInput(formAmount);
    const category = formCategory.trim();

    if (!category) {
      setErrorMsg(language === "pt" ? "Informe a categoria." : "Enter the category.");
      return;
    }
    if (amount <= 0) {
      setErrorMsg(language === "pt" ? "Informe um valor valido." : "Enter a valid amount.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      category,
      amount,
      month_key: monthKey,
    };

    const query = editingBudget
      ? supabase.from("category_budgets").update(payload).eq("id", editingBudget.id)
      : supabase.from("category_budgets").insert([payload]);

    const { error } = await query;
    setSaving(false);

    if (error) {
      setErrorMsg(
        language === "pt" ? "Falha ao salvar orcamento." : "Failed to save budget.",
      );
      return;
    }

    resetBudgetForm();
    void loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDeleteBudget(budget: BudgetRow) {
    const confirmed = window.confirm(
      language === "pt"
        ? `Remover orcamento de ${budget.category}?`
        : `Remove budget for ${budget.category}?`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("category_budgets").delete().eq("id", budget.id);
    if (error) {
      setErrorMsg(
        language === "pt" ? "Falha ao apagar orcamento." : "Failed to delete budget.",
      );
      return;
    }

    void loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#E4E7EC]">
              {language === "pt" ? "Planejamento recorrente" : "Recurring planning"}
            </p>
            <p className="mt-1 text-xs text-[#8A93A3]">
              {language === "pt"
                ? "Orcamentos por categoria, contas fixas do mes e vencimentos."
                : "Category budgets, monthly fixed bills, and due dates."}
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end">
            <button
              type="button"
              onClick={() =>
                setSelectedMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-xs text-[#C7CEDA]"
            >
              {"<"}
            </button>
            <div className="min-w-0 flex-1 rounded-full border border-[#2A3140] bg-[#151A27] px-4 py-1.5 text-center text-xs text-[#C7CEDA] md:flex-none">
              {formatMonthLabel(selectedMonth, language)}
            </div>
            <button
              type="button"
              onClick={() =>
                setSelectedMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-xs text-[#C7CEDA]"
            >
              {">"}
            </button>
          </div>
        </div>

        {schemaMissing ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {language === "pt"
              ? "Atualize o banco com supabase/schema.sql para usar orcamentos por categoria."
              : "Update your database with supabase/schema.sql to use category budgets."}
          </div>
        ) : null}
        {errorMsg ? <p className="mt-4 text-xs text-red-400">{errorMsg}</p> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-[#1E232E] bg-[#101620] p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[#E4E7EC]">
                {language === "pt" ? "Orcamentos do mes" : "Monthly budgets"}
              </p>
              <button
                type="button"
                onClick={resetBudgetForm}
                className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-xs text-[#C7CEDA]"
              >
                {language === "pt" ? "Novo" : "New"}
              </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_120px]">
              <input
                type="text"
                value={formCategory}
                onChange={(event) => setFormCategory(event.target.value)}
                placeholder={language === "pt" ? "Categoria" : "Category"}
                className="min-w-0 rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none"
              />
              <input
                type="text"
                inputMode="numeric"
                value={formAmount}
                onChange={(event) => setFormAmount(formatCentsInput(event.target.value, currency))}
                placeholder={emptyMoneyValue}
                className="min-w-0 rounded-xl border border-[#1C2332] bg-[#0F141E] px-3 py-2 text-sm text-[#E4E7EC] outline-none"
              />
              <button
                type="button"
                onClick={handleSaveBudget}
                disabled={saving || schemaMissing}
                className="rounded-xl bg-[#E4E7EC] px-4 py-2 text-sm font-semibold text-[#0B0E13] disabled:opacity-60"
              >
                {saving
                  ? language === "pt"
                    ? "Salvando..."
                    : "Saving..."
                  : editingBudget
                    ? language === "pt"
                      ? "Atualizar"
                      : "Update"
                    : language === "pt"
                      ? "Salvar"
                      : "Save"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt" ? "Carregando..." : "Loading..."}
                </p>
              ) : budgetSummary.length === 0 ? (
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Ainda nao ha orcamentos definidos para este mes."
                    : "No budgets defined for this month yet."}
                </p>
              ) : (
                budgetSummary.map((budget) => (
                  <div key={budget.id} className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#E4E7EC]">{budget.category}</p>
                        <p className="mt-1 text-xs text-[#8A93A3]">
                          {language === "pt" ? "Planejado" : "Planned"}: {formatCurrency(budget.planned)} ·{" "}
                          {language === "pt" ? "Gasto" : "Spent"}: {formatCurrency(budget.spent)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBudget(budget);
                            setFormCategory(budget.category);
                            setFormAmount(
                              formatCentsFromNumber(Number(budget.amount) || 0, currency),
                            );
                          }}
                          className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-[11px] text-[#C7CEDA]"
                        >
                          {language === "pt" ? "Editar" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBudget(budget)}
                          className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-[11px] text-[#C7CEDA]"
                        >
                          {language === "pt" ? "Apagar" : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1A2230]">
                      <div
                        className={`h-2 rounded-full ${
                          budget.progress >= 100
                            ? "bg-rose-400"
                            : budget.progress >= 80
                              ? "bg-amber-400"
                              : "bg-[#5DD6C7]"
                        }`}
                        style={{ width: `${budget.progress}%` }}
                      />
                    </div>
                    <p
                      className={`mt-2 text-xs ${
                        budget.remaining >= 0 ? "text-[#8A93A3]" : "text-rose-300"
                      }`}
                    >
                      {language === "pt" ? "Saldo do orcamento" : "Budget remaining"}:{" "}
                      {formatCurrency(budget.remaining)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E232E] bg-[#101620] p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[#E4E7EC]">
                {language === "pt" ? "Calendario de contas fixas" : "Fixed bills calendar"}
              </p>
              <span className="rounded-full border border-[#2A3140] bg-[#151A27] px-3 py-1 text-[11px] text-[#C7CEDA]">
                {fixedBills.length}
              </span>
            </div>
            <div className="space-y-3">
              {loading ? (
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt" ? "Carregando..." : "Loading..."}
                </p>
              ) : fixedBills.length === 0 ? (
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Nenhuma conta fixa registrada para este mes."
                    : "No fixed bills registered for this month."}
                </p>
              ) : (
                fixedBills.map((bill) => (
                  <div key={bill.id} className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#E4E7EC]">{bill.title}</p>
                        <p className="mt-1 text-xs text-[#8A93A3]">
                          {bill.category} ·{" "}
                          {new Date(bill.dueDate).toLocaleDateString(
                            language === "pt" ? "pt-BR" : "en-US",
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#E4E7EC] sm:text-right">
                        {formatCurrency(bill.amount)}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-xs ${
                        bill.status === "overdue"
                          ? "text-rose-300"
                          : bill.status === "today"
                            ? "text-amber-300"
                            : bill.status === "upcoming"
                              ? "text-[#8A93A3]"
                              : "text-[#6E7788]"
                      }`}
                    >
                      {bill.status === "overdue"
                        ? language === "pt"
                          ? `Atrasada ha ${Math.abs(bill.diffDays)} dia(s)`
                          : `Overdue by ${Math.abs(bill.diffDays)} day(s)`
                        : bill.status === "today"
                          ? language === "pt"
                            ? "Vence hoje"
                            : "Due today"
                          : bill.status === "upcoming"
                            ? language === "pt"
                              ? `Vence em ${bill.diffDays} dia(s)`
                              : `Due in ${bill.diffDays} day(s)`
                            : language === "pt"
                              ? "Mes futuro"
                              : "Future month"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
