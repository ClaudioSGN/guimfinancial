"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
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
  installmentIndex?: number | null;
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bankName = tx.accountName;
  const installmentIndex = tx.installmentIndex ?? null;

  const isExpense = tx.type === "expense";
  const isIncome = tx.type === "income";

  const isInstallmentExpense =
    isExpense &&
    tx.isInstallment &&
    tx.installmentTotal !== null &&
    tx.installmentTotal > 0;

  const totalInstallments = tx.installmentTotal ?? 0;
  const perInstallment =
    isInstallmentExpense && totalInstallments > 0
      ? tx.value / totalInstallments
      : 0;

  const remainingInstallments = isInstallmentExpense
    ? Math.max(totalInstallments - tx.installmentsPaid, 0)
    : 0;

  const remainingAmount =
    isInstallmentExpense && tx.installmentTotal
      ? perInstallment *
        Math.max(tx.installmentTotal - tx.installmentsPaid, 0)
      : 0;

  const allPaid = isInstallmentExpense && remainingInstallments === 0;

  // ---------- REGISTAR PARCELA PAGA (PARCELADAS) ----------
  async function handleMarkInstallmentPaid() {
    if (!isInstallmentExpense) return;
    if (remainingInstallments <= 0) return;
    if (installmentIndex !== null && installmentIndex !== tx.installmentsPaid) {
      return;
    }
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

    window.dispatchEvent(new Event("data-refresh"));
  }

  // ---------- TOGGLE PAGO / EM ABERTO (NÃO PARCELADAS) ----------
  async function handleTogglePaid() {
    if (!isExpense || isInstallmentExpense) return;
    if (saving) return;

    setSaving(true);

    const { error } = await supabase
      .from("transactions")
      .update({
        is_paid: !tx.isPaid,
      })
      .eq("id", tx.id);

    setSaving(false);

    if (error) {
      console.error("Erro ao atualizar estado pago:", error);
      alert("Erro ao atualizar estado pago.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  // ---------- EDIÇÃO ----------
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(tx.description);
  const [editValue, setEditValue] = useState(formatCentsFromNumber(tx.value));
  const [editDate, setEditDate] = useState(tx.date);
  const [editCategory, setEditCategory] = useState(tx.category ?? "");
  const [editIsPaid, setEditIsPaid] = useState(tx.isPaid);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    setEditDescription(tx.description);
    setEditValue(formatCentsFromNumber(tx.value));
    setEditDate(tx.date);
    setEditCategory(tx.category ?? "");
    setEditIsPaid(tx.isPaid);
    setEditError(null);
    setEditing(true);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditing(false);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);

    const parsedValue = parseCentsInput(editValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setEditError("Valor inválido.");
      return;
    }

    if (!editDate) {
      setEditError("Escolhe uma data.");
      return;
    }

    setEditSaving(true);

    const payload: Record<string, unknown> = {
      description: editDescription.trim() || null,
      value: parsedValue,
      date: editDate,
      category: editCategory || null,
    };

    if (!isInstallmentExpense && isExpense) {
      payload.is_paid = editIsPaid;
    }

    const { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", tx.id);

    setEditSaving(false);

    if (error) {
      console.error("Erro ao editar transação:", error);
      setEditError("Erro ao editar transação.");
      return;
    }

    setEditing(false);
    window.dispatchEvent(new Event("data-refresh"));
  }

  // ---------- APAGAR ----------
  async function handleDelete() {
    if (deleting) return;

    const ok = window.confirm(
      "Tens a certeza que queres apagar esta transação? Esta ação não pode ser desfeita.",
    );
    if (!ok) return;

    setDeleting(true);

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", tx.id);

    setDeleting(false);

    if (error) {
      console.error("Erro ao apagar transação:", error);
      alert("Erro ao apagar transação.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#1a243c] bg-[#0c1428] px-4 py-3 shadow-inner shadow-black/20">
        {/* Esquerda */}
        <div className="flex flex-col gap-1 text-xs text-zinc-300">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-[2px] text-[10px] font-medium ${
                isIncome
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                  : "bg-red-500/10 text-red-300 border border-red-500/40"
              }`}
            >
              {isIncome ? "Receita" : "Despesa"}
            </span>

            {bankName && (
              <span className="rounded-full border border-zinc-700 px-2 py-[2px] text-[10px] text-zinc-400">
                {bankName}
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

          {/* Info parcelamento */}
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
                      {remainingInstallments}x (
                      {formatCurrency(remainingAmount)} restantes)
                    </span>
                  </>
                )}
              </div>

              <div>
                Estado:{" "}
                <span
                  className={allPaid ? "text-emerald-300" : "text-amber-300"}
                >
                  {allPaid ? "Tudo pago" : "Ainda em aberto"}
                </span>
              </div>
            </div>
          )}

          {/* Não parcelada, estado pago/aberto */}
          {!isInstallmentExpense && isExpense && (
            <span className="text-[11px] text-zinc-500">
              Estado:{" "}
              <span
                className={tx.isPaid ? "text-emerald-300" : "text-amber-300"}
              >
                {tx.isPaid ? "Pago" : "Em aberto"}
              </span>
            </span>
          )}
        </div>

        {/* Direita: valores + botões */}
        <div className="flex flex-col items-end gap-2 text-right text-xs">
          <span
            className={`text-sm font-semibold ${
              isIncome ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatCurrency(tx.value)}
          </span>

          {/* Botão registrar parcela (parceladas) */}
          {isInstallmentExpense &&
            remainingInstallments > 0 &&
            (installmentIndex === null ||
              installmentIndex === tx.installmentsPaid) && (
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

          {/* Botão pagar / abrir (NÃO parceladas) */}
          {!isInstallmentExpense && isExpense && (
            <button
              type="button"
              onClick={handleTogglePaid}
              disabled={saving}
              className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] text-zinc-200 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-60"
            >
              {saving
                ? "A atualizar..."
                : tx.isPaid
                  ? "Marcar como em aberto"
                  : "Marcar como pago"}
            </button>
          )}

          {/* Botões Editar / Apagar */}
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={openEdit}
              className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] text-zinc-400 hover:border-red-500/70 hover:text-red-400 disabled:opacity-60"
            >
              {deleting ? "A apagar..." : "Apagar"}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de edição */}
      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={closeEdit}
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
                onClick={closeEdit}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleEditSubmit}>
              {/* descrição */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Descrição</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              {/* valor e data */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Valor (R$)</label>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(formatCentsInput(e.target.value))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              {/* categoria */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Categoria (opcional)
                </label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Mercado, Hardware..."
                />
              </div>

              {/* pago / em aberto – só p/ NÃO parceladas */}
              {!isInstallmentExpense && isExpense && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Já está pago?</span>
                  <button
                    type="button"
                    onClick={() => setEditIsPaid((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      editIsPaid ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        editIsPaid ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              {editError && <p className="text-xs text-red-400">{editError}</p>}

              <button
                type="submit"
                disabled={editSaving}
                className="mt-2 w-full rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {editSaving ? "A guardar..." : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
