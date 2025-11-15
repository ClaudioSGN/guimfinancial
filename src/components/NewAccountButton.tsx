"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function NewAccountButton() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg("Dá um nome para a conta/banco.");
      return;
    }

    const limitNumber = cardLimit
      ? Number(cardLimit.replace(",", "."))
      : null;

    const closing = closingDay ? Number(closingDay) : null;
    const due = dueDay ? Number(dueDay) : null;

    if (closing !== null && (closing < 1 || closing > 31)) {
      setErrorMsg("Dia de fechamento inválido (1 a 31).");
      return;
    }

    if (due !== null && (due < 1 || due > 31)) {
      setErrorMsg("Dia de vencimento inválido (1 a 31).");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("accounts").insert({
      name: name.trim(),
      card_limit: limitNumber,
      closing_day: closing,
      due_day: due,
    });

    setLoading(false);

    if (error) {
      console.error(error);
      setErrorMsg("Erro ao guardar conta/banco.");
      return;
    }

    setSuccessMsg("Conta registada!");
    setName("");
    setCardLimit("");
    setClosingDay("");
    setDueDay("");

    router.refresh();
    // se quiser fechar ao salvar:
    // setOpen(false);
  }

  return (
    <>
      {/* Botão flutuante – só para tela de Bancos */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl text-black shadow-lg hover:bg-zinc-300 md:bottom-10 md:right-10"
      >
        +
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Nome da conta */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Nome da conta / banco
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Nubank, Itaú, Conta principal..."
                  required
                />
              </div>

              {/* Limite de cartão */}
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
                <p className="text-[11px] text-zinc-500">
                  Usado para comparar o quanto já está comprometido nesse
                  banco.
                </p>
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
                    onChange={(e) => setClosingDay(e.target.value)}
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

              {successMsg && (
                <p className="text-xs text-emerald-400">
                  {successMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-zinc-100 py-2 text-sm font-medium text-black hover:bg-zinc-300 disabled:opacity-60"
              >
                {loading ? "A guardar..." : "Guardar conta"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
