export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { MonthlyDashboard } from "@/components/MonthlyDashboard";
import { InstallmentsPlannerCard } from "@/components/InstallmentsPlannerCard";
import { ExportMonthlyPdfButton } from "@/components/ExportMonthlyPdfButton";
import { DailyReminderSettings } from "@/components/DailyReminderSettings";
import { AiInsightsCard, Insight } from "@/components/AiInsightsCard";

type AccountRow = {
  id: string;
  name: string;
  initial_balance: number | null;
};

type TransactionRow = {
  type: "income" | "expense";
  value: number;
  date: string;
  account_id: string | null;
  category: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
};

type AccountSummary = {
  id: string;
  name: string;
  balance: number;
};

type CategoryStat = {
  category: string;
  total: number;
};

type MonthSummary = {
  key: string; // "2025-11"
  labelShort: string;
  labelLong: string;
  income: number;
  expense: number;
  net: number;
  categories: CategoryStat[];
};

type InstallmentMonthSummary = {
  key: string;
  labelShort: string;
  labelLong: string;
  total: number;
};

type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

type Summary = {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  accounts: AccountSummary[];
  months: MonthSummary[];
  upcomingInstallments: InstallmentMonthSummary[];
  reminderSettings: ReminderSettings;
  insights: Insight[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function buildInsights(
  months: MonthSummary[],
  totalIncome: number,
  totalExpense: number,
): Insight[] {
  const insights: Insight[] = [];

  if (!months.length) return insights;

  const latest = months[0];
  const prev = months.length > 1 ? months[1] : null;

  // 1) Mês fechou no negativo
  if (latest.net < 0) {
    insights.push({
      id: "net-negative",
      title: "Mês fechou no negativo",
      detail: `O mês de ${latest.labelLong} fechou com saldo negativo de ${formatCurrency(
        latest.net,
      )}. Talvez valha rever algumas despesas para o próximo mês.`,
      severity: "high",
    });
  } else {
    insights.push({
      id: "net-positive",
      title: "Mês fechou no positivo",
      detail: `O mês de ${latest.labelLong} terminou com saldo positivo de ${formatCurrency(
        latest.net,
      )}. Boa — tenta manter esse padrão ou até aumentar o gap entre renda e gastos.`,
      severity: "positive",
    });
  }

  // 2) Comparação de gastos com o mês anterior
  if (prev && prev.expense > 0) {
    const diff = latest.expense - prev.expense;
    const pct = diff / prev.expense;

    if (pct > 0.15) {
      insights.push({
        id: "expense-up",
        title: "Gastos aumentaram em relação ao mês anterior",
        detail: `As despesas de ${latest.labelLong} foram cerca de ${Math.round(
          pct * 100,
        )}% maiores do que em ${prev.labelLong}. Dá uma olhada nas categorias que mais cresceram.`,
        severity: "medium",
      });
    } else if (pct < -0.15) {
      insights.push({
        id: "expense-down",
        title: "Gastos caíram em relação ao mês anterior",
        detail: `As despesas de ${latest.labelLong} ficaram cerca de ${Math.round(
          Math.abs(pct) * 100,
        )}% menores que em ${prev.labelLong}. Bom sinal de controle de gastos.`,
        severity: "positive",
      });
    }
  }

  // 3) Categoria que mais pesa no mês
  if (latest.categories.length > 0 && latest.expense > 0) {
    const top = latest.categories[0];
    const pct = top.total / latest.expense;

    insights.push({
      id: "top-category",
      title: "Categoria que mais pesa este mês",
      detail: `A categoria "${top.category}" representa cerca de ${Math.round(
        pct * 100,
      )}% de todas as tuas despesas em ${latest.labelLong}. Talvez seja um bom ponto de atenção.`,
      severity: pct >= 0.35 ? "medium" : "low",
    });
  }

  // 4) Relação gastos / renda geral
  if (totalIncome > 0) {
    const ratio = totalExpense / totalIncome;

    if (ratio > 0.9) {
      insights.push({
        id: "ratio-very-high",
        title: "Quase toda a renda está indo para despesas",
        detail: `No geral, as despesas estão consumindo cerca de ${Math.round(
          ratio * 100,
        )}% da sua renda total registada. Isso deixa pouca margem para poupança ou imprevistos.`,
        severity: "high",
      });
    } else if (ratio > 0.75) {
      insights.push({
        id: "ratio-high",
        title: "Despesas relativamente altas em relação à renda",
        detail: `As despesas somam aproximadamente ${Math.round(
          ratio * 100,
        )}% da sua renda. Vale a pena garantir que isso está alinhado com os seus objetivos.`,
        severity: "medium",
      });
    } else if (ratio < 0.5 && totalExpense > 0) {
      insights.push({
        id: "ratio-good",
        title: "Boa distância entre renda e despesas",
        detail: `As despesas estão abaixo de 50% da tua renda registada. Isso abre espaço para poupança ou investimentos.`,
        severity: "positive",
      });
    }
  }

  return insights;
}

async function getSummary(): Promise<Summary> {
  const [{ data: accountsData }, { data: txData }, { data: reminderData }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, initial_balance")
        .order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select(
          "type, value, date, account_id, category, is_installment, installment_total",
        ),
      supabase
        .from("reminder_settings")
        .select("remind_enabled, remind_hour, remind_minute")
        .eq("id", "default"),
    ]);

  const accounts = (accountsData ?? []) as AccountRow[];
  const txs = (txData ?? []) as TransactionRow[];

  const reminderRow = (reminderData ?? [])[0] as
    | {
        remind_enabled: boolean;
        remind_hour: number | null;
        remind_minute: number | null;
      }
    | undefined;

  const reminderSettings: ReminderSettings = reminderRow
    ? {
        enabled: !!reminderRow.remind_enabled,
        hour: reminderRow.remind_hour ?? 20,
        minute: reminderRow.remind_minute ?? 0,
      }
    : { enabled: false, hour: 20, minute: 0 };

  // --- contas / saldo total ---
  const accountMap = new Map<string, AccountSummary>();

  for (const acc of accounts) {
    accountMap.set(acc.id, {
      id: acc.id,
      name: acc.name,
      balance: Number(acc.initial_balance ?? 0),
    });
  }

  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of txs) {
    const v = Number(t.value) || 0;

    if (t.type === "income") totalIncome += v;
    else if (t.type === "expense") totalExpense += v;

    if (t.account_id && accountMap.has(t.account_id)) {
      const acc = accountMap.get(t.account_id)!;
      if (t.type === "income") acc.balance += v;
      else if (t.type === "expense") acc.balance -= v;
      accountMap.set(t.account_id, acc);
    }
  }

  const accountsSummary = Array.from(accountMap.values());
  const totalBalance = accountsSummary.reduce((sum, a) => sum + a.balance, 0);

  // --- visão mensal (últimos meses) ---
  type MonthBucket = {
    income: number;
    expense: number;
    categories: Map<string, number>;
  };

  const monthBuckets = new Map<string, MonthBucket>();

  for (const t of txs) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;

    if (!monthBuckets.has(key)) {
      monthBuckets.set(key, {
        income: 0,
        expense: 0,
        categories: new Map<string, number>(),
      });
    }

    const bucket = monthBuckets.get(key)!;
    const v = Number(t.value) || 0;

    if (t.type === "income") {
      bucket.income += v;
    } else if (t.type === "expense") {
      bucket.expense += v;

      const cat =
        t.category && t.category.trim() !== "" ? t.category : "Sem categoria";
      const prev = bucket.categories.get(cat) ?? 0;
      bucket.categories.set(cat, prev + v);
    }

    monthBuckets.set(key, bucket);
  }

  const monthKeys = Array.from(monthBuckets.keys()).sort((a, b) =>
    a < b ? 1 : -1,
  );
  const selectedKeys = monthKeys.slice(0, 6);

  const months: MonthSummary[] = selectedKeys.map((key) => {
    const bucket = monthBuckets.get(key)!;
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    const dateForLabel = new Date(year, monthIndex, 1);

    const labelShort = dateForLabel.toLocaleDateString("pt-BR", {
      month: "2-digit",
      year: "2-digit",
    });

    const labelLong = dateForLabel.toLocaleDateString("pt-BR", {
      month: "long",
      year: "2-digit",
    });

    const categories: CategoryStat[] = Array.from(bucket.categories.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    return {
      key,
      labelShort,
      labelLong,
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.income - bucket.expense,
      categories,
    };
  });

  // --- planejamento de parcelas futuras ---
  const upcomingInstallmentsMap = new Map<string, number>();

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const t of txs) {
    if (t.type !== "expense") continue;
    if (!t.is_installment) continue;

    const totalInstallments = t.installment_total ?? 0;
    if (!totalInstallments || totalInstallments < 1) continue;

    const txDate = new Date(t.date);
    if (Number.isNaN(txDate.getTime())) continue;

    const perInstallmentValue = (Number(t.value) || 0) / totalInstallments;

    for (let i = 0; i < totalInstallments; i++) {
      const installmentMonthDate = addMonths(txDate, i);

      if (installmentMonthDate < currentMonthStart) {
        continue;
      }

      const year = installmentMonthDate.getFullYear();
      const month = installmentMonthDate.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;

      const prev = upcomingInstallmentsMap.get(key) ?? 0;
      upcomingInstallmentsMap.set(key, prev + perInstallmentValue);
    }
  }

  const installmentKeys = Array.from(upcomingInstallmentsMap.keys()).sort(
    (a, b) => (a < b ? -1 : 1),
  );

  const upcomingInstallments: InstallmentMonthSummary[] = installmentKeys
    .slice(0, 6)
    .map((key) => {
      const [yearStr, monthStr] = key.split("-");
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;
      const dateForLabel = new Date(year, monthIndex, 1);

      const labelShort = dateForLabel.toLocaleDateString("pt-BR", {
        month: "2-digit",
        year: "2-digit",
      });

      const labelLong = dateForLabel.toLocaleDateString("pt-BR", {
        month: "long",
        year: "2-digit",
      });

      return {
        key,
        labelShort,
        labelLong,
        total: upcomingInstallmentsMap.get(key) ?? 0,
      };
    });

  // --- AI Insights locais ---
  const insights = buildInsights(months, totalIncome, totalExpense);

  return {
    totalBalance,
    totalIncome,
    totalExpense,
    accounts: accountsSummary,
    months,
    upcomingInstallments,
    reminderSettings,
    insights,
  };
}

