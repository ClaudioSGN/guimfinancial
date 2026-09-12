"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";

export function NewAccountButton() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<"bank" | "card">("bank");
  const [name, setName] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setCardLimit("");
    setClosingDay("");
    setDueDay("");
    setInitialBalance("");
    setErrorMsg(null);
    setSaving(false);
  }

  function openModal(type: "bank" | "card") {
    setAccountType(type);
    resetForm();
    setOpen(true);
    setChooserOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg("Você precisa estar logado para criar uma conta.");
      return;
    }

    if (!name.trim()) {
      setErrorMsg("O nome da conta não pode estar vazio.");
      return;
    }

    const limitNumber =
      cardLimit.trim() !== ""
        ? Number(cardLimit.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."))
        : null;
    const closing = closingDay.trim() !== "" ? Number(closingDay.trim()) : null;
    const due = dueDay.trim() !== "" ? Number(dueDay.trim()) : null;
    const initialNumber =
      initialBalance.trim() !== ""
        ? Number(
            initialBalance
              .replace(/[^\d.,-]/g, "")
              .replace(/\./g, "")
              .replace(",", "."),
          )
        : 0;

    if (accountType === "card") {
      if (limitNumber === null || Number.isNaN(limitNumber) || limitNumber <= 0) {
        setErrorMsg("Informe um limite válido para o cartão.");
        return;
      }
      if (closing !== null && (closing < 1 || closing > 31)) {
        setErrorMsg("Dia de fechamento inválido (1 a 31).");
        return;
      }
      if (due !== null && (due < 1 || due > 31)) {
        setErrorMsg("Dia de vencimento inválido (1 a 31).");
        return;
      }
    }

    if (accountType === "bank" && Number.isNaN(initialNumber)) {
      setErrorMsg("Saldo inicial inválido.");
      return;
    }

    setSaving(true);

    const payload = {
      user_id: user.id,
      name: name.trim(),
      card_limit: accountType === "card" ? limitNumber : null,
      closing_day: accountType === "card" ? closing : null,
      due_day: accountType === "card" ? due : null,
      initial_balance: accountType === "bank" ? initialNumber : 0,
    };

    const { error } = await supabase.from("accounts").insert(payload);

    setSaving(false);

    if (error) {
      console.error("Erro Supabase ao criar conta:", error);
      setErrorMsg(error.message);
      return;
    }

    resetForm();
    setOpen(false);
    setChooserOpen(false);
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setChooserOpen((v) => !v)}
        className="fixed bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-2xl font-medium text-white transition duration-200 hover:bg-[var(--surface)] sm:bottom-6 sm:right-6"
      >
        +
      </button>

      <div
        className={`pointer-events-none fixed bottom-20 right-4 z-40 transition-all duration-200 ease-out sm:right-6 ${
          chooserOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="flex flex-col items-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => openModal("bank")}
            className="ui-btn ui-btn-secondary pointer-events-auto px-4 py-2 shadow-sm"
          >
            Cadastrar um banco
          </button>
          <button
            type="button"
            onClick={() => openModal("card")}
            className="ui-btn ui-btn-secondary pointer-events-auto px-4 py-2 shadow-sm"
          >
            Cadastrar um cartão
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 px-4"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-[var(--text-1)]">
                {accountType === "card"
                  ? "Novo cartão"
                  : "Nova conta bancária"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1 text-sm">
                <label className="text-sm text-[var(--text-3)]">
                  Nome da conta / banco
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="ui-input w-full px-3 py-2 text-sm"
                  placeholder="Nubank, Itaú..."
                  required
                />
              </div>

              {accountType === "bank" && (
                <div className="space-y-1 text-sm">
                  <label className="text-sm text-[var(--text-3)]">
                    Saldo inicial ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="ui-input w-full px-3 py-2 text-sm"
                    placeholder="Ex: 1500,00"
                  />
                </div>
              )}

              {accountType === "card" && (
                <>
                  <div className="space-y-1 text-sm">
                    <label className="text-sm text-[var(--text-3)]">
                      Limite total do cartão
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={cardLimit}
                      onChange={(e) => setCardLimit(e.target.value)}
                      className="ui-input w-full px-3 py-2 text-sm"
                      placeholder="Ex: 2000,00"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <label className="text-sm text-[var(--text-3)]">
                        Dia de fechamento (cartão)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={closingDay}
                        onChange={(e) => setClosingDay(e.target.value)}
                        className="ui-input w-full px-3 py-2 text-sm"
                        placeholder="10"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm text-[var(--text-3)]">
                        Dia de vencimento (fatura)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={dueDay}
                        onChange={(e) => setDueDay(e.target.value)}
                        className="ui-input w-full px-3 py-2 text-sm"
                        placeholder="22"
                      />
                    </div>
                  </div>
                </>
              )}

              {errorMsg && <p className="text-xs text-[var(--red)]">{errorMsg}</p>}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-full bg-[var(--accent)] py-2 text-sm font-medium text-white hover:bg-[var(--surface)] disabled:opacity-60"
              >
                {saving ? "A criar..." : "Criar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
