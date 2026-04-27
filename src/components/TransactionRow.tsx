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
      .update({ installments_paid: newPaid, is_paid: newIsPaid })
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
      setEditError("Valor inválido.");
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
      setEditError("Erro ao editar transação.");
      return;
    }

    setEditing(false);
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDelete() {
    if (deleting) return;

    const ok = window.confirm("Tem certeza que deseja apagar esta transação?");
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
    setDeleting(false);

    if (error) {
      console.error("Erro ao apagar transacao:", error);
      alert("Erro ao apagar transação.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <div className="group flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--border-bright)] hover:bg-[var(--surface-2)]">
        {/* Left: type indicator + info */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* Color dot */}
          <div
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isIncome ? "bg-[var(--green)]" : "bg-[var(--red)]"}`}
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">
              {tx.description || "(sem descrição)"}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--text-3)]">
                {new Date(tx.date).toLocaleDateString("pt-BR")}
              </span>
              {bankName ? (
                <span className="ui-badge ui-badge-neutral">{bankName}</span>
              ) : null}
              {tx.category ? (
                <span className="ui-badge ui-badge-neutral">{tx.category}</span>
              ) : null}
              {isInstallmentExpense ? (
                <span className="ui-badge ui-badge-warning">
                  {tx.installmentsPaid}/{totalInstallments}x
                </span>
              ) : null}
              {!isInstallmentExpense && isExpense && (
                <span className={`ui-badge ${tx.isPaid ? "ui-badge-income" : "ui-badge-warning"}`}>
                  {tx.isPaid ? "Pago" : "Em aberto"}
                </span>
              )}
              {allPaid ? (
                <span className="ui-badge ui-badge-income">Concluído</span>
              ) : null}
            </div>

            {isInstallmentExpense && remainingInstallments > 0 ? (
              <p className="mt-1.5 text-xs text-[var(--text-3)]">
                Restam{" "}
                <span className="font-medium text-[var(--amber)]">
                  {remainingInstallments}x ({formatCurrency(remainingAmount)})
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Right: amount + actions */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`ui-amount text-sm ${isIncome ? "text-[var(--green)]" : "text-[var(--red)]"}`}
          >
            {isIncome ? "+" : "-"}{formatCurrency(tx.value)}
          </span>

          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {isInstallmentExpense && remainingInstallments > 0 && (installmentIndex === null || installmentIndex === tx.installmentsPaid) ? (
              <button
                type="button"
                onClick={handleMarkInstallmentPaid}
                disabled={saving}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                {saving ? "..." : "Parcela"}
              </button>
            ) : null}

            {!isInstallmentExpense && isExpense ? (
              <button
                type="button"
                onClick={handleTogglePaid}
                disabled={saving}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                {saving ? "..." : tx.isPaid ? "Reabrir" : "Pagar"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={openEdit}
              className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--text-2)]"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--red)]"
            >
              {deleting ? "..." : "×"}
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-40 flex items-end justify-center sm:items-center"
          onClick={closeEdit}
        >
          <div
            className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-1)]">Editar transação</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="ui-btn ui-btn-ghost ui-btn-sm"
              >
                Fechar
              </button>
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleEditSubmit}>
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Descrição</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="ui-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">Valor ({currency})</label>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(formatCentsInput(e.target.value, currency))}
                    inputMode="numeric"
                    className="ui-input"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="ui-label">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="ui-input"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Categoria (opcional)</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Ex: Mercado, Hardware..."
                  className="ui-input"
                />
              </div>

              {!isInstallmentExpense && isExpense ? (
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3">
                  <span className="text-sm text-[var(--text-2)]">Já está pago?</span>
                  <button
                    type="button"
                    onClick={() => setEditIsPaid((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editIsPaid ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${editIsPaid ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              ) : null}

              {editError ? (
                <p className="text-xs text-[var(--red)]">{editError}</p>
              ) : null}

              <button
                type="submit"
                disabled={editSaving}
                className="ui-btn ui-btn-primary ui-btn-lg w-full"
              >
                {editSaving ? "A guardar..." : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
