import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { BanksPageClient } from "@/components/BanksPageClient";

type AccountRow = {
  id: string;
  name: string;
  initial_balance: number | null;
  card_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
};

type TransactionRow = {
  type: "income" | "expense";
  value: number;
  date: string;
  account_id: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
};

// ajuda com parcelas
function addMonths(date: Date, months: number) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

// calcula o ciclo de fatura atual baseado no dia de fechamento
function getCurrentBillingCycle(
  closingDay: number | null,
  now: Date
): { start: Date; end: Date } | null {
  if (!closingDay || closingDay < 1 || closingDay > 31) return null;

  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  let start: Date;
  let end: Date;

  // exemplo: fechamento dia 10
  // se hoje for dia 15 → ciclo: 11/mes atual até 11/mes seguinte
  // se hoje for dia 5 → ciclo: 11/mes anterior até 11/mes atual
  if (today > closingDay) {
    // já passou o fechamento deste mês → ciclo começou logo depois do fechamento
    start = new Date(year, month, closingDay + 1);
    end = new Date(year, month + 1, closingDay + 1);
  } else {
    // ainda não chegou no fechamento deste mês → ciclo veio do mês anterior
    start = new Date(year, month - 1, closingDay + 1);
    end = new Date(year, month, closingDay + 1);
  }

  return { start, end };
}

type AccountWithInvoice = AccountRow & {
  current_invoice_amount: number;
  current_invoice_utilization: number | null; // 0–1 se houver limite
};

async function getAccountsWithInvoice(): Promise<AccountWithInvoice[]> {
  const [{ data: accountsData, error: accError }, { data: txData, error: txError }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id, name, initial_balance, card_limit, closing_day, due_day"
        )
        .order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select(
          "type, value, date, account_id, is_installment, installment_total"
        ),
    ]);

  if (accError) {
    console.error("Erro ao carregar contas:", accError.message);
  }
  if (txError) {
    console.error("Erro ao carregar transações:", txError.message);
  }

  const accounts = (accountsData ?? []) as AccountRow[];
  const txs = (txData ?? []) as TransactionRow[];
  const now = new Date();

  const accountsWithInvoice: AccountWithInvoice[] = accounts.map((acc) => {
    const cycle = getCurrentBillingCycle(acc.closing_day, now);

    let invoiceAmount = 0;

    if (cycle) {
      const { start, end } = cycle;

      const accountTxs = txs.filter(
        (t) =>
          t.account_id === acc.id &&
          t.type === "expense" &&
          t.value != null
      );

      for (const t of accountTxs) {
        const v = Number(t.value) || 0;
        const txDate = new Date(t.date);
        if (Number.isNaN(txDate.getTime())) continue;

        // não parcelada → entra se a data estiver dentro do ciclo
        if (!t.is_installment) {
          if (txDate >= start && txDate < end) {
            invoiceAmount += v;
          }
          continue;
        }

        // parcelada → só uma parcela por ciclo
        const totalInstallments = t.installment_total ?? 0;
        if (!totalInstallments || totalInstallments < 1) continue;

        const perInstallmentValue = v / totalInstallments;

        for (let i = 0; i < totalInstallments; i++) {
          // assumimos que a parcela "cai" próximo da mesma data em meses seguintes
          const installmentDate = addMonths(txDate, i);

          // para aproximar à realidade da fatura, usamos o dia de fechamento
          const closingDay = acc.closing_day ?? installmentDate.getDate();
          const installmentChargeDate = new Date(
            installmentDate.getFullYear(),
            installmentDate.getMonth(),
            closingDay
          );

          if (
            installmentChargeDate >= start &&
            installmentChargeDate < end
          ) {
            invoiceAmount += perInstallmentValue;
          }
        }
      }
    }

    const limit =
      acc.card_limit != null ? Number(acc.card_limit) : null;
    const utilization =
      limit && limit > 0 ? invoiceAmount / limit : null;

    return {
      ...acc,
      current_invoice_amount: invoiceAmount,
      current_invoice_utilization: utilization,
    };
  });

  return accountsWithInvoice;
}

export default async function BanksPage() {
  const accounts = await getAccountsWithInvoice();

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Bancos e contas
              </span>
              <span className="text-xs text-zinc-400">
                Gerir contas, limites de cartão e fatura atual.
              </span>
            </div>
          </div>

          <BanksPageClient initialAccounts={accounts} />
        </section>
      </div>
    </main>
  );
}
