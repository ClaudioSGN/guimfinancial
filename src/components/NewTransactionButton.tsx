"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCentsInput, parseCentsInput } from "@/lib/moneyInput";

type AccountRow = {
  id: string;
  name: string;
  card_limit?: number | null;
  accountType?: "bank" | "card";
};

type Props = {
  accounts: AccountRow[];
};

const CATEGORIES = [
  "Alimentacao",
  "Transporte",
  "Assinaturas",
  "Lazer",
  "Viagem por app",
  "Jogos",
  "Hardware",
  "Roupas",
  "Outros",
];

export function NewTransactionButton({ accounts }: Props) {
  const [accountList, setAccountList] = useState<AccountRow[]>(accounts);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  async function refreshAccounts() {
    setLoadingAccounts(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, card_limit")
      .order("name", { ascending: true });

    setLoadingAccounts(false);

    if (error) {
      console.error("Erro ao carregar contas:", error);
      return;
    }

    setAccountList(data ?? []);
  }

  useEffect(() => {
    setAccountList(accounts);
  }, [accounts]);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("R$ 0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [category, setCategory] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isFixedIncome, setIsFixedIncome] = useState(false);
  const [fixedMonths, setFixedMonths] = useState("12");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function resetForm() {
    setType("expense");
    setDescription("");
    setValue("R$ 0");
    setDate(new Date().toISOString().slice(0, 10));
    setBankAccountId("");
    setCreditCardId("");
    setCategory("");
    setIsInstallment(false);
    setInstallmentTotal("");
    setIsPaid(true);
    setIsFixedIncome(false);
    setFixedMonths("12");
    setErrorMsg(null);
  }

  function openModal() {
    resetForm();
    refreshAccounts();
    setOpen(true);
  }

  function closeModal() {
    if (!saving) setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const parsedValue = parseCentsInput(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setErrorMsg("Valor invalido. Use numeros, ex: 1200,50");
      return;
    }

    if (!date) {
      setErrorMsg("Escolha uma data.");
      return;
    }

    const hasBank = Boolean(bankAccountId);
    const hasCard = Boolean(creditCardId);

    if (!hasBank && !hasCard) {
      setErrorMsg("Escolha uma conta bancaria ou um cartao.");
      return;
    }

    let totalInstallments: number | null = null;
    if (type === "expense" && isInstallment) {
      const n = Number(installmentTotal);
      if (!n || !Number.isInteger(n) || n < 1 || n > 120) {
        setErrorMsg("Numero de parcelas invalido.");
        return;
      }
      totalInstallments = n;
    }

    setSaving(true);

    const chosenAccount = creditCardId || bankAccountId || null;

    let monthsCount = 1;
    if (type === "income" && isFixedIncome) {
      const n = Number(fixedMonths);
      if (!n || !Number.isInteger(n) || n < 1 || n > 60) {
        setErrorMsg("Escolha entre 1 e 60 meses para a receita fixa.");
        setSaving(false);
        return;
      }
      monthsCount = n;
    }

    const baseDate = new Date(date);
    if (Number.isNaN(baseDate.getTime())) {
      setErrorMsg("Data invalida.");
      setSaving(false);
      return;
    }

    const rows = Array.from({ length: monthsCount }, (_, idx) => {
      const entryDate = new Date(baseDate);
      entryDate.setMonth(baseDate.getMonth() + idx);
      const isoDate = entryDate.toISOString().slice(0, 10);
      return {
        type,
        description: description.trim() || null,
        value: parsedValue,
        date: isoDate,
        account_id: chosenAccount,
        category: category || null,
        is_installment: type === "expense" ? isInstallment || null : null,
        installment_total: type === "expense" ? totalInstallments : null,
        installments_paid: type === "expense" && isInstallment ? 0 : 0,
        is_paid: type === "expense" && isInstallment ? false : isPaid,
      };
    });

    const { error } = await supabase.from("transactions").insert(rows);

    setSaving(false);

    if (error) {
      console.error("Erro ao guardar transacao:", error);
      setErrorMsg(error.message || "Erro ao guardar transacao.");
      return;
    }

    closeModal();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200"
      >
        Nova transacao
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
              <h2 className="text-sm font-medium text-zinc-100">Nova transacao</h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Fechar
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
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

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Descricao</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Mercado, salario, Netflix..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Valor (R$)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => setValue(formatCentsInput(e.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    pattern="[0-9]*"
                    placeholder="R$ 0"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              {type === "income" ? (
                <div className="space-y-1 text-sm">
                  <label className="text-xs text-zinc-400">Conta bancaria (onde vai cair)</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  >
                    <option value="">
                      {loadingAccounts ? "A carregar contas..." : "Selecione uma conta"}
                    </option>

                    {accountList
                      .filter((acc) => acc.accountType === "bank" || !acc.card_limit)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 text-sm">
                    <label className="text-xs text-zinc-400">Conta bancaria (opcional)</label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    >
                      <option value="">
                        {loadingAccounts ? "A carregar contas..." : "Selecione uma conta"}
                      </option>

                      {accountList
                        .filter((acc) => acc.accountType === "bank" || !acc.card_limit)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1 text-sm">
                    <label className="text-xs text-zinc-400">Cartao de credito (opcional)</label>
                    <select
                      value={creditCardId}
                      onChange={(e) => setCreditCardId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    >
                      <option value="">
                        {loadingAccounts ? "A carregar cartoes..." : "Selecione um cartao"}
                      </option>

                      {accountList
                        .filter((acc) => acc.accountType === "card" || (acc.card_limit ?? 0) > 0)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">Categoria (opcional)</label>
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

              {type === "expense" && (
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={isInstallment}
                      onChange={(e) => setIsInstallment(e.target.checked)}
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-950 text-zinc-100"
                    />
                    <span>Compra parcelada no cartao</span>
                  </label>

                  {isInstallment && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Num de parcelas</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={installmentTotal}
                          onChange={(e) => setInstallmentTotal(e.target.value)}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                          placeholder="Ex: 6"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(!isInstallment || type === "income") && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    {type === "income" ? "Ja esta recebido?" : "Ja esta pago?"}
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

              {type === "income" && (
                <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isFixedIncome}
                      onChange={(e) => setIsFixedIncome(e.target.checked)}
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-950 text-zinc-100"
                    />
                    <span>Receita fixa todo mes (ex: salario)</span>
                  </label>
                  {isFixedIncome && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Para quantos meses?</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={fixedMonths}
                          onChange={(e) => setFixedMonths(e.target.value)}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                          placeholder="Ex: 12"
                        />
                        <p className="text-[10px] text-zinc-500">
                          Cria a mesma receita neste dia pelos proximos meses.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {saving ? "A guardar..." : "Guardar transacao"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
