"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { hasMissingTableError } from "@/lib/errorUtils";
import { useCurrency } from "@/lib/currency";
import { useLanguage } from "@/lib/language";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { formatCurrencyValue } from "../../shared/currency";

type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  balance: number | string | null;
};

type TransactionRow = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string | null;
  date: string;
  description: string | null;
  category: string | null;
};

type InvestmentRow = {
  id: string;
  type: "b3" | "crypto" | "fixed_income";
  symbol: string;
  name: string | null;
  quantity: number | string | null;
  average_price: number | string | null;
};

type GoalFormState = {
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string;
};

type GoalInsight = {
  goal: GoalRow;
  target: number;
  current: number;
  remaining: number;
  percent: number;
  monthlyContributionNeeded: number | null;
  monthsRemaining: number | null;
  status: "complete" | "healthy" | "attention" | "overdue" | "flex";
};

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDeadline(dateStr: string | null, language: "pt" | "en") {
  if (!dateStr) return language === "pt" ? "Sem prazo" : "No deadline";
  const date = parseLocalDate(dateStr);
  if (!date) return language === "pt" ? "Prazo invalido" : "Invalid deadline";
  return date.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function getMonthsRemaining(deadline: string | null, today = new Date()) {
  const date = parseLocalDate(deadline);
  if (!date) return null;
  const diff =
    (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth()) + 1;
  return Math.max(diff, 0);
}

function isSameMonth(value: string, month: Date) {
  const parsed = parseLocalDate(value);
  return Boolean(
    parsed &&
      parsed.getFullYear() === month.getFullYear() &&
      parsed.getMonth() === month.getMonth(),
  );
}

export function GoalsPageClient({
  initialGoals,
  accounts = [],
  transactions = [],
  investments = [],
}: {
  initialGoals: GoalRow[];
  accounts?: AccountRow[];
  transactions?: TransactionRow[];
  investments?: InvestmentRow[];
}) {
  const { currency } = useCurrency();
  const { language } = useLanguage();
  const emptyMoneyValue = formatCentsInput("", currency);
  const formatCurrency = (value: number) => formatCurrencyValue(value, language, currency);
  const [creating, setCreating] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormState>({
    name: "",
    targetAmount: emptyMoneyValue,
    currentAmount: emptyMoneyValue,
    deadline: "",
  });

  const accountBalanceTotal = useMemo(
    () => accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0),
    [accounts],
  );

  const investmentBalanceTotal = useMemo(
    () =>
      investments.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const averagePrice = Number(item.average_price) || 0;
        return sum + quantity * averagePrice;
      }, 0),
    [investments],
  );

  const currentMonthTransactions = useMemo(
    () => transactions.filter((tx) => isSameMonth(tx.date, new Date())),
    [transactions],
  );

  const monthlyIncome = useMemo(
    () =>
      currentMonthTransactions.reduce(
        (sum, tx) => (tx.type === "income" ? sum + (Number(tx.amount) || 0) : sum),
        0,
      ),
    [currentMonthTransactions],
  );

  const monthlyExpenses = useMemo(
    () =>
      currentMonthTransactions.reduce(
        (sum, tx) =>
          tx.type === "expense" || tx.type === "card_expense"
            ? sum + (Number(tx.amount) || 0)
            : sum,
        0,
      ),
    [currentMonthTransactions],
  );

  const monthlyNet = monthlyIncome - monthlyExpenses;
  const monthlyCapacity = Math.max(monthlyNet, 0);

  const goalInsights = useMemo<GoalInsight[]>(() => {
    return initialGoals.map((goal) => {
      const target = Number(goal.target_amount) || 0;
      const current = Number(goal.current_amount) || 0;
      const remaining = Math.max(target - current, 0);
      const percent = target > 0 ? Math.round(Math.min((current / target) * 100, 100)) : 0;
      const monthsRemaining = getMonthsRemaining(goal.deadline);
      const monthlyContributionNeeded =
        remaining > 0 && monthsRemaining && monthsRemaining > 0 ? remaining / monthsRemaining : null;

      let status: GoalInsight["status"] = "flex";
      if (remaining <= 0) status = "complete";
      else if (goal.deadline && monthsRemaining === 0) status = "overdue";
      else if (monthlyContributionNeeded != null) {
        status = monthlyCapacity >= monthlyContributionNeeded ? "healthy" : "attention";
      }

      return {
        goal,
        target,
        current,
        remaining,
        percent,
        monthlyContributionNeeded,
        monthsRemaining,
        status,
      };
    });
  }, [initialGoals, monthlyCapacity]);

  const summary = useMemo(() => {
    const totalTarget = goalInsights.reduce((sum, item) => sum + item.target, 0);
    const totalCurrent = goalInsights.reduce((sum, item) => sum + item.current, 0);
    const totalRemaining = goalInsights.reduce((sum, item) => sum + item.remaining, 0);
    return {
      totalTarget,
      totalCurrent,
      totalRemaining,
      progress: totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0,
      onTrackCount: goalInsights.filter((item) => item.status === "healthy").length,
      overdueCount: goalInsights.filter((item) => item.status === "overdue").length,
    };
  }, [goalInsights]);

  const topExpenseCategory = useMemo(() => {
    const totals = currentMonthTransactions.reduce<Record<string, number>>((acc, tx) => {
      if (tx.type !== "expense" && tx.type !== "card_expense") return acc;
      const category = tx.category?.trim() || (language === "pt" ? "Sem categoria" : "No category");
      acc[category] = (acc[category] ?? 0) + (Number(tx.amount) || 0);
      return acc;
    }, {});
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [currentMonthTransactions, language]);

  function openCreate() {
    setForm({ name: "", targetAmount: emptyMoneyValue, currentAmount: emptyMoneyValue, deadline: "" });
    setErrorMsg(null);
    setCreating(true);
    setEditingGoal(null);
  }

  function openEdit(goal: GoalRow) {
    setForm({
      name: goal.name,
      targetAmount: formatCentsFromNumber(goal.target_amount, currency),
      currentAmount: formatCentsFromNumber(goal.current_amount, currency),
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : "",
    });
    setErrorMsg(null);
    setCreating(false);
    setEditingGoal(goal);
  }

  function closeModal() {
    setCreating(false);
    setEditingGoal(null);
    setSaving(false);
    setErrorMsg(null);
  }

  function applyQuickCurrentAmount(amount: number) {
    setForm((current) => ({
      ...current,
      currentAmount: formatCentsFromNumber(Math.max(amount, 0), currency),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg(null);

    const target = parseCentsInput(form.targetAmount);
    const current = parseCentsInput(form.currentAmount);

    if (!form.name.trim()) {
      setErrorMsg(language === "pt" ? "De um nome a meta." : "Give the goal a name.");
      return;
    }

    if (!Number.isFinite(target) || target <= 0) {
      setErrorMsg(
        language === "pt" ? "Defina um valor-alvo maior que zero." : "Set a target above zero.",
      );
      return;
    }

    if (!Number.isFinite(current) || current < 0 || current > target) {
      setErrorMsg(
        language === "pt"
          ? "O valor atual nao pode ser negativo nem maior que o alvo."
          : "Current amount cannot be negative or above the target.",
      );
      return;
    }

    setSaving(true);

    if (creating) {
      const { error } = await supabase.from("goals").insert([
        {
          name: form.name.trim(),
          target_amount: target,
          current_amount: current,
          deadline: form.deadline || null,
        },
      ]);

      setSaving(false);
      if (error) {
        if (hasMissingTableError(error, ["goals"])) {
          setErrorMsg(
            language === "pt"
              ? "Crie a tabela goals no Supabase antes de usar metas."
              : "Create the goals table in Supabase before using goals.",
          );
          return;
        }
        console.error(error);
        setErrorMsg(language === "pt" ? "Erro ao criar meta." : "Failed to create goal.");
        return;
      }
    } else if (editingGoal) {
      const { error } = await supabase
        .from("goals")
        .update({
          name: form.name.trim(),
          target_amount: target,
          current_amount: current,
          deadline: form.deadline || null,
        })
        .eq("id", editingGoal.id);

      setSaving(false);
      if (error) {
        console.error(error);
        setErrorMsg(
          language === "pt" ? "Erro ao guardar alteracoes." : "Failed to save changes.",
        );
        return;
      }
    }

    closeModal();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDelete(goal: GoalRow) {
    const ok = window.confirm(
      language === "pt" ? `Apagar a meta "${goal.name}"?` : `Delete "${goal.name}"?`,
    );
    if (!ok) return;

    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) {
      console.error(error);
      alert(language === "pt" ? "Erro ao apagar meta." : "Failed to delete goal.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  function getStatusLabel(status: GoalInsight["status"]) {
    if (language === "pt") {
      if (status === "complete") return "Concluida";
      if (status === "healthy") return "No ritmo";
      if (status === "attention") return "Pede reforco";
      if (status === "overdue") return "Prazo vencido";
      return "Flexivel";
    }
    if (status === "complete") return "Complete";
    if (status === "healthy") return "On track";
    if (status === "attention") return "Needs attention";
    if (status === "overdue") return "Overdue";
    return "Flexible";
  }

  function getStatusClasses(status: GoalInsight["status"]) {
    if (status === "complete") return "border-[var(--green)] border-opacity-30 bg-[var(--green-dim)] text-[var(--green)]";
    if (status === "healthy") return "border-[var(--accent)] border-opacity-30 bg-[var(--accent-dim)] text-[var(--accent)]";
    if (status === "attention") return "border-[var(--amber)] border-opacity-30 bg-[var(--amber-dim)] text-[var(--amber)]";
    if (status === "overdue") return "border-[var(--red)] border-opacity-30 bg-[var(--red-dim)] text-[var(--red)]";
    return "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]";
  }

  function getProgressColor(status: GoalInsight["status"]) {
    if (status === "complete") return "bg-[var(--green)]";
    if (status === "attention" || status === "overdue") return "bg-[var(--amber)]";
    return "bg-[var(--accent)]";
  }

  const isModalOpen = creating || editingGoal !== null;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Top grid: summary + connected reading */}
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          {/* Summary panel */}
          <div className="ui-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {language === "pt" ? "Painel de metas" : "Goals board"}
                </p>
                <p className="mt-1 max-w-2xl text-xs text-[var(--text-3)]">
                  {language === "pt"
                    ? "Suas metas conectadas ao saldo, investimentos e resultado do mes."
                    : "Goals connected to your balances, investments, and monthly result."}
                </p>
              </div>
              <button type="button" onClick={openCreate} className="ui-btn ui-btn-primary shrink-0">
                {language === "pt" ? "Nova meta" : "New goal"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Acumulado" : "Saved"}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--text-1)]">{formatCurrency(summary.totalCurrent)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">{summary.progress}%</p>
              </div>
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Falta conquistar" : "Still to fund"}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--text-1)]">{formatCurrency(summary.totalRemaining)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">{goalInsights.length} {language === "pt" ? "metas" : "goals"}</p>
              </div>
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Saldo em contas" : "Cash in accounts"}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--text-1)]">{formatCurrency(accountBalanceTotal)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">{language === "pt" ? "Base liquida" : "Liquid base"}</p>
              </div>
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Sobra do mes" : "Monthly surplus"}</p>
                <p className={`mt-2 text-xl font-semibold ${monthlyNet >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                  {formatCurrency(monthlyNet)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  {summary.onTrackCount} / {goalInsights.length} {language === "pt" ? "no ritmo" : "on track"}
                </p>
              </div>
            </div>
          </div>

          {/* Connected reading panel */}
          <div className="ui-card p-5">
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {language === "pt" ? "Leitura do app" : "Connected reading"}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Fluxo do mes" : "Monthly flow"}</p>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  {language === "pt"
                    ? `Receitas: ${formatCurrency(monthlyIncome)} · Despesas: ${formatCurrency(monthlyExpenses)}`
                    : `Income: ${formatCurrency(monthlyIncome)} · Expenses: ${formatCurrency(monthlyExpenses)}`}
                </p>
              </div>
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Investimentos" : "Investments"}</p>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  {formatCurrency(investmentBalanceTotal)}
                </p>
              </div>
              <div className="ui-card-inner p-4">
                <p className="ui-eyebrow">{language === "pt" ? "Maior categoria" : "Top category"}</p>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  {topExpenseCategory
                    ? `${topExpenseCategory[0]} — ${formatCurrency(topExpenseCategory[1])}`
                    : language === "pt"
                      ? "Sem dados suficientes"
                      : "Not enough data"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Goals list */}
        {goalInsights.length === 0 ? (
          <div className="ui-card p-5 text-sm text-[var(--text-3)]">
            {language === "pt"
              ? "Ainda nao ha metas registadas. Crie uma meta e use o contexto do app para acompanhar o ritmo."
              : "There are no goals yet. Create one and use the rest of the app context to track the pace."}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <AnimatePresence>
              {goalInsights.map((item) => (
                <motion.div
                  key={item.goal.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="ui-card p-5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-[var(--text-1)]">{item.goal.name}</p>
                          <span className={`ui-badge ${getStatusClasses(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--text-3)]">
                          {language === "pt" ? "Prazo" : "Deadline"}: {formatDeadline(item.goal.deadline, language)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button type="button" onClick={() => openEdit(item.goal)} className="ui-btn ui-btn-secondary ui-btn-sm">
                          {language === "pt" ? "Editar" : "Edit"}
                        </button>
                        <button type="button" onClick={() => handleDelete(item.goal)} className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--text-3)] hover:text-[var(--red)]">
                          {language === "pt" ? "Apagar" : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ui-card-inner p-4">
                        <p className="ui-eyebrow">{language === "pt" ? "Meta" : "Target"}</p>
                        <p className="mt-2 text-lg font-semibold text-[var(--text-1)]">{formatCurrency(item.target)}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">{language === "pt" ? "Atual" : "Current"}: {formatCurrency(item.current)}</p>
                      </div>
                      <div className="ui-card-inner p-4">
                        <p className="ui-eyebrow">{language === "pt" ? "Falta" : "Remaining"}</p>
                        <p className="mt-2 text-lg font-semibold text-[var(--text-1)]">{formatCurrency(item.remaining)}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">{item.percent}%</p>
                      </div>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(item.status)}`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="ui-card-inner p-3">
                        <p className="ui-eyebrow">{language === "pt" ? "Ritmo sugerido" : "Suggested pace"}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">
                          {item.monthlyContributionNeeded != null ? formatCurrency(item.monthlyContributionNeeded) : language === "pt" ? "Livre" : "Flexible"}
                        </p>
                      </div>
                      <div className="ui-card-inner p-3">
                        <p className="ui-eyebrow">{language === "pt" ? "Meses restantes" : "Months left"}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">
                          {item.monthsRemaining != null ? `${item.monthsRemaining}` : "--"}
                        </p>
                      </div>
                      <div className="ui-card-inner p-3">
                        <p className="ui-eyebrow">{language === "pt" ? "Cobertura" : "Coverage"}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">
                          {accountBalanceTotal > 0 ? `${Math.min(Math.round((item.remaining / accountBalanceTotal) * 100), 999)}%` : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {isModalOpen ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={closeModal}
        >
          <div
            className="ui-card-2 ui-slide-up max-h-[min(90vh,720px)] w-full max-w-xl overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {creating ? (language === "pt" ? "Nova meta" : "New goal") : language === "pt" ? "Editar meta" : "Edit goal"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  {language === "pt" ? "Preencha os dados abaixo." : "Fill in the details below."}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="ui-btn ui-btn-ghost ui-btn-sm">
                {language === "pt" ? "Fechar" : "Close"}
              </button>
            </div>

            {/* Quick-fill shortcuts */}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => applyQuickCurrentAmount(accountBalanceTotal)} className="ui-card-inner p-3 text-left transition-colors hover:bg-[var(--surface-3)]">
                <p className="ui-eyebrow">{language === "pt" ? "Contas" : "Accounts"}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">{formatCurrency(accountBalanceTotal)}</p>
              </button>
              <button type="button" onClick={() => applyQuickCurrentAmount(investmentBalanceTotal)} className="ui-card-inner p-3 text-left transition-colors hover:bg-[var(--surface-3)]">
                <p className="ui-eyebrow">{language === "pt" ? "Investimentos" : "Investments"}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">{formatCurrency(investmentBalanceTotal)}</p>
              </button>
              <button type="button" onClick={() => applyQuickCurrentAmount(monthlyCapacity)} className="ui-card-inner p-3 text-left transition-colors hover:bg-[var(--surface-3)]">
                <p className="ui-eyebrow">{language === "pt" ? "Sobra do mes" : "Monthly surplus"}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">{formatCurrency(monthlyCapacity)}</p>
              </button>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">{language === "pt" ? "Nome da meta" : "Goal name"}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  className="ui-input"
                  placeholder={language === "pt" ? "Ex: Reserva de emergencia" : "Ex: Emergency fund"}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">{language === "pt" ? `Valor alvo (${currency})` : `Target amount (${currency})`}</label>
                  <input
                    type="text"
                    value={form.targetAmount}
                    onChange={(e) => setForm((s) => ({ ...s, targetAmount: formatCentsInput(e.target.value, currency) }))}
                    className="ui-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={emptyMoneyValue}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">{language === "pt" ? `Valor atual (${currency})` : `Current amount (${currency})`}</label>
                  <input
                    type="text"
                    value={form.currentAmount}
                    onChange={(e) => setForm((s) => ({ ...s, currentAmount: formatCentsInput(e.target.value, currency) }))}
                    className="ui-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={emptyMoneyValue}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">{language === "pt" ? "Prazo (opcional)" : "Deadline (optional)"}</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))}
                  className="ui-input"
                />
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 text-xs text-[var(--text-3)]">
                {language === "pt"
                  ? `Contas: ${formatCurrency(accountBalanceTotal)} · Investimentos: ${formatCurrency(investmentBalanceTotal)} · Sobra: ${formatCurrency(monthlyCapacity)}`
                  : `Accounts: ${formatCurrency(accountBalanceTotal)} · Investments: ${formatCurrency(investmentBalanceTotal)} · Surplus: ${formatCurrency(monthlyCapacity)}`}
              </div>

              {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}

              <div className="flex gap-2 sm:justify-end">
                <button type="button" onClick={closeModal} className="ui-btn ui-btn-secondary flex-1 sm:flex-none">
                  {language === "pt" ? "Cancelar" : "Cancel"}
                </button>
                <button type="submit" disabled={saving} className="ui-btn ui-btn-primary flex-1 sm:flex-none">
                  {saving
                    ? (language === "pt" ? "A guardar..." : "Saving...")
                    : creating
                      ? (language === "pt" ? "Criar meta" : "Create goal")
                      : (language === "pt" ? "Guardar" : "Save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
