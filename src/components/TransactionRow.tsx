"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const isExpense = tx.type === "expense";
  const isIncome = tx.type === "income";

  const isInstallmentExpense =
    isExpense &&
    tx.isInstallment &&
    tx.installmentTotal &&
    tx.installmentTotal > 0;

  const totalInstallments = tx.installmentTotal ?? 0;
  const perInstallment =
    isInstallmentExpense && totalInstallments > 0
      ? tx.value / totalInstallments
      : 0;

  const remainingInstallments = isInstallmentExpense
    ? Math.max(totalInstallments - tx.installmentsPaid, 0)
    : 0;

  const remainingAmount = isInstallmentExpense
    ? perInstallment * remainingInstallments
    : 0;

  const allPaid = isInstallmentExpense && remainingInstallments === 0;

  async function handleMarkInstallmentPaid() {
    if (!isInstallmentExpense) return;
    if (remainingInstallments <= 0) return;
    if (saving) return;

    setSaving(true);

    const newPaid = tx.installmentsPaid + 1;
    const newIsPaid = newPaid >= totalInstallments;

    const { error } = await supabase
      .from("transactions")
      .update({
        installments_paid: newPaid,
        is_paid: newIsPaid,
      })
      .eq("id", tx.id);

    setSaving(false);

    if (error) {
      console.error("Erro ao registar pagamento de parcela:", error);
      alert("Erro ao registar pagamento de parcela.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3">
      {/* Esquerda: descrição + infos */}
      <div className="flex flex-col gap-1 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-[2px] text-[10px] font-medium ${
              isIncome
                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                : "bg-red-500/10 text-red-300 border border-red-500/40"
            }`}
          >
            {isIncome ? "Receita" : "Despesa"}
          </span>

          {tx.accountName && (
            <span className="rounded-full border border-zinc-700 px-2 py-[2px] text-[10px] text-zinc-400">
              {tx.accountName}
            </span>
          )}

          {tx.category && (
            <span className="rounded-full border border-zinc-700 px-2 py-[2px] text-[10px] text-zinc-400">
              {tx.category}
            </span>
          )}
        </div>

        <span className="text-sm font-medium text-zinc-100">
          {tx.description || "(sem descrição)"}
        </span>

        <span className="text-[11px] text-zinc-500">
          Data:{" "}
          <span className="text-zinc-300">
            {new Date(tx.date).toLocaleDateString("pt-BR")}
          </span>
        </span>

        {/* Info de parcelamento */}
        {isInstallmentExpense && (
          <div className="space-y-1 text-[11px] text-zinc-500">
            <div>
              Parcelado em{" "}
              <span className="text-zinc-300">
                {totalInstallments}x de {formatCurrency(perInstallment)}
              </span>
              .
            </div>

            <div>
              Já pagas:{" "}
              <span className="text-zinc-300">
                {tx.installmentsPaid}/{totalInstallments}
              </span>
              {remainingInstallments > 0 && (
                <>
                  {" "}
                  — faltam{" "}
                  <span className="text-amber-300">
                    {remainingInstallments}x ({formatCurrency(remainingAmount)}{" "}
                    restantes)
                  </span>
                </>
              )}
            </div>

            <div>
              Estado:{" "}
              <span className={allPaid ? "text-emerald-300" : "text-amber-300"}>
                {allPaid ? "Tudo pago" : "Ainda em aberto"}
              </span>
            </div>
          </div>
        )}

        {/* Não parcelada, mas com estado pago/aberto */}
        {!isInstallmentExpense && isExpense && (
          <span className="text-[11px] text-zinc-500">
            Estado:{" "}
            <span className={tx.isPaid ? "text-emerald-300" : "text-amber-300"}>
              {tx.isPaid ? "Pago" : "Em aberto"}
            </span>
          </span>
        )}
      </div>

      {/* Direita: valores + botão */}
      <div className="flex flex-col items-end gap-2 text-right text-xs">
        <span
          className={`text-sm font-semibold ${
            isIncome ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {formatCurrency(tx.value)}
        </span>

        {isInstallmentExpense && remainingInstallments > 0 && (
          <button
            type="button"
            onClick={handleMarkInstallmentPaid}
            disabled={saving}
            className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] text-zinc-200 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-60"
          >
            {saving ? "A registar..." : "Registrar pagamento de 1 parcela"}
          </button>
        )}

        {isInstallmentExpense && remainingInstallments === 0 && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-300">
            Parcelas concluídas
          </span>
        )}
      </div>
    </div>
  );
}
