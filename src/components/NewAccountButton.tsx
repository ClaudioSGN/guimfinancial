"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function NewAccountButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();

  function resetForm() {
    setName("");
    setCardLimit("");
    setClosingDay("");
    setDueDay("");
    setInitialBalance("");
    setErrorMsg(null);
    setSaving(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("O nome da conta não pode estar vazio.");
      return;
    }

    const limitNumber =
      cardLimit.trim() !== "" ? Number(cardLimit.replace(",", ".")) : null;
    const closing =
      closingDay.trim() !== "" ? Number(closingDay.trim()) : null;
    const due = dueDay.trim() !== "" ? Number(dueDay.trim()) : null;
    const initialNumber =
      initialBalance.trim() !== ""
        ? Number(initialBalance.replace(",", "."))
        : 0; // 👈 se não preencher, vira 0

    if (Number.isNaN(limitNumber as number)) {
      setErrorMsg("Limite do cartão inválido.");
      return;
    }

    if (Number.isNaN(initialNumber)) {
      setErrorMsg("Saldo inicial inválido.");
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

    setSaving(true);

    try {
      console.log("Criando conta...", {
        name: name.trim(),
        initialNumber,
        limitNumber,
        closing,
        due,
      });

      const { error } = await supabase.from("accounts").insert({
        name: name.trim(),
        card_limit: limitNumber,
        closing_day: closing,
        due_day: due,
        initial_balance: initialNumber,
      });

      setSaving(false);

      if (error) {
        console.error("Erro Supabase ao criar conta:", error);
        // 👇 mostra o erro REAL do Supabase
        setErrorMsg(error.message);
        return;
      }

      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      console.error("Erro inesperado ao criar conta:", err);
      setSaving(false);
      setErrorMsg("Erro inesperado ao criar conta.");
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl font-bold text-black shadow-lg shadow-black/40 hover:bg-zinc-300 md:bottom-8 md:right-8"
      >
        +
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            setOpen(false);
            resetForm();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-100">
                Nova conta / banco
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Nome */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Nome da conta / banco
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Nubank, Itaú, Inter..."
                  required
                />
              </div>

              {/* Saldo inicial */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Saldo inicial (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: 1500,00"
                />
                <p className="text-[10px] text-zinc-500">
                  Este é o valor atual da conta hoje. As próximas receitas e
                  despesas vão ser somadas em cima dele.
                </p>
              </div>

              {/* Limite do cartão */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Limite total do cartão (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: 2000,00"
                />
              </div>

              {/* Fechamento / vencimento */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de fechamento (cartão)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de vencimento (fatura)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 22"
                  />
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400 whitespace-pre-line">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-zinc-100 py-2 text-sm font-medium text-black hover:bg-zinc-300 disabled:opacity-60"
              >
                {saving ? "A criar..." : "Criar conta"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
