"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type TransactionType = "income" | "expense";

type Account = {
  id: string;
  name: string;
};

export function NewTransactionButton() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("expense");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return today;
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);

  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState("2");

  useEffect(() => {
    async function loadAccounts() {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name")
        .order("name", { ascending: true });

      if (!error && data) {
        setAccounts(data as Account[]);
        if (!accountId && data.length) {
          setAccountId(data[0].id);
        }
      } else if (error) {
        console.error("Erro ao carregar contas:", error.message);
      }
    }

    loadAccounts();
  }, [accountId]);

  // sempre que mudar para RECEITA, desliga parcelamento
  useEffect(() => {
    if (type === "income") {
      setIsInstallment(false);
    }
  }, [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const numericValue = Number(value.replace(",", "."));

    if (!numericValue || numericValue <= 0) {
      setErrorMsg("Valor inválido.");
      return;
    }

    if (!accountId) {
      setErrorMsg("Seleciona uma conta.");
      return;
    }

    if (isInstallment && type !== "expense") {
      setErrorMsg("Parcelamento só se aplica a despesas.");
      return;
    }

    setLoading(true);

    try {
      if (!isInstallment) {
        // transação normal (1 só registro)
        const { error } = await supabase.from("transactions").insert({
          type,
          value: numericValue,
          description: description || null,
          date,
          account_id: accountId,
          is_installment: false,
          installment_total: null,
        });

        if (error) throw error;
      } else {
        // PARCELADO: cria N lançamentos mensais
        const total = Number(installmentTotal);
        if (!total || total < 2) {
          setLoading(false);
          setErrorMsg("Número de parcelas inválido (mínimo 2).");
          return;
        }

        const baseDate = new Date(date);
        if (Number.isNaN(baseDate.getTime())) {
          setLoading(false);
          setErrorMsg("Data inválida.");
          return;
        }

        // valor por parcela (ajusta última pra compensar centavos)
        const brutoParcela = numericValue / total;
        const parcelas: number[] = [];
        let acumulado = 0;

        for (let i = 0; i < total; i++) {
          const v =
            i === total - 1
              ? Number((numericValue - acumulado).toFixed(2))
              : Number(brutoParcela.toFixed(2));
          parcelas.push(v);
          acumulado += v;
        }

        const rows = parcelas.map((parcelaValue, index) => {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + index);
          const iso = d.toISOString().slice(0, 10);

          const descBase = description?.trim() || "Despesa parcelada";
          const fullDesc = `${descBase} (${index + 1}/${total})`;

          return {
            type: "expense" as const,
            value: parcelaValue,
            description: fullDesc,
            date: iso,
            account_id: accountId,
            is_installment: true,
            installment_total: total,
          };
        });

        const { error } = await supabase
          .from("transactions")
          .insert(rows);

        if (error) throw error;
      }

      setLoading(false);
      setSuccessMsg("Transação registada!");
      setValue("");
      setDescription("");
      setIsInstallment(false);
      setInstallmentTotal("2");

      router.refresh();
      // se quiser fechar:
      // setOpen(false);
    } catch (err: any) {
      console.error(err);
      setLoading(false);
      setErrorMsg("Erro ao guardar transação.");
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl text-black shadow-lg hover:bg-emerald-400 md:bottom-10 md:right-10"
      >
        +
      </button>

      {/* Overlay + modal */}
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
                Nova transação
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
              {/* Tipo */}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`flex-1 rounded-full border px-3 py-2 ${
                    type === "income"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                >
                  Receita
                </button>
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 rounded-full border px-3 py-2 ${
                    type === "expense"
                      ? "border-red-400 bg-red-500/10 text-red-300"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                >
                  Despesa
                </button>
              </div>

              {/* Conta */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Conta</label>
                {accounts.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">
                    Nenhuma conta encontrada. Cria contas na tabela
                    <span className="font-semibold"> accounts </span>
                    no Supabase.
                  </p>
                ) : (
                  <select
                    value={accountId ?? ""}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Parcelamento (só para DESPESA) */}
              {type === "expense" && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Parcelado</span>
                    <button
                      type="button"
                      onClick={() =>
                        setIsInstallment((prev) => !prev)
                      }
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                        isInstallment
                          ? "bg-emerald-500"
                          : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-black transition ${
                          isInstallment
                            ? "translate-x-4"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {isInstallment && (
                    <div className="space-y-1 text-sm">
                      <label className="text-xs text-zinc-400">
                        Número de parcelas
                      </label>
                      <input
                        type="number"
                        min={2}
                        value={installmentTotal}
                        onChange={(e) =>
                          setInstallmentTotal(e.target.value)
                        }
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                        placeholder="Ex: 6"
                      />
                      <p className="text-[11px] text-zinc-500">
                        A primeira parcela será na data selecionada,
                        as restantes serão mês a mês.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Valor */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                  required
                />
              </div>

              {/* Data */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  required
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Supermercado, Netflix..."
                />
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
                className="mt-2 w-full rounded-xl bg-emerald-500 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                {loading
                  ? "A guardar..."
                  : isInstallment
                  ? "Guardar parcelas"
                  : "Guardar transação"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
