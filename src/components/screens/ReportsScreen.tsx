"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useLanguage } from "@/lib/language";
import { getMonthShortName } from "../../../shared/i18n";
import { formatCurrencyValue } from "../../../shared/currency";
import { hasMissingColumnError } from "@/lib/errorUtils";
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
};

type RawTransaction = Omit<Transaction, "amount"> & {
  amount?: number | string | null;
  value?: number | string | null;
};

type DisplayTransaction = Transaction & {
  displayId: string;
  displayAmount: number;
  effectiveDate: string;
  isBudgetCarryover?: boolean;
};

const SALARY_CARRYOVER_DAY_LIMIT = 10;
const SALARY_HINT_KEYWORDS = ["salario", "salary", "wage", "payroll", "pagamento"];
const CATEGORY_COLORS = [
  "#5DD6C7",
  "#5DA7FF",
  "#F59E8B",
  "#F4C27A",
  "#A78BFA",
  "#10B981",
  "#F97316",
  "#EC4899",
];

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date, language: "pt" | "en") {
  return `${getMonthShortName(language, date.getMonth())} ${date.getFullYear()}`;
}

function getMonthOptions(language: "pt" | "en", total = 12) {
  const now = new Date();
  return Array.from({ length: total }, (_, index) => {
    const value = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return { value, label: getMonthLabel(value, language) };
  });
}

function parseLocalDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function addMonthsClamped(date: Date, monthsToAdd: number) {
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

function isSalaryCarryoverCandidate(tx: Transaction, txDate: Date) {
  if (tx.type !== "income") return false;
  if (txDate.getDate() > SALARY_CARRYOVER_DAY_LIMIT) return false;
  const haystacks = [tx.description, tx.category].map(normalizeSearchText).filter(Boolean);
  return haystacks.some((text) => SALARY_HINT_KEYWORDS.some((keyword) => text.includes(keyword)));
}

function normalizeTransactionAmounts(rows: RawTransaction[]) {
  return rows.map((row) => ({
    ...row,
    amount: row.amount ?? row.value ?? 0,
  })) as Transaction[];
}

function getTransactionsQueryEnd(date: Date) {
  return toDateString(new Date(date.getFullYear(), date.getMonth() + 1, SALARY_CARRYOVER_DAY_LIMIT));
}

function buildMonthTransactions(transactions: Transaction[], month: Date): DisplayTransaction[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  const budgetMonthEnd = toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  return transactions.flatMap((tx) => {
    const txDate = parseLocalDate(tx.date);
    if (!txDate) return [];

    const amount = Number(tx.amount) || 0;
    const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
    const isInstallment = totalInstallments > 0;
    const isFixedExpense = !!tx.is_fixed && (tx.type === "expense" || tx.type === "card_expense");
    const monthOffset =
      (monthStart.getFullYear() - txDate.getFullYear()) * 12 +
      (monthStart.getMonth() - txDate.getMonth());

    if (isInstallment) {
      const perInstallment = amount / totalInstallments;
      const entries: DisplayTransaction[] = [];
      for (let index = 0; index < totalInstallments; index += 1) {
        const installmentDate = addMonthsClamped(txDate, index);
        if (installmentDate < monthStart || installmentDate > monthEnd) continue;
        entries.push({
          ...tx,
          displayId: `${tx.id}-i${index + 1}`,
          displayAmount: perInstallment,
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
        ...tx,
        displayId: `${tx.id}-f${monthOffset}`,
        displayAmount: amount,
        effectiveDate: toDateString(recurringDate),
      }];
    }

    if (isSalaryCarryoverCandidate(tx, txDate)) {
      const assignedMonth = new Date(txDate.getFullYear(), txDate.getMonth() - 1, 1);
      if (!isSameMonth(assignedMonth, month)) return [];
      return [{
        ...tx,
        displayId: `${tx.id}-carry-${assignedMonth.getFullYear()}-${assignedMonth.getMonth() + 1}`,
        displayAmount: amount,
        effectiveDate: budgetMonthEnd,
        isBudgetCarryover: true,
      }];
    }

    if (txDate < monthStart || txDate > monthEnd) return [];
    return [{
      ...tx,
      displayId: tx.id,
      displayAmount: amount,
      effectiveDate: toDateString(txDate),
    }];
  });
}

function formatPercent(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function getMonthChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function formatCurrency(value: number, language: "pt" | "en", currency: "BRL" | "EUR") {
  return formatCurrencyValue(value, language, currency);
}

export function ReportsScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { currency } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthOpen, setMonthOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const copy = language === "pt"
    ? {
        eyebrow: "Relatorios",
        title: "Analise financeira",
        subtitle: "Entenda para onde o dinheiro esta indo e como o mes se compara ao anterior.",
        income: "Receitas",
        expenses: "Despesas",
        net: "Resultado",
        savingsRate: "Taxa de poupanca",
        categoryBreakdown: "Despesas por categoria",
        categorySubtitle: "Participacao das categorias no total gasto do mes.",
        categoryEmpty: "Sem despesas no periodo selecionado.",
        comparison: "Comparacao mensal",
        comparisonSubtitle: "Variação frente ao mes anterior.",
        paymentSplit: "Conta vs cartao",
        paymentSplitSubtitle: "Como as despesas foram pagas no mes.",
        fixedSplit: "Fixas vs variaveis",
        fixedSplitSubtitle: "Quanto do custo mensal ja e recorrente.",
        topExpenses: "Maiores despesas",
        topExpensesSubtitle: "As transacoes que mais pesaram no mes.",
        noData: "Sem dados suficientes para este mes.",
        accountExpenses: "Conta",
        cardExpenses: "Cartao",
        fixed: "Fixas",
        variable: "Variaveis",
        shareOfExpenses: "do total de despesas",
        previousMonth: "vs mes anterior",
      }
    : {
        eyebrow: "Reports",
        title: "Financial analysis",
        subtitle: "Understand where your money is going and how this month compares with the previous one.",
        income: "Income",
        expenses: "Expenses",
        net: "Net result",
        savingsRate: "Savings rate",
        categoryBreakdown: "Spending by category",
        categorySubtitle: "Share of each category in this month's spending.",
        categoryEmpty: "No spending for the selected period.",
        comparison: "Monthly comparison",
        comparisonSubtitle: "Change versus the previous month.",
        paymentSplit: "Account vs card",
        paymentSplitSubtitle: "How expenses were paid this month.",
        fixedSplit: "Fixed vs variable",
        fixedSplitSubtitle: "How much of your monthly cost is already recurring.",
        topExpenses: "Top expenses",
        topExpensesSubtitle: "Transactions that weighed the most this month.",
        noData: "Not enough data for this month.",
        accountExpenses: "Account",
        cardExpenses: "Card",
        fixed: "Fixed",
        variable: "Variable",
        shareOfExpenses: "of total expenses",
        previousMonth: "vs previous month",
      };

  const loadReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const queryEnd = getTransactionsQueryEnd(selectedMonth);
      const result = await supabase
        .from("transactions")
        .select("id,type,amount,value,description,category,date,account_id,card_id,is_fixed,is_installment,installment_total")
        .eq("user_id", user.id)
        .lte("date", queryEnd)
        .order("date", { ascending: false });

      if (!result.error) {
        setTransactions(normalizeTransactionAmounts((result.data ?? []) as RawTransaction[]));
        setLoading(false);
        return;
      }

      if (!hasMissingColumnError(result.error, ["value", "amount"])) {
        throw result.error;
      }

      const fallback = await supabase
        .from("transactions")
        .select(
          hasMissingColumnError(result.error, ["value"])
            ? "id,type,amount,description,category,date,account_id,card_id,is_fixed,is_installment,installment_total"
            : "id,type,value,description,category,date,account_id,card_id,is_fixed,is_installment,installment_total",
        )
        .eq("user_id", user.id)
        .lte("date", queryEnd)
        .order("date", { ascending: false });

      if (fallback.error) throw fallback.error;
      setTransactions(normalizeTransactionAmounts((fallback.data ?? []) as RawTransaction[]));
    } catch (error) {
      console.error("Error loading reports:", error);
      setErrorMsg(language === "pt" ? "Falha ao carregar relatorios." : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, [language, selectedMonth, user]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const monthOptions = useMemo(() => getMonthOptions(language), [language]);
  const monthLabel = useMemo(() => getMonthLabel(selectedMonth, language), [language, selectedMonth]);
  const monthTransactions = useMemo(() => buildMonthTransactions(transactions, selectedMonth), [transactions, selectedMonth]);

  const previousMonthTransactions = useMemo(() => {
    const previousMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    return buildMonthTransactions(transactions, previousMonth);
  }, [transactions, selectedMonth]);

  const income = useMemo(
    () => monthTransactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.displayAmount : 0), 0),
    [monthTransactions],
  );
  const expenses = useMemo(
    () => monthTransactions.reduce((sum, tx) => sum + (tx.type !== "income" ? tx.displayAmount : 0), 0),
    [monthTransactions],
  );
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : null;

  const previousIncome = useMemo(
    () => previousMonthTransactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.displayAmount : 0), 0),
    [previousMonthTransactions],
  );
  const previousExpenses = useMemo(
    () => previousMonthTransactions.reduce((sum, tx) => sum + (tx.type !== "income" ? tx.displayAmount : 0), 0),
    [previousMonthTransactions],
  );

  const comparisonRows = [
    {
      label: copy.income,
      current: income,
      previous: previousIncome,
      change: getMonthChange(income, previousIncome),
      tone: "text-[#5DD6C7]",
    },
    {
      label: copy.expenses,
      current: expenses,
      previous: previousExpenses,
      change: getMonthChange(expenses, previousExpenses),
      tone: "text-[#F59E8B]",
    },
    {
      label: copy.net,
      current: net,
      previous: previousIncome - previousExpenses,
      change: getMonthChange(net, previousIncome - previousExpenses),
      tone: net >= 0 ? "text-[#5DD6C7]" : "text-[#F59E8B]",
    },
  ];

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    monthTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      const key = tx.category?.trim() || (language === "pt" ? "Sem categoria" : "No category");
      totals[key] = (totals[key] ?? 0) + tx.displayAmount;
    });
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }));
  }, [language, monthTransactions]);

  const paymentSplit = useMemo(() => {
    let accountTotal = 0;
    let cardTotal = 0;
    monthTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      if (tx.type === "card_expense" || tx.card_id) {
        cardTotal += tx.displayAmount;
      } else {
        accountTotal += tx.displayAmount;
      }
    });
    return [
      { name: copy.accountExpenses, value: accountTotal, color: "#5DA7FF" },
      { name: copy.cardExpenses, value: cardTotal, color: "#F59E8B" },
    ];
  }, [copy.accountExpenses, copy.cardExpenses, monthTransactions]);

  const fixedSplit = useMemo(() => {
    let fixedTotal = 0;
    let variableTotal = 0;
    monthTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      if (tx.is_fixed) fixedTotal += tx.displayAmount;
      else variableTotal += tx.displayAmount;
    });
    return [
      { name: copy.fixed, value: fixedTotal, color: "#F4C27A" },
      { name: copy.variable, value: variableTotal, color: "#5DD6C7" },
    ];
  }, [copy.fixed, copy.variable, monthTransactions]);

  const topExpenses = useMemo(() => {
    return monthTransactions
      .filter((tx) => tx.type !== "income")
      .sort((a, b) => b.displayAmount - a.displayAmount)
      .slice(0, 5);
  }, [monthTransactions]);

  const categoryTooltip = ({ active, payload }: TooltipContentProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload as { name: string; value: number; share: number };
    return (
      <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3 text-xs text-[#E4E7EC] shadow-lg">
        <p className="font-semibold">{item.name}</p>
        <p>{formatCurrency(item.value, language, currency)}</p>
        <p>{formatPercent(item.share, language)}%</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">{copy.eyebrow}</p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">{copy.title}</p>
          <p className="text-sm text-[#8A93A3]">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setMonthOpen((value) => !value)}
          className="flex items-center gap-2 rounded-full border border-[#2A3140] bg-[#141A25] px-4 py-2 text-sm font-semibold text-[#C7CEDA]"
        >
          <span>{monthLabel}</span>
          <AppIcon name="chevron-down" size={16} />
        </button>
      </div>

      {monthOpen ? (
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-2">
          <div className="grid gap-1 sm:grid-cols-3">
            {monthOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  setSelectedMonth(option.value);
                  setMonthOpen(false);
                }}
                className="rounded-xl px-3 py-2 text-left text-sm text-[#C7CEDA] hover:bg-[#151A27]"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {errorMsg ? <p className="text-sm text-red-400">{errorMsg}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7F8AA0]">{copy.income}</p>
          <p className="mt-3 text-3xl font-semibold text-[#5DD6C7]">
            {loading ? "..." : formatCurrency(income, language, currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7F8AA0]">{copy.expenses}</p>
          <p className="mt-3 text-3xl font-semibold text-[#F59E8B]">
            {loading ? "..." : formatCurrency(expenses, language, currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7F8AA0]">{copy.net}</p>
          <p className={`mt-3 text-3xl font-semibold ${net >= 0 ? "text-[#5DD6C7]" : "text-[#F59E8B]"}`}>
            {loading ? "..." : formatCurrency(net, language, currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7F8AA0]">{copy.savingsRate}</p>
          <p className="mt-3 text-3xl font-semibold text-[#E4E7EC]">
            {loading ? "..." : savingsRate == null ? "--" : `${formatPercent(savingsRate, language)}%`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-[#C7CEDA]">{copy.categoryBreakdown}</p>
            <p className="text-xs text-[#8B94A6]">{copy.categorySubtitle}</p>
          </div>
          {categoryData.length === 0 ? (
            <p className="text-sm text-[#8B94A6]">{copy.categoryEmpty}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={1.8}>
                      {categoryData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={categoryTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {categoryData.map((category) => (
                  <div key={category.name} className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="text-sm font-semibold text-[#E4E7EC]">{category.name}</span>
                      </div>
                      <span className="text-xs text-[#8B94A6]">{formatPercent(category.share, language)}%</span>
                    </div>
                    <p className="mt-2 text-sm text-[#C7CEDA]">{formatCurrency(category.value, language, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-[#C7CEDA]">{copy.comparison}</p>
            <p className="text-xs text-[#8B94A6]">{copy.comparisonSubtitle}</p>
          </div>
          <div className="space-y-3">
            {comparisonRows.map((row) => (
              <div key={row.label} className="rounded-xl border border-[#1C2332] bg-[#0F141E] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-[#E4E7EC]">{row.label}</span>
                  <span className={`text-sm font-semibold ${row.tone}`}>{formatCurrency(row.current, language, currency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-xs text-[#8B94A6]">
                  <span>{copy.previousMonth}</span>
                  <span>
                    {row.change == null
                      ? "--"
                      : `${row.change >= 0 ? "+" : ""}${formatPercent(row.change, language)}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {[{
          title: copy.paymentSplit,
          subtitle: copy.paymentSplitSubtitle,
          data: paymentSplit,
        }, {
          title: copy.fixedSplit,
          subtitle: copy.fixedSplitSubtitle,
          data: fixedSplit,
        }].map((section) => (
          <div key={section.title} className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-[#C7CEDA]">{section.title}</p>
              <p className="text-xs text-[#8B94A6]">{section.subtitle}</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={section.data} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#1C2332" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#8B94A6", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8B94A6", fontSize: 12 }} axisLine={false} tickLine={false} width={80} tickFormatter={(value) => formatCurrency(Number(value), language, currency)} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0), language, currency)}
                    contentStyle={{ backgroundColor: "#0F141E", borderColor: "#1C2332", borderRadius: 12, color: "#E4E7EC" }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {section.data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-[#C7CEDA]">{copy.topExpenses}</p>
          <p className="text-xs text-[#8B94A6]">{copy.topExpensesSubtitle}</p>
        </div>
        {topExpenses.length === 0 ? (
          <p className="text-sm text-[#8B94A6]">{copy.noData}</p>
        ) : (
          <div className="space-y-3">
            {topExpenses.map((tx, index) => (
              <div key={tx.displayId} className="flex items-center justify-between gap-4 rounded-xl border border-[#1C2332] bg-[#0F141E] p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E4E7EC]">
                    {index + 1}. {tx.description || tx.category || "--"}
                  </p>
                  <p className="text-xs text-[#8B94A6]">
                    {tx.category || (language === "pt" ? "Sem categoria" : "No category")}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[#F59E8B]">
                  {formatCurrency(tx.displayAmount, language, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
