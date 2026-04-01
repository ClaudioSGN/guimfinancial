"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrency } from "@/lib/currency";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { formatCurrencyValue } from "../../shared/currency";

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

export function TransactionRow({ tx }: Props) {
  const { currency } = useCurrency();
  const emptyMoneyValue = formatCentsInput("", currency);
  const formatCurrency = (value: number) => formatCurrencyValue(value, "pt", currency);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bankName = tx.accountName;
  const installmentIndex = tx.installmentIndex ?? null;

  const isExpense = tx.type === "expense";
  const isIncome = tx.type === "income";

  const isInstallmentExpense =
    isExpense && tx.isInstallment && tx.installmentTotal !== null && tx.installmentTotal > 0;

  const totalInstallments = tx.installmentTotal ?? 0;
  const perInstallment = isInstallmentExpense && totalInstallments > 0 ? tx.value / totalInstallments : 0;
  const remainingInstallments = isInstallmentExpense ? Math.max(totalInstallments - tx.installmentsPaid, 0) : 0;
  const remainingAmount =
    isInstallmentExpense && tx.installmentTotal
      ? perInstallment * Math.max(tx.installmentTotal - tx.installmentsPaid, 0)
      : 0;
  const allPaid = isInstallmentExpense && remainingInstallments === 0;

  async function handleMarkInstallmentPaid() {
    if (!isInstallmentExpense || remainingInstallments <= 0) return;
    if (installmentIndex !== null && installmentIndex !== tx.installmentsPaid) return;
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

  async function handleTogglePaid() {
    if (!isExpense || isInstallmentExpense || saving) return;

    setSaving(true);

    const { error } = await supabase.from("transactions").update({ is_paid: !tx.isPaid }).eq("id", tx.id);

    setSaving(false);

    if (error) {
      console.error("Erro ao atualizar estado pago:", error);
      alert("Erro ao atualizar estado pago.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(tx.description);
  const [editValue, setEditValue] = useState(formatCentsFromNumber(tx.value, currency));
  const [editDate, setEditDate] = useState(tx.date);
  const [editCategory, setEditCategory] = useState(tx.category ?? "");
  const [editIsPaid, setEditIsPaid] = useState(tx.isPaid);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    setEditDescription(tx.description);
    const nextValue = formatCentsFromNumber(tx.value, currency);
    setEditValue(parseCentsInput(nextValue) === 0 ? emptyMoneyValue : nextValue);
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

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEditError(null);

    const parsedValue = parseCentsInput(editValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setEditError("Valor invalido.");
      return;
    }

    if (!editDate) {
      setEditError("Escolha uma data.");
      return;
    }

    setEditSaving(true);

    const payload: Record<string, unknown> = {
      description: editDescription.trim() || null,
      value: parsedValue,
      date: editDate,
      category: editCategory || null,
    };

    if (!isInstallmentExpense && isExpense) payload.is_paid = editIsPaid;

    const { error } = await supabase.from("transactions").update(payload).eq("id", tx.id);

    setEditSaving(false);

    if (error) {
      console.error("Erro ao editar transacao:", error);
      setEditError("Erro ao editar transacao.");
      return;
    }

    setEditing(false);
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDelete() {
    if (deleting) return;

    const ok = window.confirm("Tem certeza que deseja apagar esta transacao?");
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
    setDeleting(false);

    if (error) {
      console.error("Erro ao apagar transacao:", error);
      alert("Erro ao apagar transacao.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <div className="app-surface app-card-soft flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${isIncome ? "bg-[#e5f7f1] text-[#23916f]" : "bg-[#ffe8ea] text-[#d46770]"}`}>
              {isIncome ? "Receita" : "Despesa"}
            </span>
            {bankName ? <span className="app-pill px-2.5 py-1 text-[10px]">{bankName}</span> : null}
            {tx.category ? <span className="app-pill px-2.5 py-1 text-[10px]">{tx.category}</span> : null}
          </div>

          <p className="mt-3 text-sm font-semibold text-[#122033]">{tx.description || "(sem descricao)"}</p>
          <p className="mt-1 text-[11px] text-[#6d7c92]">
            {new Date(tx.date).toLocaleDateString("pt-BR")}
          </p>

          {isInstallmentExpense ? (
            <div className="mt-3 space-y-1 text-[11px] text-[#6d7c92]">
              <p>
                Parcelado em <span className="font-semibold text-[#122033]">{totalInstallments}x de {formatCurrency(perInstallment)}</span>
              </p>
              <p>
                Ja pagas <span className="font-semibold text-[#122033]">{tx.installmentsPaid}/{totalInstallments}</span>
              </p>
              {remainingInstallments > 0 ? (
                <p>
                  Restam <span className="font-semibold text-[#c5873b]">{remainingInstallments}x ({formatCurrency(remainingAmount)})</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {!isInstallmentExpense && isExpense ? (
            <p className="mt-3 text-[11px] text-[#6d7c92]">
              Estado <span className={tx.isPaid ? "font-semibold text-[#23916f]" : "font-semibold text-[#c5873b]"}>{tx.isPaid ? "Pago" : "Em aberto"}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <span className={`text-lg font-semibold tracking-[-0.03em] ${isIncome ? "text-[#23916f]" : "text-[#d46770]"}`}>
            {isIncome ? "+" : "-"} {formatCurrency(tx.value)}
          </span>

          {isInstallmentExpense && remainingInstallments > 0 && (installmentIndex === null || installmentIndex === tx.installmentsPaid) ? (
            <button type="button" onClick={handleMarkInstallmentPaid} disabled={saving} className="app-button app-button-secondary px-3 py-1.5 text-[11px]">
              {saving ? "A registar..." : "Registrar parcela"}
            </button>
          ) : null}

          {isInstallmentExpense && allPaid ? (
            <span className="rounded-full bg-[#e5f7f1] px-3 py-1 text-[10px] font-semibold text-[#23916f]">
              Parcelas concluidas
            </span>
          ) : null}

          {!isInstallmentExpense && isExpense ? (
            <button type="button" onClick={handleTogglePaid} disabled={saving} className="app-button app-button-secondary px-3 py-1.5 text-[11px]">
              {saving ? "A atualizar..." : tx.isPaid ? "Marcar em aberto" : "Marcar como pago"}
            </button>
          ) : null}

          <div className="flex items-center gap-2">
            <button type="button" onClick={openEdit} className="app-button app-button-secondary px-3 py-1.5 text-[11px]">
              Editar
            </button>
            <button type="button" onClick={handleDelete} disabled={deleting} className="app-button app-button-secondary px-3 py-1.5 text-[11px] text-[#b45f68]">
              {deleting ? "A apagar..." : "Apagar"}
            </button>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="app-modal-backdrop fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="app-surface app-card w-full max-w-md p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#122033]">Editar transacao</h2>
              <button type="button" onClick={closeEdit} className="text-xs text-[#69798e]">
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <div className="space-y-1 text-sm">
                <label className="text-xs text-[#69798e]">Descricao</label>
                <input type="text" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="app-input px-4 py-3 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-[#69798e]">Valor ({currency})</label>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(event) => setEditValue(formatCentsInput(event.target.value, currency))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="app-input px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#69798e]">Data</label>
                  <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className="app-input px-4 py-3 text-sm" />
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-[#69798e]">Categoria (opcional)</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                  className="app-input px-4 py-3 text-sm"
                  placeholder="Ex: Mercado, Hardware..."
                />
              </div>

              {!isInstallmentExpense && isExpense ? (
                <div className="flex items-center justify-between rounded-[20px] bg-white/45 px-4 py-3 text-xs">
                  <span className="text-[#69798e]">Ja esta pago?</span>
                  <button
                    type="button"
                    onClick={() => setEditIsPaid((value) => !value)}
                    className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${editIsPaid ? "bg-[#73b7ff]" : "bg-[#c4d1e0]"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editIsPaid ? "translate-x-5" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              ) : null}

              {editError ? <p className="text-xs text-red-500">{editError}</p> : null}

              <button type="submit" disabled={editSaving} className="app-button app-button-primary w-full px-4 py-3 text-sm font-semibold">
                {editSaving ? "A guardar..." : "Guardar alteracoes"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
