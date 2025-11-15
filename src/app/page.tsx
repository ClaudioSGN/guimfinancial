import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type Summary = {
  balance: number;
  income: number;
  expense: number;
};

type UiTransaction = {
  id: string;
  description: string;
  value: number;
  type: "income" | "expense";
  date: string;
};

type CategoryStat = {
  name: string;
  total: number;
};

type AccountStat = {
  id: string;
  name: string;
  balance: number;
};

type DashboardData = {
  summary: Summary;
  usedPercent: number;
  topCategories: CategoryStat[];
  latestTransactions: UiTransaction[];
  installmentsTotal: number;
  accounts: AccountStat[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

async function getDashboardData(): Promise<DashboardData> {
  // Contas
  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name")
    .order("name", { ascending: true });

  if (accountsError) {
    console.error("Erro ao buscar contas:", accountsError.message);
  }

  const accountMap = new Map<string, AccountStat>();
  for (const acc of accountsData ?? []) {
    accountMap.set(acc.id, {
      id: acc.id,
      name: acc.name,
      balance: 0,
    });
  }

  // Transações
  const { data: txData, error: txError } = await supabase
    .from("transactions")
    .select("id, type, value, description, date, created_at, account_id, is_installment, installment_total")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (txError) {
    console.error("Erro ao buscar transações:", txError.message);
  }

  const txs = txData ?? [];

  let income = 0;
  let expense = 0;
  let installmentsTotal = 0;

  const categoryMap = new Map<string, number>();

  for (const raw of txs as any[]) {
    const v = Number(raw.value) || 0;
    const type = raw.type as "income" | "expense";
    const desc = (raw.description || "").toString().toLowerCase();

    if (type === "income") income += v;
    if (type === "expense") {
      expense += v;

      // categorias
      const key = raw.description?.trim() || "Outros";
      const current = categoryMap.get(key) ?? 0;
      categoryMap.set(key, current + v);

      // detectar parcelado a partir da descrição
      if (
        desc.includes("parcela") ||
        desc.includes("parcelado") ||
        desc.includes("cartão") ||
        desc.includes("credito") ||
        desc.includes("crédito")
      ) {
        installmentsTotal += v;
      }
    }

    // por conta
    if (raw.account_id && accountMap.has(raw.account_id)) {
      const acc = accountMap.get(raw.account_id)!;
      if (type === "income") acc.balance += v;
      if (type === "expense") acc.balance -= v;
      accountMap.set(raw.account_id, acc);
    }
  }

  const balance = income - expense;

  const rawPercent =
    income > 0 ? Math.round((expense / income) * 100) : 0;
  const usedPercent = Math.max(0, Math.min(100, rawPercent));

  const topCategories: CategoryStat[] = Array.from(
    categoryMap.entries()
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  const latestTransactions: UiTransaction[] = txs.slice(0, 6).map((t: any) => ({
    id: String(t.id),
    description:
      t.description ||
      (t.type === "income" ? "Receita" : "Despesa"),
    value: Number(t.value) || 0,
    type: t.type as "income" | "expense",
    date: t.date as string,
  }));

  const accounts: AccountStat[] = Array.from(accountMap.values());

  return {
    summary: { balance, income, expense },
    usedPercent,
    topCategories,
    latestTransactions,
    installmentsTotal,
    accounts,
  };
}

export default async function Home() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        {/* CONTAS RESUMIDAS */}
        {data.accounts.length > 0 && (
          <section className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Contas (saldo por banco)
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {data.accounts.map((acc) => (
                <AccountPill key={acc.id} account={acc} />
              ))}
            </div>
          </section>
        )}

        {/* BLOCO PRINCIPAL (saldo + círculo) */}
        <section className="rounded-3xl border border-zinc-900 bg-zinc-950/70 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] md:p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Saldo disponível (todos os bancos)
              </p>
              <p className="text-3xl font-semibold tracking-tight md:text-4xl">
                {formatCurrency(data.summary.balance)}
              </p>
              <p className="text-xs text-zinc-500">
                Entradas{" "}
                <span className="text-zinc-300">
                  {formatCurrency(data.summary.income)}
                </span>{" "}
                · Despesas{" "}
                <span className="text-zinc-300">
                  {formatCurrency(data.summary.expense)}
                </span>
              </p>
            </div>

            <BudgetRing usedPercent={data.usedPercent} />
          </div>
        </section>

        {/* CATEGORIAS + RESUMO RÁPIDO */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-900 bg-zinc-950/60 p-4 md:p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Despesas por categoria (tudo somado)
            </p>

            {data.topCategories.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Ainda não registaste despesas.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                {data.topCategories.map((c) => {
                  const totalAll = data.topCategories.reduce(
                    (acc, cur) => acc + cur.total,
                    0
                  );
                  const percent =
                    totalAll > 0
                      ? Math.round((c.total / totalAll) * 100)
                      : 0;

                  return (
                    <div key={c.name}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-zinc-300">{c.name}</span>
                        <span className="text-zinc-400">
                          {formatCurrency(c.total)} · {percent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                        <div
                          className="h-full rounded-full bg-zinc-100"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-zinc-900 bg-zinc-950/60 p-4 md:p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Resumo rápido (geral)
            </p>
            <div className="space-y-3 text-sm">
              <MiniStat
                label="Receitas totais"
                value={formatCurrency(data.summary.income)}
                tone="positive"
              />
              <MiniStat
                label="Despesas totais"
                value={formatCurrency(data.summary.expense)}
                tone="negative"
              />
              <MiniStat
                label="Despesas em parcelas/débitos"
                value={formatCurrency(data.installmentsTotal)}
                tone={data.installmentsTotal > 0 ? "warning" : "neutral"}
              />
            </div>
          </div>
        </section>

        {/* ÚLTIMAS TRANSAÇÕES (tudo junto) */}
        <section className="rounded-3xl border border-zinc-900 bg-zinc-950/60 p-4 md:p-5">
          <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Últimas transações (todos os bancos)
          </p>

          {data.latestTransactions.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Ainda não registaste nenhuma transação.
            </p>
          ) : (
            <div className="divide-y divide-zinc-900 text-sm">
              {data.latestTransactions.map((t) => (
                <TransactionRow
                  key={t.id}
                  title={t.description}
                  subtitle={formatDate(t.date)}
                  value={`${t.type === "income" ? "+ " : "- "}${formatCurrency(
                    t.value
                  )}`}
                  positive={t.type === "income"}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------- CONTAS NO RESUMO ---------- */

function AccountPill({ account }: { account: AccountStat }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-zinc-900 bg-zinc-950/80 px-3 py-3">
      <span className="text-[11px] text-zinc-500">{account.name}</span>
      <span className="text-sm font-medium">
        {formatCurrency(account.balance)}
      </span>
    </div>
  );
}

/* ---------- OUTROS COMPONENTES ---------- */

function BudgetRing({ usedPercent }: { usedPercent: number }) {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  const angle = (clamped / 100) * 360;

  const gradient = `conic-gradient(#22c55e ${angle}deg, #27272a ${angle}deg 360deg)`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-32 w-32 md:h-40 md:w-40">
        <div className="absolute inset-0 rounded-full bg-zinc-900" />
        <div
          className="relative h-full w-full rounded-full p-[6px] md:p-[8px] transition-all duration-500 ease-out"
          style={{ backgroundImage: gradient }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-950">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Gasto
              </p>
              <p className="text-xl font-semibold tracking-tight">
                {clamped}%
              </p>
              <p className="text-[11px] text-zinc-500">
                {clamped < 100 ? "Dentro do limite" : "Acima do limite"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        Percentagem de despesas sobre as tuas receitas.
      </p>
    </div>
  );
}

type MiniStatProps = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral";
};

function MiniStat({ label, value, tone = "neutral" }: MiniStatProps) {
  const color =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-red-400"
      : tone === "warning"
      ? "text-amber-400"
      : "text-zinc-200";

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-sm ${color}`}>{value}</span>
    </div>
  );
}

type TransactionRowProps = {
  title: string;
  subtitle: string;
  value: string;
  positive?: boolean;
};

function TransactionRow({
  title,
  subtitle,
  value,
  positive,
}: TransactionRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex flex-col">
        <span className="text-sm text-zinc-100">{title}</span>
        <span className="text-[11px] text-zinc-500">{subtitle}</span>
      </div>
      <span
        className={`text-sm ${
          positive ? "text-emerald-400" : "text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
