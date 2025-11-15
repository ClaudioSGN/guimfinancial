"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { UiTransaction } from "@/app/transactions/page";

type Account = {
  id: string;
  name: string;
};

type MonthOption = {
  key: string; // ex: "2025-11"
  label: string; // ex: "11/25"
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
    year: "2-digit",
  });
}

function getMonthKey(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`; // 2025-11
}

function getMonthLabel(key: string): string {
  // "2025-11" -> "11/25"
  const [yearStr, monthStr] = key.split("-");
  const yearShort = yearStr.slice(-2);
  return `${monthStr}/${yearShort}`;
}

export function TransactionsList({
  transactions,
}: {
  transactions: UiTransaction[];
}) {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<UiTransaction | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState<"income" | "expense">(
    "expense"
  );
  const [editAccountId, setEditAccountId] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all"); 
  // "all" | "none" | accountId

  useEffect(() => {
    async function loadAccounts() {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name")
        .order("name", { ascending: true });

      if (!error && data) {
        setAccounts(data as Account[]);
      } else if (error) {
        console.error("Erro ao carregar contas:", error.message);
      }
    }

    loadAccounts();
  }, []);

  // Lista de meses disponíveis com base nas transações
  const monthOptions: MonthOption[] = useMemo(() => {
    const set = new Set<string>();

    for (const t of transactions) {
      const key = getMonthKey(t.date);
      if (key) set.add(key);
    }

    const arr = Array.from(set);
    // ordenar do mais recente pro mais antigo
    arr.sort((a, b) => (a < b ? 1 : -1));

    return arr.map((key) => ({
      key,
      label: getMonthLabel(key),
    }));
  }, [transactions]);

  // Definir mês padrão (mês atual, se existir na lista)
  useEffect(() => {
    if (monthOptions.length === 0) return;

    const today = new Date();
    const currentKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}`;

    if (monthOptions.some((m) => m.key === currentKey)) {
      setSelectedMonth(currentKey);
    } else {
      setSelectedMonth("all");
    }
  }, [monthOptions]);

  const filteredTransactions = useMemo(() => {
    let base = transactions;

    if (selectedMonth !== "all") {
      base = base.filter((t) => {
        const key = getMonthKey(t.date);
        return key === selectedMonth;
      });
    }

    if (selectedAccount === "none") {
      base = base.filter((t) => !t.accountId);
    } else if (selectedAccount !== "all") {
      base = base.filter((t) => t.accountId === selectedAccount);
    }

    return base;
  }, [transactions, selectedMonth, selectedAccount]);

  async function handleDelete(id: string) {
    const ok = window.confirm("Apagar esta transação?");
    if (!ok) return;

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao apagar transação.");
      return;
    }

    router.refresh();
  }

  function openEdit(tx: UiTransaction) {
    setEditing(tx);
    setEditDescription(tx.description);
    setEditValue(String(tx.value).replace(".", ","));
    setEditType(tx.type);
    setEditDate(tx.date.slice(0, 10));
    setEditAccountId(tx.accountId);
    setErrorMsg(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    setErrorMsg(null);

    const numericValue = Number(
      editValue.replace(".", "").replace(",", ".")
    );
    if (!numericValue || numericValue <= 0) {
      setErrorMsg("Valor inválido.");
      return;
    }

    if (!editDate) {
      setErrorMsg("Data inválida.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("transactions")
      .update({
        type: editType,
        value: numericValue,
        description: editDescription || null,
        date: editDate,
        account_id: editAccountId,
      })
      .eq("id", editing.id);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Erro ao guardar edição.");
      return;
    }

    setEditing(null);
    router.refresh();
  }

  const totalFiltered = filteredTransactions.length;

  function getPeriodLabel() {
    if (selectedMonth === "all") return "Todos os períodos";

    const m = monthOptions.find((mo) => mo.key === selectedMonth);
    return m ? m.label : "Período";
  }

  function getAccountLabel() {
    if (selectedAccount === "all") return "Todas as contas";
    if (selectedAccount === "none") return "Sem conta";
    const acc = accounts.find((a) => a.id === selectedAccount);
    return acc ? acc.name : "Conta";
  }

  return (
    <>
      {/* HEADER DO FILTRO */}
      <div className="mb-3 flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Filtros
          </span>
          <span className="text-[11px] text-zinc-400">
            {getPeriodLabel()} · {getAccountLabel()} · {totalFiltered} registo
            {totalFiltered === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex gap-2">
          {/* Select de período */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="all">Todos os períodos</option>
            {monthOptions.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Select de conta */}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="all">Todas as contas</option>
            <option value="none">Sem conta</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTA FILTRADA */}
      {filteredTransactions.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Não há transações neste filtro.
        </p>
      ) : (
        <div className="divide-y divide-zinc-900 text-sm">
          {filteredTransactions.map((t) => {
            const sign = t.type === "income" ? "+ " : "- ";
            const color =
              t.type === "income"
                ? "text-emerald-400"
                : "text-zinc-100";

            const subtitleParts = [formatDate(t.date)];
            if (t.accountName) subtitleParts.push(t.accountName);
            if (t.isInstallment && t.installmentTotal) {
              subtitleParts.push(`Parcelado (${t.installmentTotal}x)`);
            }

            return (
              <div
                key={t.id}
                className="flex items-center justify-between py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-sm text-zinc-100">
                    {t.description}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {subtitleParts.join(" · ")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-sm ${color}`}>
                    {sign}
                    {formatCurrency(t.value)}
                  </span>
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="rounded-full border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-red-500/60 hover:text-red-400"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-100">
                Editar transação
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSaveEdit}>
              {/* Tipo */}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditType("income")}
                  className={`flex-1 rounded-full border px-3 py-2 ${
                    editType === "income"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                >
                  Receita
                </button>
                <button
                  type="button"
                  onClick={() => setEditType("expense")}
                  className={`flex-1 rounded-full border px-3 py-2 ${
                    editType === "expense"
                      ? "border-red-400 bg-red-500/10 text-red-300"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                >
                  Despesa
                </button>
              </div>

              {/* Conta */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Conta</label>
                {accounts.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">
                    Nenhuma conta encontrada.
                  </p>
                ) : (
                  <select
                    value={editAccountId ?? ""}
                    onChange={(e) =>
                      setEditAccountId(
                        e.target.value ? e.target.value : null
                      )
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  >
                    <option value="">Sem conta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Valor */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Valor</label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                />
              </div>

              {/* Data */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Data</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Descrição
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) =>
                    setEditDescription(e.target.value)
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Mercado, Netflix..."
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-emerald-500 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "A guardar..." : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
