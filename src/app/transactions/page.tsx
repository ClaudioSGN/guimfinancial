export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { NewTransactionButton } from "@/components/NewTransactionButton";
import { TransactionRow } from "@/components/TransactionRow";

type AccountRow = {
  id: string;
  name: string;
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

export type UiTransaction = {
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
  installmentsPaid: number; // quantas parcelas já foram pagas
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

async function getData(): Promise<{
  accounts: AccountRow[];
  transactions: UiTransaction[];
}> {
  const [{ data: accountsData }, { data: txData }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
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

  const accountMap = new Map<string, string>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc.name);
  }

  const uiTxs: UiTransaction[] = txs.map((t) => ({
    id: String(t.id),
    description: t.description ?? "",
    value: Number(t.value) || 0,
    type: t.type,
    date: t.date,
    createdAt: t.created_at,
    accountId: t.account_id,
    accountName: t.account_id ? (accountMap.get(t.account_id) ?? null) : null,
    category: t.category,
    isInstallment: !!t.is_installment,
    installmentTotal: t.installment_total,
    isPaid: !!t.is_paid,
    installmentsPaid: t.installments_paid ?? 0,
  }));

  return { accounts, transactions: uiTxs };
}

export default async function TransactionsPage() {
  const { accounts, transactions } = await getData();

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.value, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.value, 0);

  // Despesas em aberto:
  // - para transação normal: soma o valor se não estiver paga
  // - para parcelada: soma apenas o valor das parcelas que ainda faltam
  const openExpenseTotal = transactions.reduce((sum, t) => {
    if (t.type !== "expense") return sum;

    if (t.isInstallment && t.installmentTotal && t.installmentTotal > 0) {
      const per = t.value / t.installmentTotal;
      const remaining = t.installmentTotal - t.installmentsPaid;
      if (remaining <= 0) return sum;
      return sum + per * remaining;
    }

    if (!t.isPaid) {
      return sum + t.value;
    }

    return sum;
  }, 0);

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        {/* Cabeçalho + botão nova transação */}
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Transações
              </span>
              <span className="text-xs text-zinc-400">
                Regista entradas, saídas, parcelas e controla o que já foi pago.
              </span>
            </div>
            <NewTransactionButton accounts={accounts} />
          </div>

          <div className="mt-1 flex flex-wrap gap-6 text-xs">
            <div className="flex flex-col">
              <span className="text-zinc-500">Recebido (lista)</span>
              <span className="text-emerald-400">
                {formatCurrency(totalIncome)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500">Gasto (lista)</span>
              <span className="text-red-400">
                {formatCurrency(totalExpense)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500">Despesas em aberto</span>
              <span className="text-amber-400">
                {formatCurrency(openExpenseTotal)}
              </span>
            </div>
          </div>
        </section>

        {/* Lista de transações */}
        <section className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Ainda não há transações registadas. Usa o botão{" "}
              <span className="font-semibold">Nova transação</span> para
              começar.
            </p>
          ) : (
            transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
          )}
        </section>
      </div>
    </main>
  );
}
