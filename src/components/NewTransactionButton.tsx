"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AccountRow = {
  id: string;
  name: string;
};

type Props = {
  accounts: AccountRow[];
};

const CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Assinaturas",
  "Lazer",
  "Viagem por app",
  "Jogos",
  "Hardware",
  "Roupas",
  "Outros",
];

function parseMoney(input: string): number | null {
  if (!input.trim()) return null;
  const normalized = input.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return n;
}

export function NewTransactionButton({ accounts }: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [accountId, setAccountId] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function resetForm() {
    setType("expense");
    setDescription("");
    setValue("");
    const d = new Date();
    setDate(d.toISOString().slice(0, 10));
    setAccountId("");
    setCategory("");
    setIsInstallment(false);
    setInstallmentTotal("");
    setIsPaid(true);
    setErrorMsg(null);
  }

  function openModal() {
    resetForm();
    setOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const parsedValue = parseMoney(value);
    if (parsedValue == null || parsedValue <= 0) {
      setErrorMsg("Valor inválido.");
      return;
    }

    if (!date) {
      setErrorMsg("Escolhe uma data.");
      return;
    }

    if (!accountId) {
      setErrorMsg("Escolhe uma conta.");
      return;
    }

    let totalInstallments: number | null = null;
    if (isInstallment) {
      if (!installmentTotal.trim()) {
        setErrorMsg("Informa o número de parcelas.");
        return;
      }
      const n = Number(installmentTotal);
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        setErrorMsg("Número de parcelas inválido.");
        return;
      }
      totalInstallments = n;
    }

    setSaving(true);

    const isParcelado =
      isInstallment && totalInstallments != null && totalInstallments > 0;

    const { error } = await supabase.from("transactions").insert([
      {
        type,
        description: description.trim() || null,
        value: parsedValue,
        date,
        account_id: accountId,
        category: category || null,
        is_installment: isParcelado || null,
        installment_total: totalInstallments,
        // se for parcelado: começa com 0 parcelas pagas e não está totalmente pago
        installments_paid: isParcelado ? 0 : 0,
        is_paid: isParcelado ? false : isPaid,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Erro ao guardar transação.");
      return;
    }

    closeModal();
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200"
      >
        Nova transação
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-100">
                Nova transação
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* tipo */}
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 rounded-full border px-3 py-1.5 ${
                    type === "expense"
                      ? "border-red-500/60 bg-red-500/10 text-red-300"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300"
                  }`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`flex-1 rounded-full border px-3 py-1.5 ${
                    type === "income"
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300"
                  }`}
                >
                  Receita
                </button>
              </div>

              {/* descrição */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Descrição
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Mercado, salário, Netflix..."
                />
              </div>

              {/* valor e data */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Valor (R$)
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Data
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              {/* conta */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Conta / banco
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">Escolhe uma conta</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* categoria */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Categoria (opcional)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* parcelamento */}
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={isInstallment}
                    onChange={(e) =>
                      setIsInstallment(e.target.checked)
                    }
                    className="h-3 w-3 rounded border-zinc-600 bg-zinc-950 text-zinc-100"
                  />
                  <span>Compra parcelada no cartão</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">
                      Nº de parcelas
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      disabled={!isInstallment}
                      value={installmentTotal}
                      onChange={(e) =>
                        setInstallmentTotal(e.target.value)
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none disabled:opacity-50 focus:border-zinc-400"
                      placeholder="Ex: 6"
                    />
                  </div>
                </div>
              </div>

              {/* pago?  (apenas para transações não parceladas) */}
              {!isInstallment && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    Já está pago?
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPaid((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isPaid ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        isPaid ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {saving ? "A guardar..." : "Guardar transação"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
