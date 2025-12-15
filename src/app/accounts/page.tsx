import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { NewAccountButton } from "@/components/NewAccountButton";
import { AccountsList } from "@/components/AccountsList";

export type AccountStat = {
  id: string;
  name: string;
  balance: number;
  income: number;
  expense: number;
  initialBalance: number;
  cardLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  invoiceCurrent: number | null; // fatura aberta atual
  accountType?: "bank" | "card";
};

type AccountRow = {
  id: string;
  name: string;
  card_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  initial_balance: number | null;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// ciclo atual do cartão com base no dia de fechamento
function getCurrentCardCycle(closingDay: number): {
  lastClosing: Date;
  nextClosing: Date;
} {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-11

  // fechamento deste mês
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(closingDay, daysInMonth);
  const thisClosing = new Date(year, month, safeDay);

  let lastClosing: Date;
  let nextClosing: Date;

  if (today > thisClosing) {
    // já passou o fechamento deste mês -> fatura atual fecha no PRÓXIMO mês
    lastClosing = thisClosing;

    const nm = month + 1;
    const nYear = nm > 11 ? year + 1 : year;
    const nMonth = nm > 11 ? 0 : nm;
    const daysNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
    const safeNextDay = Math.min(closingDay, daysNextMonth);
    nextClosing = new Date(nYear, nMonth, safeNextDay);
  } else {
    // ainda não chegou no fechamento deste mês -> fatura atual fecha AGORA
    nextClosing = thisClosing;

    const pm = month - 1;
    const pYear = pm < 0 ? year - 1 : year;
    const pMonth = pm < 0 ? 11 : pm;
    const daysPrevMonth = new Date(pYear, pMonth + 1, 0).getDate();
    const safePrevDay = Math.min(closingDay, daysPrevMonth);
    lastClosing = new Date(pYear, pMonth, safePrevDay);
  }

  return { lastClosing, nextClosing };
}

async function getAccountsData(): Promise<AccountStat[]> {
  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, card_limit, closing_day, due_day, initial_balance")
    .order("name", { ascending: true });

  if (accountsError) {
    console.error("Erro ao buscar contas:", accountsError.message);
  }

  const { data: txData, error: txError } = await supabase
    .from("transactions")
    .select("account_id, type, value, date, is_installment, description");

  if (txError) {
    console.error("Erro ao buscar transações:", txError.message);
  }

  const accounts = (accountsData ?? []).map((acc) => {
    const account = acc as AccountRow;
    const init = Number(account.initial_balance ?? 0);

    const cardLimit = account.card_limit ?? null;
    return {
      id: account.id,
      name: account.name,
      balance: init, // começa do saldo inicial
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

  // pré-calcula o ciclo atual de fatura por conta
  const cycleMap = new Map<
    string,
    { lastClosing: Date; nextClosing: Date }
  >();

  for (const acc of accounts) {
    if (acc.closingDay) {
      cycleMap.set(acc.id, getCurrentCardCycle(acc.closingDay));
    }
  }

  for (const t of txData ?? []) {
    const accId = t.account_id as string | null;
    if (!accId || !map.has(accId)) continue;

    const acc = map.get(accId)!;
    const v = Number(t.value) || 0;
    const type = t.type as "income" | "expense";
    const desc = ((t.description as string) || "").toLowerCase();

    // saldo / entradas / saídas (em cima do saldo inicial)
    if (type === "income") {
      acc.income += v;
      acc.balance += v;
    } else if (type === "expense") {
      acc.expense += v;
      acc.balance -= v;
    }

    // fatura atual (só se tiver ciclo configurado)
    const cycle = cycleMap.get(accId);
    if (cycle && type === "expense") {
      const txDate = new Date(t.date as string);
      if (!Number.isNaN(txDate.getTime())) {
        const isInstallmentFlag = Boolean(t.is_installment);
        const isCreditLike =
          desc.includes("parcela") ||
          desc.includes("parcelado") ||
          desc.includes("cartão") ||
          desc.includes("cartao") ||
          desc.includes("credito") ||
          desc.includes("crédito") ||
          desc.includes("fatura");

        const isCardExpense = isInstallmentFlag || isCreditLike;

        if (
          isCardExpense &&
          txDate > cycle.lastClosing &&
          txDate <= cycle.nextClosing
        ) {
          acc.invoiceCurrent = (acc.invoiceCurrent ?? 0) + v;
        }
      }
    }

    map.set(accId, acc);
  }

  return Array.from(map.values());
}

export default async function AccountsPage() {
  const accounts = await getAccountsData();

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
        <TopNav />

        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Bancos e contas
          </p>

          {accounts.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Ainda não há contas registadas. Usa o botão + para adicionar
              bancos/cartões.
            </p>
          ) : (
            <AccountsList accounts={accounts} />
          )}
        </section>
      </div>

      <NewAccountButton />
    </main>
  );
}

export { formatCurrency };