export default async function HomePage() {
  const {
    totalBalance,
    totalIncome,
    totalExpense,
    accounts,
    months,
    upcomingInstallments,
    reminderSettings,
    insights,
  } = await getSummary();

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        {/* Card principal de saldo + botão PDF */}
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Resumo geral
            </p>
            <ExportMonthlyPdfButton />
          </div>

          <div className="mt-1 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] text-zinc-400">
                Saldo total (todas as contas)
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {formatCurrency(totalBalance)}
              </p>
            </div>
            <div className="flex gap-6 text-xs">
              <div className="flex flex-col">
                <span className="text-zinc-500">Receitas</span>
                <span className="text-emerald-400">
                  {formatCurrency(totalIncome)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500">Despesas</span>
                <span className="text-red-400">
                  {formatCurrency(totalExpense)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard mensal com animação + pizza categorias */}
        <MonthlyDashboard months={months} />

        {/* AI Insights abaixo do dashboard */}
        <AiInsightsCard insights={insights} />

        {/* Planejamento de parcelas futuras */}
        <InstallmentsPlannerCard months={upcomingInstallments} />

        {/* Lembrete diário */}
        <DailyReminderSettings initialSettings={reminderSettings} />

        {/* Lista de contas */}
        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Contas e bancos
          </p>
          {accounts.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Ainda não há contas registadas. Adicione uma conta na aba Bancos.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-col justify-between rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">{acc.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Saldo:{" "}
                    <span className="text-zinc-100">
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
