"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useLanguage } from "@/lib/language";
import {
  BudgetRow,
  BudgetTransaction,
  buildBudgetMonthEntries,
  getBudgetTransactionsQueryEnd,
  getMonthKey,
  summarizeMonthlyBudget,
} from "@/lib/budget";
import { hasMissingColumnError, hasMissingTableError } from "@/lib/errorUtils";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { AppIcon } from "@/components/AppIcon";
import { formatCurrencyValue } from "../../../shared/currency";

type RawBudgetTransaction = BudgetTransaction & {
  value?: number | string | null;
};

function formatMonthLabel(date: Date, language: "pt" | "en") {
  return date.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function normalizeTransactions(rows: RawBudgetTransaction[]) {
  return rows.map((row) => ({
    ...row,
    amount: row.amount ?? row.value ?? 0,
  })) as BudgetTransaction[];
}

export function BudgetScreen() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState(formatCentsInput("", currency));

  const monthKey = useMemo(() => getMonthKey(selectedMonth), [selectedMonth]);
  const monthLabel = useMemo(
    () => formatMonthLabel(selectedMonth, language),
    [language, selectedMonth],
  );
  const emptyMoneyValue = useMemo(() => formatCentsInput("", currency), [currency]);

  const monthEntries = useMemo(() => {
    return buildBudgetMonthEntries(transactions, selectedMonth, {
      uncategorized: language === "pt" ? "Sem categoria" : "No category",
      entry: language === "pt" ? "Lancamento" : "Entry",
    });
  }, [language, selectedMonth, transactions]);

  const budgetSummary = useMemo(
    () => summarizeMonthlyBudget(budgets, monthEntries),
    [budgets, monthEntries],
  );

  const formatCurrency = useCallback(
    (value: number) => formatCurrencyValue(value, language, currency),
    [currency, language],
  );

  const loadData = useCallback(async () => {
    if (!user) {
      setBudgets([]);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const queryEnd = getBudgetTransactionsQueryEnd(selectedMonth);
    const txSelect =
      "id,type,amount,value,date,description,category,is_fixed,installment_total,responsibility_installment_indexes";

    const [budgetResult, txResult] = await Promise.all([
      supabase
        .from("category_budgets")
        .select("id,category,amount,month_key")
        .eq("user_id", user.id)
        .eq("month_key", monthKey)
        .order("category", { ascending: true }),
      supabase
        .from("transactions")
        .select(txSelect)
        .eq("user_id", user.id)
        .lte("date", queryEnd)
        .order("date", { ascending: false }),
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

    let nextTransactions: BudgetTransaction[] = [];
    if (txResult.error) {
      const canFallback = hasMissingColumnError(txResult.error, [
        "value",
        "amount",
        "responsibility_installment_indexes",
      ]);

      if (!canFallback) {
        setTransactions([]);
        setErrorMsg((current) =>
          current ??
          (language === "pt" ? "Falha ao carregar transacoes." : "Failed to load transactions."),
        );
      } else {
        const fallbackSelect = hasMissingColumnError(txResult.error, ["value"])
          ? "id,type,amount,date,description,category,is_fixed,installment_total"
          : "id,type,value,date,description,category,is_fixed,installment_total";

        const fallbackResult = await supabase
          .from("transactions")
          .select(fallbackSelect)
          .eq("user_id", user.id)
          .lte("date", queryEnd)
          .order("date", { ascending: false });

        if (fallbackResult.error) {
          setTransactions([]);
          setErrorMsg((current) =>
            current ??
            (language === "pt" ? "Falha ao carregar transacoes." : "Failed to load transactions."),
          );
        } else {
          nextTransactions = normalizeTransactions(
            (fallbackResult.data ?? []).map((row) => ({
              ...row,
              responsibility_installment_indexes: null,
            })) as RawBudgetTransaction[],
          );
        }
      }
    } else {
      nextTransactions = normalizeTransactions((txResult.data ?? []) as RawBudgetTransaction[]);
    }

    setTransactions(nextTransactions);
    setLoading(false);
  }, [language, monthKey, selectedMonth, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  useEffect(() => {
    function handleRefresh() {
      void loadData();
    }

    window.addEventListener("data-refresh", handleRefresh);
    return () => window.removeEventListener("data-refresh", handleRefresh);
  }, [loadData]);

  function resetForm() {
    setEditingBudget(null);
    setFormCategory("");
    setFormAmount(formatCentsInput("", currency));
  }

  async function handleSaveBudget() {
    if (!user) return;

    const category = formCategory.trim();
    const amount = parseCentsInput(formAmount);

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

    const existingBudget = budgets.find((budget) =>
      budget.category.trim().toLowerCase() === category.toLowerCase(),
    );
    const targetBudget = editingBudget ?? existingBudget ?? null;
    const payload = {
      category,
      amount,
      month_key: monthKey,
      user_id: user.id,
    };

    const query = targetBudget
      ? supabase.from("category_budgets").update(payload).eq("id", targetBudget.id)
      : supabase.from("category_budgets").insert([payload]);

    const { error } = await query;
    setSaving(false);

    if (error) {
      setErrorMsg(language === "pt" ? "Falha ao salvar orcamento." : "Failed to save budget.");
      return;
    }

    resetForm();
    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDeleteBudget(budget: BudgetRow) {
    const confirmed = window.confirm(
      language === "pt"
        ? `Remover orcamento de ${budget.category}?`
        : `Remove ${budget.category} budget?`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("category_budgets").delete().eq("id", budget.id);
    if (error) {
      setErrorMsg(language === "pt" ? "Falha ao apagar orcamento." : "Failed to delete budget.");
      return;
    }

    if (editingBudget?.id === budget.id) {
      resetForm();
    }

    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="ui-eyebrow">{t("tabs.budget")}</p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--text-1)]">
            {t("budget.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">{t("budget.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={() =>
              setSelectedMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
            className="ui-btn ui-btn-secondary ui-btn-sm"
          >
            <AppIcon name="arrow-left" size={14} />
          </button>
          <div className="rounded-full border border-[var(--border-bright)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text-2)]">
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={() =>
              setSelectedMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
            className="ui-btn ui-btn-secondary ui-btn-sm"
          >
            <AppIcon name="arrow-right" size={14} />
          </button>
        </div>
      </div>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t("budget.schemaMissing")}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-xl border border-[var(--red-dim)] bg-[var(--red-dim)] px-4 py-3 text-sm text-[var(--red)]">
          {errorMsg}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ui-card p-4">
          <p className="ui-eyebrow">{t("budget.planned")}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
            {loading ? "—" : formatCurrency(budgetSummary.plannedTotal)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.monthBudget")}</p>
        </div>
        <div className="ui-card p-4">
          <p className="ui-eyebrow">{t("budget.spent")}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--red)]">
            {loading ? "—" : formatCurrency(budgetSummary.spentTotal)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.currentExpenses")}</p>
        </div>
        <div className="ui-card p-4">
          <p className="ui-eyebrow">{t("budget.remaining")}</p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              budgetSummary.remainingTotal >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
            }`}
          >
            {loading ? "—" : formatCurrency(budgetSummary.remainingTotal)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.availableToSpend")}</p>
        </div>
        <div className="ui-card p-4">
          <p className="ui-eyebrow">{t("budget.incomeCoverage")}</p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              budgetSummary.coverage >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
            }`}
          >
            {loading ? "—" : formatCurrency(budgetSummary.coverage)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.basedOnIncome")}</p>
        </div>
      </div>

      <div className="ui-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{t("budget.addTitle")}</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.addHint")}</p>
          </div>
          <button type="button" onClick={resetForm} className="ui-btn ui-btn-secondary ui-btn-sm">
            {t("budget.newCategory")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_140px]">
          <input
            type="text"
            value={formCategory}
            onChange={(event) => setFormCategory(event.target.value)}
            placeholder={t("budget.categoryPlaceholder")}
            className="ui-input"
          />
          <input
            type="text"
            inputMode="numeric"
            value={formAmount}
            onChange={(event) => setFormAmount(formatCentsInput(event.target.value, currency))}
            placeholder={emptyMoneyValue}
            className="ui-input"
          />
          <button
            type="button"
            onClick={() => void handleSaveBudget()}
            disabled={saving || schemaMissing}
            className="ui-btn ui-btn-primary"
          >
            {saving
              ? t("common.saving")
              : editingBudget
                ? t("budget.update")
                : t("common.save")}
          </button>
        </div>
      </div>

      <div className="ui-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{t("budget.categoriesTitle")}</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">{t("budget.categoriesHint")}</p>
          </div>
          <Link href="/" className="ui-btn ui-btn-ghost ui-btn-sm">
            {t("budget.viewOnHome")}
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-3)]">{t("common.loading")}</p>
        ) : budgetSummary.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-bright)] px-4 py-8 text-center text-sm text-[var(--text-3)]">
            {t("budget.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            {budgetSummary.rows.map((budget) => (
              <div key={budget.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-1)]">{budget.category}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-3)]">
                      <span>
                        {t("budget.planned")}: {formatCurrency(budget.planned)}
                      </span>
                      <span>·</span>
                      <span>
                        {t("budget.spent")}: {formatCurrency(budget.spent)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBudget(budget);
                        setFormCategory(budget.category);
                        setFormAmount(formatCentsFromNumber(Number(budget.amount) || 0, currency));
                      }}
                      className="ui-btn ui-btn-secondary ui-btn-sm"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBudget(budget)}
                      className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--red)] hover:bg-[var(--red-dim)]"
                    >
                      {language === "pt" ? "Apagar" : "Delete"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                  <div
                    className={`h-2 rounded-full ${
                      budget.progress >= 100
                        ? "bg-[var(--red)]"
                        : budget.progress >= 80
                          ? "bg-[#F59E0B]"
                          : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${budget.progress}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-3)]">
                    {t("budget.progressLabel")}: {Math.round(budget.progress)}%
                  </span>
                  <span
                    className={`font-semibold ${
                      budget.remaining >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                    }`}
                  >
                    {t("budget.remaining")}: {formatCurrency(budget.remaining)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
