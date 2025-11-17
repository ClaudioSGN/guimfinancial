"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AccountStat } from "@/app/accounts/page";
import { formatCurrency } from "@/app/accounts/page";

function getBankVisual(name: string): {
  label: string;
  bgClass: string;
  textClass: string;
} {
  const n = name.toLowerCase();

  if (n.includes("nubank") || n.includes("nu")) {
    return {
      label: "Nu",
      bgClass: "bg-[#8A05BE]",
      textClass: "text-white",
    };
  }

  if (n.includes("itaú") || n.includes("itau")) {
    return {
      label: "It",
      bgClass: "bg-[#EC7000]",
      textClass: "text-white",
    };
  }

  if (n.includes("inter")) {
    return {
      label: "In",
      bgClass: "bg-[#FF7A00]",
      textClass: "text-white",
    };
  }

  if (n.includes("santander")) {
    return {
      label: "Sa",
      bgClass: "bg-[#EC0000]",
      textClass: "text-white",
    };
  }

  if (n.includes("bradesco")) {
    return {
      label: "Br",
      bgClass: "bg-[#CC092F]",
      textClass: "text-white",
    };
  }

  if (n.includes("caixa")) {
    return {
      label: "Cx",
      bgClass: "bg-[#005CA9]",
      textClass: "text-white",
    };
  }

  if (n.includes("bb") || n.includes("brasil")) {
    return {
      label: "BB",
      bgClass: "bg-[#F7D117]",
      textClass: "text-[#002776]",
    };
  }

  return {
    label: name.slice(0, 2).toUpperCase(),
    bgClass: "bg-zinc-800",
    textClass: "text-zinc-100",
  };
}

export function AccountsList({ accounts }: { accounts: AccountStat[] }) {
  const [editing, setEditing] = useState<AccountStat | null>(null);
  const [name, setName] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();

  function openEdit(acc: AccountStat) {
    setEditing(acc);
    setName(acc.name);
    setCardLimit(
      acc.cardLimit !== null ? String(acc.cardLimit) : ""
    );
    setClosingDay(
      acc.closingDay !== null ? String(acc.closingDay) : ""
    );
    setDueDay(acc.dueDay !== null ? String(acc.dueDay) : "");
    setInitialBalance(
      Number.isFinite(acc.initialBalance)
        ? String(acc.initialBalance)
        : ""
    );
    setErrorMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    if (!name.trim()) {
      setErrorMsg("O nome não pode estar vazio.");
      return;
    }

    const limitNumber = cardLimit
      ? Number(cardLimit.replace(",", "."))
      : null;
    const closing = closingDay ? Number(closingDay) : null;
    const due = dueDay ? Number(dueDay) : null;
    const initialNumber = initialBalance
      ? Number(initialBalance.replace(",", "."))
      : 0;

    if (closing !== null && (closing < 1 || closing > 31)) {
      setErrorMsg("Dia de fechamento inválido (1 a 31).");
      return;
    }

    if (due !== null && (due < 1 || due > 31)) {
      setErrorMsg("Dia de vencimento inválido (1 a 31).");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("accounts")
      .update({
        name: name.trim(),
        card_limit: limitNumber,
        closing_day: closing,
        due_day: due,
        initial_balance: initialNumber,
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

  async function handleDeleteAccount(accountId: string, accountName: string) {
    const ok = window.confirm(
      `Tens a certeza que queres apagar a conta "${accountName}"?\n\nSe existirem transações ligadas a ela, podes ter erros ou perder o vínculo dessas transações.`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId);

    if (error) {
      console.error(error);
      alert(
        "Não foi possível apagar esta conta. Provavelmente existem transações associadas. Primeiro remove ou edita essas transações."
      );
      return;
    }

    // Se a conta que estava em edição foi apagada, fecha o modal
    if (editing && editing.id === accountId) {
      setEditing(null);
    }

    router.refresh();
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((acc) => {
          const visual = getBankVisual(acc.name);

          const usedPercent =
            acc.cardLimit &&
            acc.cardLimit > 0 &&
            acc.invoiceCurrent !== null
              ? Math.round((acc.invoiceCurrent / acc.cardLimit) * 100)
              : null;

          return (
            <div
              key={acc.id}
              className="flex flex-col justify-between rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium ${visual.bgClass} ${visual.textClass}`}
                  >
                    {visual.label}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-400">
                      Conta
                    </span>
                    <span className="text-sm text-zinc-100">
                      {acc.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(acc)}
                    className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() =>
                      handleDeleteAccount(acc.id, acc.name)
                    }
                    className="rounded-full border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-red-500/70 hover:text-red-400"
                  >
                    Apagar
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-zinc-500">
                    Saldo atual
                  </span>
                  <span className="text-sm font-medium">
                    {formatCurrency(acc.balance)}
                  </span>

                  <span className="mt-1 text-[11px] text-zinc-500">
                    Saldo inicial:{" "}
                    <span className="text-zinc-300">
                      {formatCurrency(acc.initialBalance)}
                    </span>
                  </span>

                  {acc.cardLimit && (
                    <span className="mt-1 text-[11px] text-zinc-500">
                      Limite cartão:{" "}
                      <span className="text-zinc-300">
                        {formatCurrency(acc.cardLimit)}
                      </span>
                    </span>
                  )}

                  {acc.invoiceCurrent !== null && (
                    <span className="mt-1 text-[11px] text-zinc-500">
                      Fatura atual:{" "}
                      <span className="text-amber-400">
                        {formatCurrency(acc.invoiceCurrent)}
                      </span>
                    </span>
                  )}
                </div>

                <div className="text-right text-[11px] text-zinc-500">
                  <div>
                    Entradas:{" "}
                    <span className="text-emerald-400">
                      {formatCurrency(acc.income)}
                    </span>
                  </div>
                  <div>
                    Saídas:{" "}
                    <span className="text-red-400">
                      {formatCurrency(acc.expense)}
                    </span>
                  </div>
                  {(acc.closingDay || acc.dueDay) && (
                    <div className="mt-1">
                      {acc.closingDay && (
                        <span>Fecha dia {acc.closingDay}</span>
                      )}
                      {acc.closingDay && acc.dueDay && (
                        <span> · </span>
                      )}
                      {acc.dueDay && (
                        <span>Vence dia {acc.dueDay}</span>
                      )}
                    </div>
                  )}
                  {usedPercent !== null && (
                    <div className="mt-1">
                      Usado do limite (fatura):{" "}
                      <span className="text-amber-400">
                        {Math.max(0, Math.min(100, usedPercent))}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
                Editar conta / banco
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSave}>
              {/* Nome */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Nome da conta / banco
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Nubank, Itaú..."
                  required
                />
              </div>

              {/* Saldo inicial */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Saldo inicial / ajuste (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: 1500,00"
                />
                <p className="text-[10px] text-zinc-500">
                  Este valor é o ponto de partida da conta. O saldo
                  atual = saldo inicial + receitas - despesas.
                </p>
              </div>

              {/* Limite */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Limite total do cartão (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: 2000,00"
                />
              </div>

              {/* Fechamento / vencimento */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de fechamento (opcional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={closingDay}
                    onChange={(e) =>
                      setClosingDay(e.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 15"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de vencimento (opcional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 22"
                  />
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-zinc-100 py-2 text-sm font-medium text-black hover:bg-zinc-300 disabled:opacity-60"
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
