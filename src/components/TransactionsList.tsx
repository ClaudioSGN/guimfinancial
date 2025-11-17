"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { UiTransaction } from "@/app/transactions/page";

type Props = {
  tx: UiTransaction;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function TransactionRow({ tx }: Props) {
  const [localPaid, setLocalPaid] = useState(tx.isPaid);
  const [updating, setUpdating] = useState(false);

  async function togglePaid() {
    if (updating) return;
    setUpdating(true);

    const next = !localPaid;

    const { error } = await supabase
      .from("transactions")
      .update({ is_paid: next })
      .eq("id", tx.id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert("Erro ao atualizar status de pagamento.");
      return;
    }

    setLocalPaid(next);
  }

  const isExpense = tx.type === "expense";
  const valueColor = isExpense ? "text-red-400" : "text-emerald-400";

  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3 text-xs">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-100">
            {tx.description || "(Sem descrição)"}
          </span>
          {tx.category && (
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-[1px] text-[10px] text-zinc-400">
              {tx.category}
            </span>
          )}
          {tx.isInstallment && (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-[1px] text-[10px] text-amber-200">
              Parcelado
            </span>
          )}
          {!localPaid && isExpense && (
            <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-[1px] text-[10px] text-amber-200">
              Em aberto
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
          <span>
            {new Date(tx.date).toLocaleDateString("pt-BR")}
          </span>
          {tx.accountName && (
            <span className="text-zinc-400">{tx.accountName}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className={`text-sm ${valueColor}`}>
          {isExpense ? "- " : "+ "}
          {formatCurrency(tx.value)}
        </span>

        <button
          type="button"
          onClick={togglePaid}
          disabled={updating}
          className={`rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
            localPaid
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-300"
          } ${updating ? "opacity-60" : "hover:border-zinc-400"}`}
        >
          {localPaid ? "Pago" : "Marcar como pago"}
        </button>
      </div>
    </div>
  );
}
