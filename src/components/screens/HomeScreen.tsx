"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMonthShortName } from "../../../shared/i18n";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { loadProfileSettings, type ProfileSettings } from "@/lib/profile";
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
  type TooltipContentProps,
} from "recharts";

type Transaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string;
  date: string;
  description: string | null;
  category: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
  installments_paid: number | null;
  is_paid: boolean | null;
};

type Account = {
  id: string;
  name: string;
  balance: number | string;
};

type CreditCard = {
  id: string;
  name: string;
  limit_amount: number | string;
  closing_day: number;
  due_day: number;
};

type Investment = {
  id: string;
  type: "b3" | "crypto";
  symbol: string;
  name: string | null;
  quantity: number | string;
  average_price: number | string;
};

type FlowRow = {
  day: number;
  date: Date;
  income: number;
  expense: number;
  net: number;
  netDay: number;
};

type DisplayTransaction = Transaction & {
  displayId: string;
  displayDate: string;
  displayAmount: number;
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

function formatCurrency(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatShortDate(date: Date, language: "pt" | "en") {
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getInitials(name?: string) {
  if (!name) return "GF";
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "GF";
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
    const txDate = /^\d{4}-\d{2}-\d{2}$/.test(tx.displayDate)
      ? new Date(
          Number(tx.displayDate.slice(0, 4)),
          Number(tx.displayDate.slice(5, 7)) - 1,
          Number(tx.displayDate.slice(8, 10)),
        )
      : new Date(tx.displayDate);
    if (Number.isNaN(txDate.getTime())) return;
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

  return transactions.flatMap((tx) => {
    const txDate = new Date(tx.date);
    if (Number.isNaN(txDate.getTime())) return [];

    const amount = Number(tx.amount) || 0;
    const isInstallment = !!tx.is_installment && (tx.installment_total ?? 0) > 0;
    const totalInstallments = tx.installment_total ?? 0;

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
          displayAmount: perInstallment,
        });
      }
      return entries;
    }

    if (txDate < monthStart || txDate > monthEnd) return [];
    return [
      {
        ...tx,
        displayId: tx.id,
        displayDate: tx.date,
        displayAmount: amount,
      },
    ];
  });
}

