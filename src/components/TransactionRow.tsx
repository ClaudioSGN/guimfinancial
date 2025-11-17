"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
};

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
  const router = useRouter();

  const [localPaid, setLocalPaid] = useState(tx.isPaid);
  const [localInstallmentsPaid, setLocalInstallmentsPaid] = useState(
    tx.installmentsPaid
  );
  const [updating, setUpdating] = useState(false);

  const isExpense = tx.type === "expense";
  const valueColor = isExpense ? "text-red-400" : "text-emerald-400";

  const totalInstallments = tx.installmentTotal ?? 0;
  const hasInstallments =
    tx.isInstallment && totalInstallments && totalInstallments > 0;

  async function togglePaidSingle() {
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

  async function payOneInstallment() {
    if (!hasInstallments || updating) return;

    const current = localInstallmentsPaid;
    if (current >= totalInstallments) return;

    const nextCount = current + 1;

    setUpdating(true);

    const updates: Record<string, unknown> = {
      installments_paid: nextCount,
    };

    if (nextCount >= totalInstallments) {
      updates.is_paid = true;
    }

    const { error } = await supabase
      .from("transactions")
      .update(updates)
      .eq("id", tx.id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert("Erro ao atualizar parcela.");
      return;
    }

    setLocalInstallmentsPaid(nextCount);
    if (nextCount >= totalInstallments) {
      setLocalPaid(true);
    }
  }

  async function handleDelete() {
    if (updating) return;
    const ok = window.confirm(
      `Apagar a transação "${tx.description || "sem descrição"}"?`
    );
    if (!ok) return;

    setUpdating(true);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", tx.id);
    setUpdating(false);

    if (error) {
      console.error(error);
      alert("Erro ao apagar transação.");
      return;
    }

    router.refresh();
  }

  const hasOpenInstallments =
    hasInstallments && localInstallmentsPaid < totalInstallments;

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

          {hasInstallments && (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-[1px] text-[10px] text-amber-200">
              Parcelado
            </span>
          )}

          {hasInstallments && (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-[1px] text-[10px] text-zinc-400">
              {localInstallmentsPaid}/{totalInstallments} parcelas pagas
            </span>
          )}

          {!hasInstallments && !localPaid && isExpense && (
            <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-[1px] text-[10px] text-amber-200">
              Em aberto
            </span>
          )}

          {hasInstallments && hasOpenInstallments && (
            <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-[1px] text-[10px] text-amber-200">
              Parcelas em aberto
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

        <div className="flex gap-2">
          {hasInstallments ? (
            <button
              type="button"
              onClick={payOneInstallment}
              disabled={updating || !hasOpenInstallments}
              className={`rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
                hasOpenInstallments
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              } ${updating ? "opacity-60" : ""}`}
            >
              {hasOpenInstallments
                ? "Pagar parcela"
                : "Todas as parcelas pagas"}
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePaidSingle}
              disabled={updating}
              className={`rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
                localPaid
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300"
              } ${updating ? "opacity-60" : "hover:border-zinc-400"}`}
            >
              {localPaid ? "Pago" : "Marcar como pago"}
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={updating}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[10px] font-medium text-zinc-400 hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}
