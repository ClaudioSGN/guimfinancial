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
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { AccountStat } from "@/app/accounts/page";
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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

const TAB_OPTIONS = ["Resumo", "Bancos", "Metas"] as const;
type TabKey = (typeof TAB_OPTIONS)[number];

export function DashboardScreen({
  accounts,
  transactions,
  accountsForTx,
  goals,
}: Props) {
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

  const flowChartHeight = isMobile ? 220 : 280;
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
        const per = t.value / t.installmentTotal;
        const remaining = t.installmentTotal - t.installmentsPaid;
        if (remaining <= 0) return sum;
        return sum + per * remaining;
      }
      if (!t.isPaid) return sum + t.value;
      return sum;
    }, 0);
    return { totalIncome, totalExpense, openExpenseTotal };
  }, [filteredTransactions]);

  const flowSeries = useMemo(() => {
    if (!effectiveSelectedMonth) return [];
    const [yearStr, monthStr] = effectiveSelectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1; // JS month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const perDay = Array.from({ length: daysInMonth }, (_, idx) => ({
      day: idx + 1,
      income: 0,
      expense: 0,
      net: 0,
    }));

    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.date);
      const day = d.getDate();
      const value = Number(tx.value) || 0;
      if (tx.type === "income") perDay[day - 1].income += value;
      if (tx.type === "expense") perDay[day - 1].expense += value;
    });

    let running = 0;
    return perDay.map((row) => {
      running += row.income - row.expense;
      return { ...row, net: running };
    });
  }, [effectiveSelectedMonth, filteredTransactions]);

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
    <div className="relative flex flex-1 flex-col gap-6 rounded-3xl border border-[#121a30] bg-[#0a1224] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.38)] md:p-8">
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
            <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-4 shadow-lg shadow-black/30">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Saldo total
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrency(monthSummary.totalIncome - monthSummary.totalExpense)}
              </p>
              <p className="text-xs text-emerald-400">Atualizado com contas</p>
            </div>
            <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-4 shadow-lg shadow-black/30">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Entradas
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrency(monthSummary.totalIncome)}
              </p>
              <p className="text-xs text-emerald-400">
                Com base nas transações
              </p>
            </div>
            <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-4 shadow-lg shadow-black/30">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Saídas
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrency(monthSummary.totalExpense)}
              </p>
              <p className="text-xs text-red-400">Inclui parcelas</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-5 shadow-lg shadow-black/30">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Fluxo financeiro
                </p>
                <p className="text-sm text-slate-300">
                  Receita x despesa por dia do mês selecionado
                </p>
              </div>
            </div>

            <div className="w-full min-h-[240px]">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height={flowChartHeight} minHeight={220}>
                  <LineChart data={flowSeries}>
                    <CartesianGrid
                      stroke="#1f2a45"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={{ stroke: "#1f2a45" }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 10 }}
                      axisLine={{ stroke: "#1f2a45" }}
                      tickFormatter={(v) => `R$ ${v.toFixed(0)}`}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0b1226",
                        border: "1px solid #1f2a45",
                        borderRadius: 12,
                        color: "#e2e8f0",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        `R$ ${value.toFixed(2)}`,
                        name === "income"
                          ? "Receita"
                          : name === "expense"
                            ? "Despesa"
                            : "Saldo acumulado",
                      ]}
                      labelFormatter={(label: number) => `Dia ${label}`}
                    />
                    {(() => {
                      const today = new Date();
                      const [y, m] = effectiveSelectedMonth
                        ? effectiveSelectedMonth.split("-").map(Number)
                        : [];
                      const isCurrentMonth =
                        y === today.getFullYear() &&
                        m === today.getMonth() + 1;
                      const day = today.getDate();
                      return isCurrentMonth ? (
                        <ReferenceLine
                          x={day}
                          stroke="#38bdf8"
                          strokeDasharray="4 4"
                          label={{
                            position: "top",
                            value: "Hoje",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                      ) : null;
                    })()}
                    <Legend
                      wrapperStyle={{ color: "#e2e8f0", fontSize: isMobile ? 10 : 11 }}
                      formatter={(value) => {
                        if (value === "income") return "Receita";
                        if (value === "expense") return "Despesa";
                        return "Saldo acumulado";
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      stroke="#22c55e"
                      strokeWidth={isMobile ? 1.8 : 2.2}
                      dot={false}
                      name="income"
                    />
                    <Line
                      type="monotone"
                      dataKey="expense"
                      stroke="#ef4444"
                      strokeWidth={isMobile ? 1.8 : 2.2}
                      dot={false}
                      name="expense"
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      stroke="#38bdf8"
                      strokeWidth={isMobile ? 1.8 : 2.2}
                      dot={false}
                      strokeDasharray="6 4"
                      name="net"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Carregando gráfico...
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#121a30] bg-[#0b1326] p-4 shadow-lg shadow-black/30 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Categorias
                </p>
                <p className="text-sm text-slate-300">
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
                        ? "border-[#3b82f6] bg-[#12203c] text-slate-100"
                        : "border-[#1f2a45] bg-[#0b1226] text-slate-400 hover:text-white"
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
                      stroke="#101a30"
                      strokeDasharray="2 6"
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      tick={{ fill: "#8fa2c5", fontSize: isMobile ? 9 : 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$ ${v.toFixed(0)}`}
                      padding={{ left: 4, right: isMobile ? 8 : 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      stroke="#64748b"
                      tick={{
                        fill: "#cbd5e1",
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
                        backgroundColor: "#0b1226",
                        border: "1px solid #1f2a45",
                        borderRadius: 12,
                        color: "#e2e8f0",
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Total"]}
                      labelFormatter={(label: string) => label}
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
                <div className="flex h-full items-center justify-center rounded-xl bg-[#0b0f1a] text-xs text-slate-500">
                  {chartsReady
                    ? `Ainda não há registros para ${selectedMonthLabel}.`
                    : "Carregando gráfico..."}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-5 shadow-lg shadow-black/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
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
                  <p className="text-xs text-slate-500">
                    Nenhuma transação neste mês. Adicione a primeira.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#1a243c] bg-[#0d1427] p-5 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Bancos e contas
                  </p>
                  <p className="text-sm text-slate-300">
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
                    <p className="text-xs text-slate-500 mt-2">
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
                    <p className="text-xs text-slate-500 mt-2">
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
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#1d253d] bg-[#0f172a] px-4 py-3 shadow-lg shadow-black/30">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Bancos e contas
              </p>
              <p className="text-sm text-slate-300">
                Separe contas correntes e cartões.
              </p>
            </div>
            <NewAccountButton />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Contas bancárias
              </p>
              {bankAccounts.length ? (
                <AccountsList accounts={bankAccounts} />
              ) : (
                <p className="text-xs text-slate-500 mt-2">
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
                <p className="text-xs text-slate-500 mt-2">
                  Nenhum cartão cadastrado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {active === "Metas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#1a243c] bg-[#0d1427] px-4 py-3 shadow-lg shadow-black/30">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Metas financeiras
              </p>
              <p className="text-sm text-slate-300">
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
