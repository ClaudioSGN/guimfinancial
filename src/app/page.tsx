export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabaseClient";
import { DashboardScreen } from "@/components/DashboardScreen";
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
  card_limit?: number | null;
  closing_day?: number | null;
  due_day?: number | null;
  initial_balance?: number | null;
  accountType?: "bank" | "card";
};

type TransactionRowDb = {
  id: string | number;
  description: string | null;
  value: number;
  type: "income" | "expense";
  date: string;
  created_at: string;
  account_id: string | null;
  category: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
  is_paid: boolean | null;
  installments_paid: number | null;
};

type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
};

async function getAccountsData(): Promise<AccountStat[]> {
  const { data: accountsData } = await supabase
    .from("accounts")
    .select("id, name, card_limit, closing_day, due_day, initial_balance")
    .order("name", { ascending: true });

  const { data: txData } = await supabase
    .from("transactions")
    .select("account_id, type, value, date, is_installment, description");

  const accounts = (accountsData ?? []).map((acc) => {
    const account = acc as AccountRow;
    const init = Number(account.initial_balance ?? 0);
    const cardLimit = account.card_limit ?? null;

    return {
      id: account.id,
      name: account.name,
      balance: init,
      income: 0,
      expense: 0,
      initialBalance: init,
      cardLimit,
      closingDay: account.closing_day ?? null,
      dueDay: account.due_day ?? null,
      invoiceCurrent: null,
      accountType: cardLimit && cardLimit > 0 ? "card" : "bank",
    } as AccountStat;
  });

  const map = new Map<string, AccountStat>();
  for (const a of accounts) map.set(a.id, a);

  for (const t of txData ?? []) {
    const accId = t.account_id as string | null;
    if (!accId || !map.has(accId)) continue;

    const acc = map.get(accId)!;
    const v = Number(t.value) || 0;
    const type = t.type as "income" | "expense";

    if (type === "income") {
      acc.income += v;
      acc.balance += v;
    } else if (type === "expense") {
      acc.expense += v;
      acc.balance -= v;
    }

    map.set(accId, acc);
  }

  return Array.from(map.values());
}

async function getTransactionsData(): Promise<{
  accounts: AccountRow[];
  transactions: UiTransaction[];
}> {
  const [{ data: accountsData }, { data: txData }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, card_limit")
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id, description, value, type, date, created_at, account_id, category, is_installment, installment_total, is_paid, installments_paid",
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const accounts = (accountsData ?? []) as AccountRow[];
  const txs = (txData ?? []) as TransactionRowDb[];

  const accountMap = new Map<string, AccountRow>();
  for (const acc of accounts) {
    const accountType =
      acc.card_limit && acc.card_limit > 0 ? "card" : "bank";
    accountMap.set(acc.id, { ...acc, accountType });
  }

  const uiTxs: UiTransaction[] = txs.map((t) => ({
    id: String(t.id),
    description: t.description ?? "",
    value: Number(t.value) || 0,
    type: t.type,
    date: t.date,
    createdAt: t.created_at,
    accountId: t.account_id,
    accountName: t.account_id
      ? accountMap.get(t.account_id)?.name ?? null
      : null,
    category: t.category,
    isInstallment: !!t.is_installment,
    installmentTotal: t.installment_total,
    isPaid: !!t.is_paid,
    installmentsPaid: t.installments_paid ?? 0,
  }));

  return { accounts, transactions: uiTxs };
}

async function getGoalsData(): Promise<GoalRow[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, deadline")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar metas:", error.message);
    return [];
  }

  return (data ?? []) as GoalRow[];
}

export default async function DashboardPage() {
  const [accounts, txData, goals] = await Promise.all([
    getAccountsData(),
    getTransactionsData(),
    getGoalsData(),
  ]);

  return (
    <DashboardScreen
      accounts={accounts}
      transactions={txData.transactions}
      accountsForTx={txData.accounts}
      goals={goals}
    />
  );
}
