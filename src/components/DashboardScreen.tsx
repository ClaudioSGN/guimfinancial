"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountsList } from "@/components/AccountsList";
import { NewAccountButton } from "@/components/NewAccountButton";
import { NewTransactionButton } from "@/components/NewTransactionButton";
import { TransactionRow } from "@/components/TransactionRow";
import { GoalsPageClient } from "@/components/GoalsPageClient";
import { TopBar } from "@/components/TopBar";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useCurrency } from "@/lib/currency";
import { formatCurrencyValue } from "../../shared/currency";
import type { AccountStat } from "@/lib/accountTypes";
type UiTransaction = {
  id: string;
  description: string;
  value: number;
  type: "income" | "expense";
  date: string;
  createdAt: string;
  accountId: string | null;
  accountName: string | null;
  category: string | null;
  isInstallment: boolean;
  installmentTotal: number | null;
  isPaid: boolean;
  installmentsPaid: number;
  installmentIndex?: number | null;
};

type AccountRow = {
  id: string;
  name: string;
};

type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
};

type Props = {
  accounts: AccountStat[];
  transactions: UiTransaction[];
  accountsForTx: AccountRow[];
  goals: GoalRow[];
};

const CATEGORY_PALETTE = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#eab308", "#14b8a6", "#f472b6"];

const TAB_OPTIONS = ["Resumo", "Bancos", "Metas"] as const;
type TabKey = (typeof TAB_OPTIONS)[number];

