import { supabase } from "@/lib/supabaseClient";
import { NewTransactionButton } from "@/components/NewTransactionButton";
import { TopNav } from "@/components/TopNav";
import { TransactionsList } from "@/components/TransactionsList";

export type UiTransaction = {
  id: string;
  description: string;
  value: number;
  type: "income" | "expense";
  date: string;
  accountId: string | null;
  accountName: string | null;
  isInstallment: boolean;
  installmentTotal: number | null;
};

async function getAllTransactions(): Promise<UiTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, type, value, description, date, created_at, account_id, is_installment, installment_total, accounts(name)"
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar transações:", error.message);
    return [];
  }

  const txs = (data ?? []) as any[];

  return txs.map((t) => ({
    id: String(t.id),
    description:
      t.description ||
      (t.type === "income" ? "Receita" : "Despesa"),
    value: Number(t.value) || 0,
    type: t.type as "income" | "expense",
    date: t.date as string,
    accountId: (t.account_id as string | null) ?? null,
    accountName: t.accounts?.name ?? null,
    isInstallment: Boolean(t.is_installment),
    installmentTotal:
      t.installment_total !== null
        ? Number(t.installment_total)
        : null,
  }));
}

export default async function TransactionsPage() {
  const transactions = await getAllTransactions();

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        <section className="rounded-3xl border border-zinc-900 bg-zinc-950/70 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Todos os movimentos
            </p>
            <span className="text-[11px] text-zinc-500">
              {transactions.length} registo
              {transactions.length === 1 ? "" : "s"}
            </span>
          </div>

          <TransactionsList transactions={transactions} />
        </section>
      </div>

      <NewTransactionButton />
    </main>
  );
}