export function HomeScreen() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investedTotal, setInvestedTotal] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [monthOpen, setMonthOpen] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSettings>({});

  useEffect(() => {
    setProfile(loadProfileSettings());
  }, []);

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

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);

    const { end } = getMonthRange(selectedMonth);

    const [accountsResult, transactionsResult, cardsResult, investmentsResult, purchasesResult] =
      await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,balance")
        .eq("user_id", user.id)
        .order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select("id,type,amount,date,description,category,is_installment,installment_total,installments_paid,is_paid")
        .eq("user_id", user.id)
        .lte("date", end)
        .order("date", { ascending: false }),
      supabase
        .from("credit_cards")
        .select("id,name,limit_amount,closing_day,due_day")
        .eq("user_id", user.id)
        .order("name", { ascending: true }),
      supabase
        .from("investments")
        .select("id,type,symbol,name,quantity,average_price")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("investment_purchases")
        .select("total_invested")
        .eq("user_id", user.id),
    ]);

    if (
      accountsResult.error ||
      transactionsResult.error ||
      cardsResult.error ||
      investmentsResult.error ||
      purchasesResult.error
    ) {
      const error =
        accountsResult.error ||
        transactionsResult.error ||
        cardsResult.error ||
        investmentsResult.error ||
        purchasesResult.error;
      console.error("Supabase load error", error);
      if (error?.code === "42P01") {
        setErrorMsg(t("home.schemaMissing"));
      } else {
        setErrorMsg(t("home.dataLoadError"));
      }
      setLoading(false);
      return;
    }

    const nextAccounts = (accountsResult.data ?? []) as Account[];
    const transactions = (transactionsResult.data ?? []) as Transaction[];
    const nextCards = (cardsResult.data ?? []) as CreditCard[];
    const nextInvestments = (investmentsResult.data ?? []) as Investment[];
    const nextInvestedTotal = (purchasesResult.data ?? []).reduce((sum, item) => {
      return sum + (Number(item.total_invested) || 0);
    }, 0);

    const total = nextAccounts.reduce(
      (sum, account) => sum + (Number(account.balance) || 0),
      0,
    );
    const monthTx = buildMonthTransactions(transactions, selectedMonth);
    const monthIncome = monthTx.reduce((sum, tx) => {
      return tx.type === "income" ? sum + tx.displayAmount : sum;
    }, 0);
    const monthExpenses = monthTx.reduce((sum, tx) => {
      return tx.type === "expense" || tx.type === "card_expense"
        ? sum + tx.displayAmount
        : sum;
    }, 0);

    setTotalBalance(total || monthIncome - monthExpenses);
    setIncome(monthIncome);
    setExpenses(monthExpenses);
    setAccounts(nextAccounts);
    setCards(nextCards);
    setTransactions(transactions);
    setInvestments(nextInvestments);
    setInvestedTotal(nextInvestedTotal);
    setLoading(false);
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

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    monthTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      const key = tx.category?.trim() || (language === "pt" ? "Sem categoria" : "No category");
      totals[key] = (totals[key] ?? 0) + tx.displayAmount;
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [monthTransactions, language]);

  const categoryMax = useMemo(() => {
    return Math.max(1, ...categoryTotals.map(([, value]) => value));
  }, [categoryTotals]);

  const displayName =
    (user?.user_metadata?.username as string | undefined) ||
    profile.name ||
    user?.email ||
    "Guim Financial";
  const initials = useMemo(() => getInitials(displayName), [displayName]);

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
            <span className="font-semibold">{formatCurrency(row.income, language)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#F0A3A3]">{t("home.expenses")}</span>
            <span className="font-semibold">{formatCurrency(row.expense, language)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#EAC37A]">Saldo diario</span>
            <span className="font-semibold">{formatCurrency(row.netDay, language)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#9AB0C9]">Saldo acumulado</span>
            <span className="font-semibold">{formatCurrency(row.net, language)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
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
        <Link href="/more#profile" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#1A2230] bg-[#101620] text-xs font-semibold text-[#E2E6ED] transition group-hover:border-[#2B364B]">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt="Profile avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-[#E2E6ED]">{displayName}</span>
            <span className="text-[10px] text-[#8B94A6]">{t("more.title")}</span>
          </div>
        </Link>
      </div>

      {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

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
            {loading ? "..." : showBalance ? formatCurrency(totalBalance, language) : "****"}
          </p>
          <p className="mt-3 text-xs text-[#8D96A6]">
            {t("home.total")} {loading ? "..." : formatCurrency(totalBalance, language)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 lg:col-span-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#48C59F]">
              <AppIcon name="plus" size={14} color="#0C1018" />
            </div>
            <div>
              <p className="text-xs text-[#8D96A6]">{t("home.income")}</p>
              <p className="text-lg font-semibold text-[#E3E9F1]">
                {loading ? "..." : formatCurrency(income, language)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 lg:col-span-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E46E6E]">
              <AppIcon name="chevron-down" size={14} color="#0C1018" />
            </div>
            <div>
              <p className="text-xs text-[#8D96A6]">{t("home.expenses")}</p>
              <p className="text-lg font-semibold text-[#E3E9F1]">
                {loading ? "..." : formatCurrency(expenses, language)}
              </p>
              <p className="mt-1 text-xs text-[#8D96A6]">
                Saldo apos despesas:{" "}
                {loading
                  ? "..."
                  : formatCurrency(totalBalance - expenses, language)}
              </p>
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
          {categoryTotals.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("transactions.empty")}</p>
          ) : (
            <div className="space-y-2">
              {categoryTotals.map(([name, value]) => (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#9AA3B2]">
                    <span className="truncate">{name}</span>
                    <span>{formatCurrency(value, language)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#0F141E]">
                    <div
                      className="h-1.5 rounded-full bg-[#5DD6C7]"
                      style={{ width: `${(value / categoryMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
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

          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
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
                  tickFormatter={(value) => formatCurrency(value, language)}
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

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("home.accounts")}</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A2230] bg-[#101620]">
              <AppIcon name="wallet" size={16} color="#92A0B7" />
            </span>
          </div>
          {accounts.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.noAccounts")}</p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#4FC3A1]" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#E4E7EC]">{account.name}</p>
                    <p className="text-xs text-[#8B94A6]">
                      {loading ? "..." : formatCurrency(Number(account.balance) || 0, language)}
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
          <div className="mt-4 border-t border-[#1C2332] pt-3 text-sm font-semibold text-[#C7CEDA]">
            {t("home.total")} {loading ? "..." : formatCurrency(totalBalance, language)}
          </div>
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">
              {t("investments.title")}
            </p>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[11px] text-[#9AA3B2]">
              {t("investments.total")} {investments.length}
            </span>
          </div>
          <div className="rounded-xl border border-[#1C2332] bg-[#0F141E] px-4 py-3">
            <p className="text-xs text-[#8B94A6]">{t("investments.investedValue")}</p>
            <p className="mt-1 text-lg font-semibold text-[#E5E8EF]">
              {loading ? "..." : formatCurrency(investedTotal, language)}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {investments.length === 0 ? (
              <p className="text-xs text-[#8B94A6]">{t("investments.empty")}</p>
            ) : (
              investments.slice(0, 4).map((investment) => (
                <div key={investment.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#E4E7EC]">
                      {(investment.name || investment.symbol).toUpperCase()}
                    </p>
                    <p className="text-xs text-[#8B94A6]">
                      {investment.type === "b3" ? "B3" : "Cripto"} ·{" "}
                      {t("investments.quantity")} {investment.quantity}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#A8B2C3]">
                    {formatCurrency(Number(investment.average_price) || 0, language)}
                  </span>
                </div>
              ))
            )}
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
              {t("home.openStatements")}
            </span>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[#8B94A6]">
              {t("home.closedStatements")}
            </span>
          </div>
          {cards.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("home.noCards")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#1C2332] bg-[#0F141E] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#E4E7EC]">{card.name}</p>
                    <p className="text-xs text-[#8B94A6]">
                      {t("cards.closes")} {card.closing_day} - {t("cards.due")} {card.due_day}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <span className="text-xs font-semibold text-[#A8B2C3]">
                      {loading ? "..." : formatCurrency(Number(card.limit_amount) || 0, language)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(card.id, card.name)}
                      disabled={deletingCardId === card.id}
                      className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-[11px] text-[#8B94A6] hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                    >
                      {deletingCardId === card.id ? "Removendo..." : "Remover"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1B2230] bg-[#111723] p-5 sm:col-span-2 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#C7CEDA]">{t("transactions.title")}</p>
            <span className="rounded-full border border-[#263043] bg-[#0F141E] px-3 py-1 text-[11px] text-[#9AA3B2]">
              {t("transactions.monthSummary")}
            </span>
          </div>
          <div className="mb-3 flex items-center justify-between text-[11px] text-[#8B94A6]">
            <span>Transacoes do mes</span>
            <span>{monthTransactions.length}</span>
          </div>
          {monthTransactions.length === 0 ? (
            <p className="text-xs text-[#8B94A6]">{t("transactions.empty")}</p>
          ) : (
            <div className="divide-y divide-[#1C2332]">
              {monthTransactions.map((tx) => {
                const isIncome = tx.type === "income";
                const isInstallment = !!tx.is_installment && (tx.installment_total ?? 0) > 0;
                const totalInstallments = tx.installment_total ?? 0;
                const paidInstallments = tx.installments_paid ?? 0;
                return (
                  <div key={tx.displayId} className="flex items-center justify-between py-3">
                    <div>
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
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        isIncome ? "text-[#4FC3A1]" : "text-[#E36B6B]"
                      }`}
                    >
                      {isIncome ? "+" : "-"} {formatCurrency(tx.displayAmount, language)}
                    </span>
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
