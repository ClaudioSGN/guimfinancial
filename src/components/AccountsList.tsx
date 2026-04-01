"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AccountStat } from "@/lib/accountTypes";
import { useCurrency } from "@/lib/currency";
import { formatCurrencyValue } from "../../shared/currency";

function getBankVisual(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("nubank") || normalized.includes("nu")) {
    return { label: "Nubank", tone: "bg-[#ece7ff] text-[#6753ce]" };
  }
  if (normalized.includes("inter")) {
    return { label: "Banco Inter", tone: "bg-[#fff0e4] text-[#d47124]" };
  }
  if (normalized.includes("itau") || normalized.includes("itaú")) {
    return { label: "Itau", tone: "bg-[#e7f1ff] text-[#2d6dd9]" };
  }
  if (normalized.includes("caixa")) {
    return { label: "Caixa", tone: "bg-[#e5f6ff] text-[#2c88b5]" };
  }
  if (normalized.includes("santander")) {
    return { label: "Santander", tone: "bg-[#ffe8ea] text-[#cf5b67]" };
  }

  return { label: "Outro banco", tone: "bg-white/65 text-[#546377]" };
}

type Props = {
  accounts: AccountStat[];
};

export function AccountsList({ accounts }: Props) {
  const { currency } = useCurrency();
  const formatCurrency = (value: number | null | undefined) =>
    formatCurrencyValue(Number(value) || 0, "pt", currency);
  const [editing, setEditing] = useState<AccountStat | null>(null);
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function openEdit(acc: AccountStat) {
    setEditing(acc);
    setName(acc.name ?? "");
    setInitialBalance(
      acc.initialBalance !== null && acc.initialBalance !== undefined ? String(acc.initialBalance) : "",
    );
    setCardLimit(acc.cardLimit !== null && acc.cardLimit !== undefined ? String(acc.cardLimit) : "");
    setClosingDay(acc.closingDay !== null && acc.closingDay !== undefined ? String(acc.closingDay) : "");
    setDueDay(acc.dueDay !== null && acc.dueDay !== undefined ? String(acc.dueDay) : "");
    setErrorMsg(null);
  }

  function resetEditState() {
    setEditing(null);
    setName("");
    setInitialBalance("");
    setCardLimit("");
    setClosingDay("");
    setDueDay("");
    setErrorMsg(null);
    setSaving(false);
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;

    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("O nome da conta nao pode estar vazio.");
      return;
    }

    const limitNumber = cardLimit ? Number(cardLimit.replace(",", ".")) : null;
    const closing = closingDay ? Number(closingDay) : null;
    const due = dueDay ? Number(dueDay) : null;
    const initialNumber = initialBalance ? Number(initialBalance.replace(",", ".")) : 0;

    if (closing !== null && (closing < 1 || closing > 31)) {
      setErrorMsg("Dia de fechamento invalido (1 a 31).");
      return;
    }

    if (due !== null && (due < 1 || due > 31)) {
      setErrorMsg("Dia de vencimento invalido (1 a 31).");
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
      setErrorMsg(error.message);
      return;
    }

    resetEditState();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDeleteAccount(accountId: string, accountName: string) {
    const ok = window.confirm(
      `Tem certeza que deseja apagar a conta "${accountName}"?\n\nIsso tambem vai apagar todas as transacoes associadas a esta conta.`,
    );

    if (!ok) return;

    const { error: txError } = await supabase.from("transactions").delete().eq("account_id", accountId);

    if (txError) {
      console.error(txError);
      alert(`Erro ao apagar transacoes desta conta: ${txError.message}`);
      return;
    }

    const { error: accError } = await supabase.from("accounts").delete().eq("id", accountId);

    if (accError) {
      console.error(accError);
      alert(`Erro ao apagar conta: ${accError.message}`);
      return;
    }

    if (editing && editing.id === accountId) resetEditState();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((acc) => {
          const visual = getBankVisual(acc.name);
          const usedPercent =
            acc.cardLimit && acc.cardLimit > 0 && acc.invoiceCurrent !== null
              ? Math.min(Math.round((acc.invoiceCurrent / acc.cardLimit) * 100), 100)
              : null;

          return (
            <div key={acc.id} className="app-surface app-card-soft flex flex-col justify-between p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold ${visual.tone}`}>
                    {visual.label}
                  </span>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-[#122033]">{acc.name}</span>
                    <span className="app-pill px-2.5 py-1 text-[10px]">
                      {acc.accountType === "card" ? "Cartao" : "Conta"}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-[#6d7c92]">Saldo atual</p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#122033]">
                    {formatCurrency(acc.balance)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {acc.accountType !== "card" ? (
                  <div className="app-surface app-card-soft p-3">
                    <p className="app-eyebrow">Saldo inicial</p>
                    <p className="mt-2 text-sm font-semibold text-[#122033]">
                      {formatCurrency(acc.initialBalance)}
                    </p>
                  </div>
                ) : null}

                {acc.cardLimit ? (
                  <div className="app-surface app-card-soft p-3">
                    <p className="app-eyebrow">Limite</p>
                    <p className="mt-2 text-sm font-semibold text-[#122033]">{formatCurrency(acc.cardLimit)}</p>
                    {acc.invoiceCurrent !== null ? (
                      <p className="mt-1 text-xs text-[#6d7c92]">Fatura atual {formatCurrency(acc.invoiceCurrent)}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {usedPercent !== null ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-[#6d7c92]">
                    <span>Utilizacao do limite</span>
                    <span>{usedPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/45">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,#6aa3ff,#86d2ff)]" style={{ width: `${usedPercent}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 text-[11px] text-[#6d7c92]">
                <div className="flex flex-col gap-1">
                  {acc.closingDay ? <span>Fecha dia {acc.closingDay}</span> : null}
                  {acc.dueDay ? <span>Vence dia {acc.dueDay}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(acc)} className="app-button app-button-secondary px-3 py-1.5 text-[11px]">
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc.id, acc.name)}
                    className="app-button app-button-secondary px-3 py-1.5 text-[11px] text-[#b45f68]"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing ? (
        <div className="app-modal-backdrop fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="app-surface app-card w-full max-w-md p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#122033]">Editar conta / banco</h2>
              <button type="button" onClick={resetEditState} className="text-xs text-[#69798e]">
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <div className="space-y-1 text-sm">
                <label className="text-xs text-[#69798e]">Nome da conta / banco</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="app-input px-4 py-3 text-sm"
                  placeholder="Nubank, Itau..."
                  required
                />
              </div>

              {editing.accountType !== "card" ? (
                <div className="space-y-1 text-sm">
                  <label className="text-xs text-[#69798e]">Saldo inicial / ajuste ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(event) => setInitialBalance(event.target.value)}
                    className="app-input px-4 py-3 text-sm"
                    placeholder="Ex: 1500,00"
                  />
                </div>
              ) : null}

              <div className="space-y-1 text-sm">
                <label className="text-xs text-[#69798e]">Limite total do cartao (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cardLimit}
                  onChange={(event) => setCardLimit(event.target.value)}
                  className="app-input px-4 py-3 text-sm"
                  placeholder="Ex: 2000,00"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-[#69798e]">Dia de fechamento</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={closingDay}
                    onChange={(event) => setClosingDay(event.target.value)}
                    className="app-input px-4 py-3 text-sm"
                    placeholder="Ex: 10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#69798e]">Dia de vencimento</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(event) => setDueDay(event.target.value)}
                    className="app-input px-4 py-3 text-sm"
                    placeholder="Ex: 22"
                  />
                </div>
              </div>

              {errorMsg ? <p className="text-xs text-red-500">{errorMsg}</p> : null}

              <button type="submit" disabled={saving} className="app-button app-button-primary w-full px-4 py-3 text-sm font-semibold">
                {saving ? "A guardar..." : "Guardar alteracoes"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