export function DashboardScreen({
  accounts,
  transactions,
  accountsForTx,
  goals,
}: Props) {
  const { currency } = useCurrency();
  const formatCurrency = (value: number) => formatCurrencyValue(value, "pt", currency);
  const [active, setActive] = useState<TabKey>("Resumo");
  const [isMobile, setIsMobile] = useState(false);
  const chartsReady = true;
  useEffect(() => {
    const handleResize = () =>
      setIsMobile(typeof window !== "undefined" ? window.innerWidth < 768 : false);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const categoryChartHeight = isMobile ? 240 : 320;
  const categoryChartMargin = isMobile
    ? { top: 8, right: 12, left: 12, bottom: 8 }
    : { top: 14, right: 32, left: 90, bottom: 14 };
  const categoryLabelWidth = isMobile ? 100 : 140;
  const monthOptions = useMemo(() => {
    const set = new Map<string, string>();
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}`;
    set.set(
      currentKey,
      new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      }).format(now),
    );
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (Number.isNaN(d.getTime())) return;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      });
      set.set(key, formatter.format(d));
    });
    return Array.from(set.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [transactions]);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    monthOptions[0]?.key ?? currentMonthKey,
  );
  const effectiveSelectedMonth =
    selectedMonth ?? monthOptions[0]?.key ?? null;

  const hasTransactions = transactions.length > 0;
  const bankAccounts = accounts.filter(
    (acc) => acc.accountType !== "card",
  );
  const creditCards = accounts.filter((acc) => acc.accountType === "card");
  const monthKeys = monthOptions.map((m) => m.key);
  const activeMonthIndex = monthKeys.findIndex(
    (k) => k === effectiveSelectedMonth,
  );
  const prevMonthKey =
    activeMonthIndex >= 0 && activeMonthIndex < monthKeys.length - 1
      ? monthKeys[activeMonthIndex + 1]
      : null;
  const nextMonthKey =
    activeMonthIndex > 0 ? monthKeys[activeMonthIndex - 1] : null;
  const filteredTransactions = useMemo(() => {
    if (!effectiveSelectedMonth) return transactions;
    const [yStr, mStr] = effectiveSelectedMonth.split("-");
    const targetYear = Number(yStr);
    const targetMonth = Number(mStr) - 1; // JS 0-11

    const toMonthEntries = (tx: typeof transactions[number]) => {
      const start = new Date(tx.date);
      if (Number.isNaN(start.getTime())) return [];

      if (!tx.isInstallment || !tx.installmentTotal || tx.installmentTotal <= 0) {
        return start.getFullYear() === targetYear &&
          start.getMonth() === targetMonth
          ? [tx]
          : [];
      }

      const perInstallment = tx.value / tx.installmentTotal;
      const entries: typeof transactions = [];

      for (let i = 0; i < tx.installmentTotal; i += 1) {
        const monthDate = new Date(start);
        monthDate.setMonth(start.getMonth() + i);
        if (
          monthDate.getFullYear() === targetYear &&
          monthDate.getMonth() === targetMonth
        ) {
          entries.push({
            ...tx,
            value: perInstallment,
            date: monthDate.toISOString(),
            isPaid: i < tx.installmentsPaid,
            installmentsPaid: tx.installmentsPaid,
            installmentTotal: tx.installmentTotal,
            installmentIndex: i,
          });
        }
      }

      return entries;
    };

    return transactions.flatMap(toMonthEntries);
  }, [transactions, effectiveSelectedMonth]);

  const monthSummary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.value, 0);
    const totalExpense = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.value, 0);
    const openExpenseTotal = filteredTransactions.reduce((sum, t) => {
      if (t.type !== "expense") return sum;
      if (t.isInstallment && t.installmentTotal && t.installmentTotal > 0) {
        return t.isPaid ? sum : sum + t.value;
      }
      if (!t.isPaid) return sum + t.value;
      return sum;
    }, 0);
    return { totalIncome, totalExpense, openExpenseTotal };
  }, [filteredTransactions]);

  const [categoryMode, setCategoryMode] = useState<"mixed" | "expense" | "income">("expense");
  const categoryStats = useMemo(() => {
    const filtered =
      categoryMode === "mixed"
        ? filteredTransactions
        : filteredTransactions.filter((tx) =>
            categoryMode === "expense" ? tx.type === "expense" : tx.type === "income",
          );

    const totals = new Map<string, number>();
    filtered.forEach((tx) => {
      const cat = tx.category ?? "Sem categoria";
      const prev = totals.get(cat) ?? 0;
      totals.set(cat, prev + tx.value);
    });

    const items = Array.from(totals.entries()).map(([category, total]) => ({
      category,
      total,
    }));

    return items.sort((a, b) => b.total - a.total);
  }, [filteredTransactions, categoryMode]);
  const categoryChartData = useMemo(
    () =>
      categoryStats.map((item, idx) => ({
        ...item,
        color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
      })),
    [categoryStats],
  );
  const selectedMonthLabel =
    monthOptions.find((m) => m.key === effectiveSelectedMonth)?.label ??
    "Sem mes";

  return (
    <div className="relative flex flex-1 flex-col gap-6 rounded-[34px] p-1 md:p-2">
      <TopBar
        tabs={TAB_OPTIONS}
        activeTab={active}
        onTabChange={setActive}
        userName="Usuário"
        role="Admin"
        monthLabel={selectedMonthLabel}
        onPrevMonth={
          prevMonthKey ? () => setSelectedMonth(prevMonthKey) : undefined
        }
        onNextMonth={
          nextMonthKey ? () => setSelectedMonth(nextMonthKey) : undefined
        }
      />

      {active === "Resumo" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="app-surface app-card-soft p-5">
              <p className="app-eyebrow">
                Saldo total
              </p>
              <p className="app-stat-value mt-3">
                {formatCurrency(monthSummary.totalIncome - monthSummary.totalExpense)}
              </p>
              <p className="mt-2 text-xs text-[#5c738f]">Atualizado com contas</p>
            </div>
            <div className="app-surface app-card-soft p-5">
              <p className="app-eyebrow">
                Entradas
              </p>
              <p className="app-stat-value tone-income mt-3">
                {formatCurrency(monthSummary.totalIncome)}
              </p>
              <p className="mt-2 text-xs text-[#5c738f]">
                Com base nas transações
              </p>
            </div>
            <div className="app-surface app-card-soft p-5">
              <p className="app-eyebrow">
                Saídas
              </p>
              <p className="app-stat-value tone-expense mt-3">
                {formatCurrency(monthSummary.totalExpense)}
              </p>
              <p className="mt-2 text-xs text-[#5c738f]">Inclui parcelas</p>
            </div>
          </div>


<div className="app-surface app-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="app-eyebrow">
                  Categorias
                </p>
                <p className="text-sm text-[#5c738f]">
                  Distribuição por categoria ({categoryMode})
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {(["mixed", "expense", "income"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCategoryMode(mode)}
                    className={`rounded-full border px-3 py-1 transition ${
                      categoryMode === mode
                        ? "border-[#99bcff] bg-white/85 text-[#2559a6] shadow-[0_10px_24px_rgba(134,153,181,0.14)]"
                        : "border-white/55 bg-white/35 text-[#617287] hover:text-[#122033]"
                    }`}
                  >
                    {mode === "mixed" ? "Mista" : mode === "expense" ? "Despesas" : "Receitas"}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full min-h-[220px]">
              {chartsReady && categoryChartData.length ? (
                <ResponsiveContainer
                  width="100%"
                  height={categoryChartHeight}
                  minWidth={1}
                  minHeight={220}
                >
                  <BarChart
                    data={categoryChartData}
                    layout="vertical"
                    margin={categoryChartMargin}
                    barCategoryGap={isMobile ? "28%" : "18%"}
                    barGap={isMobile ? 6 : 10}
                  >
                    <CartesianGrid
                      stroke="#d5deea"
                      strokeDasharray="2 6"
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      stroke="#8ea0b7"
                      tick={{ fill: "#73849a", fontSize: isMobile ? 9 : 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        formatCurrencyValue(Number(v) || 0, "pt", currency, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })
                      }
                      padding={{ left: 4, right: isMobile ? 8 : 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      stroke="#8ea0b7"
                      tick={{
                        fill: "#44566e",
                        fontSize: isMobile ? 10 : 11,
                      }}
                      tickFormatter={(label: string) =>
                        label.length > (isMobile ? 12 : 18)
                          ? `${label.slice(0, isMobile ? 11 : 16)}…`
                          : label
                      }
                      axisLine={false}
                      tickLine={false}
                      width={categoryLabelWidth}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255,255,255,0.88)",
                        border: "1px solid rgba(255,255,255,0.7)",
                        borderRadius: 12,
                        color: "#122033",
                        fontSize: 12,
                        boxShadow: "0 16px 38px rgba(142,160,184,0.18)",
                        backdropFilter: "blur(12px)",
                      }}
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                      labelFormatter={(label) => `${label ?? ""}`}
                    />
                    <Bar
                      dataKey="total"
                      radius={[10, 10, 10, 10]}
                      maxBarSize={isMobile ? 38 : 46}
                    >
                      {categoryChartData.map((item) => (
                        <Cell key={item.category} fill={item.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[22px] bg-white/35 text-xs text-[#6a7890]">
                  {chartsReady
                    ? `Ainda não há registros para ${selectedMonthLabel}.`
                    : "Carregando gráfico..."}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="app-surface app-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="app-eyebrow">
                  Transações
                </p>
              </div>
              <div className="flex items-center gap-2">
                <NewTransactionButton accounts={accountsForTx} />
              </div>
            </div>

              <div className="mt-4 space-y-2">
                {hasTransactions && filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))
                ) : (
                  <p className="text-xs text-[#6a7890]">
                    Nenhuma transação neste mês. Adicione a primeira.
                  </p>
                )}
              </div>
            </div>

            <div className="app-surface app-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <p className="app-eyebrow">
                    Bancos e contas
                  </p>
                  <p className="text-sm text-[#5c738f]">
                    Limites, saldos e fatura atual
                  </p>
                </div>
                <NewAccountButton />
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Contas bancárias
                  </p>
                  {bankAccounts.length ? (
                    <AccountsList accounts={bankAccounts} />
                  ) : (
                    <p className="mt-2 text-xs text-[#6a7890]">
                      Nenhuma conta bancária cadastrada.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Cartões de crédito
                  </p>
                  {creditCards.length ? (
                    <AccountsList accounts={creditCards} />
                  ) : (
                    <p className="mt-2 text-xs text-[#6a7890]">
                      Nenhum cartão cadastrado.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {active === "Bancos" && (
        <div className="space-y-4">
          <div className="app-surface app-card flex items-center justify-between gap-2 px-4 py-4">
            <div className="flex flex-col gap-1">
              <p className="app-eyebrow">
                Bancos e contas
              </p>
              <p className="text-sm text-[#5c738f]">
                Separe contas correntes e cartões.
              </p>
            </div>
            <NewAccountButton />
          </div>

          <div className="space-y-3">
            <div>
              <p className="app-eyebrow">
                Contas bancárias
              </p>
              {bankAccounts.length ? (
                <AccountsList accounts={bankAccounts} />
              ) : (
                <p className="mt-2 text-xs text-[#6a7890]">
                  Nenhuma conta bancária cadastrada.
                </p>
              )}
            </div>
            <div>
              <p className="app-eyebrow">
                Cartões de crédito
              </p>
              {creditCards.length ? (
                <AccountsList accounts={creditCards} />
              ) : (
                <p className="mt-2 text-xs text-[#6a7890]">
                  Nenhum cartão cadastrado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {active === "Metas" && (
        <div className="space-y-4">
          <div className="app-surface app-card flex items-center justify-between gap-2 px-4 py-4">
            <div className="flex flex-col gap-1">
              <p className="app-eyebrow">
                Metas financeiras
              </p>
              <p className="text-sm text-[#5c738f]">
                Acompanhe o progresso dos objetivos.
              </p>
            </div>
          </div>
          <GoalsPageClient initialGoals={goals} />
        </div>
      )}
    </div>
  );
}
