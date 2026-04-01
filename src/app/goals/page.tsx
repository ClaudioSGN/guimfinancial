"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GoalsPageClient } from "@/components/GoalsPageClient";
import { RecurringPlanningPanel } from "@/components/RecurringPlanningPanel";
import {
  getErrorMessage,
  hasMissingColumnError,
  hasMissingTableError,
} from "@/lib/errorUtils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

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
  value?: number | string | null;
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

type PlanningPayload = {
  goals: GoalRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  investments: InvestmentRow[];
  schemaMissing: boolean;
};

function normalizeTransactionAmounts(rows: TransactionRow[]) {
  return rows.map((row) => ({
    ...row,
    amount: row.amount ?? row.value ?? 0,
  }));
}

async function getPlanningData(userId: string): Promise<PlanningPayload> {
  async function loadTransactions() {
    const transactionsResult = await supabase
      .from("transactions")
      .select("id, type, amount, value, date, description, category")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (!transactionsResult.error) {
      return {
        data: normalizeTransactionAmounts((transactionsResult.data ?? []) as TransactionRow[]),
        error: null as unknown,
      };
    }

    if (!hasMissingColumnError(transactionsResult.error, ["value", "amount"])) {
      return { data: [] as TransactionRow[], error: transactionsResult.error };
    }

    const fallbackSelect = hasMissingColumnError(transactionsResult.error, ["value"])
      ? "id, type, amount, date, description, category"
      : "id, type, value, date, description, category";

    const fallbackResult = await supabase
      .from("transactions")
      .select(fallbackSelect)
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (fallbackResult.error) {
      return { data: [] as TransactionRow[], error: fallbackResult.error };
    }

    return {
      data: normalizeTransactionAmounts((fallbackResult.data ?? []) as TransactionRow[]),
      error: null as unknown,
    };
  }

  const [goalsResult, accountsResult, transactionsResult, investmentsResult] = await Promise.all([
    supabase
      .from("goals")
      .select("id, name, target_amount, current_amount, deadline")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("accounts")
      .select("id, name, balance")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    loadTransactions(),
    supabase
      .from("investments")
      .select("id, type, symbol, name, quantity, average_price")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (goalsResult.error) {
    if (hasMissingTableError(goalsResult.error, ["goals"])) {
      return {
        goals: [],
        accounts: (accountsResult.data ?? []) as AccountRow[],
        transactions: transactionsResult.data,
        investments: (investmentsResult.data ?? []) as InvestmentRow[],
        schemaMissing: true,
      };
    }

    console.error("Erro ao carregar metas:", getErrorMessage(goalsResult.error), goalsResult.error);
  }

  if (accountsResult.error) {
    console.error(
      "Erro ao carregar contas das metas:",
      getErrorMessage(accountsResult.error),
      accountsResult.error,
    );
  }

  if (transactionsResult.error) {
    console.error(
      "Erro ao carregar transacoes das metas:",
      getErrorMessage(transactionsResult.error),
      transactionsResult.error,
    );
  }

  if (investmentsResult.error) {
    console.error(
      "Erro ao carregar investimentos das metas:",
      getErrorMessage(investmentsResult.error),
      investmentsResult.error,
    );
  }

  return {
    goals: (goalsResult.data ?? []) as GoalRow[],
    accounts: (accountsResult.data ?? []) as AccountRow[],
    transactions: transactionsResult.data,
    investments: (investmentsResult.data ?? []) as InvestmentRow[],
    schemaMissing: false,
  };
}

export default function GoalsPage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user) {
        if (active) {
          setGoals([]);
          setAccounts([]);
          setTransactions([]);
          setInvestments([]);
          setSchemaMissing(false);
          setLoading(false);
        }
        return;
      }

      try {
        if (active) setLoading(true);
        const result = await getPlanningData(user.id);
        if (!active) return;

        setGoals(result.goals);
        setAccounts(result.accounts);
        setTransactions(result.transactions);
        setInvestments(result.investments);
        setSchemaMissing(result.schemaMissing);
      } catch (error) {
        console.error("Erro ao carregar metas:", getErrorMessage(error), error);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (!authLoading) {
      void load();
    }

    function handleRefresh() {
      if (!authLoading) {
        void load();
      }
    }

    window.addEventListener("data-refresh", handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("data-refresh", handleRefresh);
    };
  }, [authLoading, user]);

  return (
    <AppShell activeTab="goals">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
        <section className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.25em] text-[#6E7686]">
            {language === "pt" ? "Metas" : "Goals"}
          </span>
          <h1 className="text-3xl font-semibold text-[#F8FAFC]">
            {language === "pt" ? "Planejamento financeiro" : "Financial planning"}
          </h1>
          <p className="max-w-3xl text-sm text-[#8B94A6]">
            {language === "pt"
              ? "Conecta objetivos, saldo, investimentos e comportamento do mes para transformar metas em plano de acao."
              : "Connect goals, balances, investments, and monthly behavior to turn goals into an action plan."}
          </p>
        </section>

        <section className="space-y-4">
          {loading && goals.length === 0 ? (
            <p className="text-sm text-[#8B94A6]">
              {language === "pt" ? "A carregar metas..." : "Loading goals..."}
            </p>
          ) : schemaMissing ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-medium">
                {language === "pt"
                  ? "A tabela de metas ainda nao existe."
                  : "The goals table does not exist yet."}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {language === "pt"
                  ? "Cria a tabela `goals` no Supabase e volta a abrir esta pagina."
                  : "Create the `goals` table in Supabase and open this page again."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <GoalsPageClient
                initialGoals={goals}
                accounts={accounts}
                transactions={transactions}
                investments={investments}
              />
              <RecurringPlanningPanel language={language} />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
