"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";

type AccountRow = {
  id: string;
  name: string;
  initial_balance: number | null;
  card_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  current_invoice_amount: number;
  current_invoice_utilization: number | null; // 0–1 se houver limite
};

type AccountFormState = {
  name: string;
  initialBalance: string;
  cardLimit: string;
  closingDay: string;
  dueDay: string;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function BanksPageClient({
  initialAccounts,
  loading = false,
}: {
  initialAccounts: AccountRow[];
  loading?: boolean;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState<AccountFormState>({
    name: "",
    initialBalance: "",
    cardLimit: "",
    closingDay: "",
    dueDay: "",
  });

  function parseMoney(input: string): number | null {
    if (!input.trim()) return null;
    const normalized = input.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isNaN(n)) return null;
    return n;
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setErrorMsg(null);
    setForm({
      name: "",
      initialBalance: "",
      cardLimit: "",
      closingDay: "",
      dueDay: "",
    });
  }

  function openEdit(acc: AccountRow) {
    setEditing(acc);
    setCreating(false);
    setErrorMsg(null);
    setForm({
      name: acc.name,
      initialBalance:
        acc.initial_balance != null
          ? String(acc.initial_balance).replace(".", ",")
          : "",
      cardLimit:
        acc.card_limit != null
          ? String(acc.card_limit).replace(".", ",")
          : "",
      closingDay:
        acc.closing_day != null ? String(acc.closing_day) : "",
      dueDay: acc.due_day != null ? String(acc.due_day) : "",
    });
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
    setSaving(false);
    setErrorMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg("Você precisa estar logado para criar/editar contas.");
      return;
    }

    if (!form.name.trim()) {
      setErrorMsg("Dá um nome à conta/banco.");
      return;
    }

    const initialBalance = parseMoney(form.initialBalance) ?? 0;
    const cardLimit = parseMoney(form.cardLimit);
    const closingDay = form.closingDay
      ? Number(form.closingDay)
      : null;
    const dueDay = form.dueDay ? Number(form.dueDay) : null;

    if (closingDay != null && (closingDay < 1 || closingDay > 31)) {
      setErrorMsg("Dia de fechamento deve ser entre 1 e 31.");
      return;
    }

    if (dueDay != null && (dueDay < 1 || dueDay > 31)) {
      setErrorMsg("Dia de vencimento deve ser entre 1 e 31.");
      return;
    }

    setSaving(true);

    if (creating) {
      const { error } = await supabase.from("accounts").insert([
        {
          user_id: user.id,
          name: form.name.trim(),
          initial_balance: initialBalance,
          card_limit: cardLimit,
          closing_day: closingDay,
          due_day: dueDay,
        },
      ]);

      setSaving(false);

      if (error) {
        console.error(error);
        setErrorMsg(error.message || "Erro ao criar conta.");
        return;
      }
    } else if (editing) {
      const { error } = await supabase
        .from("accounts")
        .update({
          name: form.name.trim(),
          initial_balance: initialBalance,
          card_limit: cardLimit,
          closing_day: closingDay,
          due_day: dueDay,
        })
        .eq("id", editing.id)
        .eq("user_id", user.id);

      setSaving(false);

      if (error) {
        console.error(error);
        setErrorMsg(error.message || "Erro ao guardar alterações.");
        return;
      }
    }

    closeModal();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleDelete(acc: AccountRow) {
    if (!user) {
      alert("Você precisa estar logado.");
      return;
    }

    const ok = window.confirm(
      `Apagar a conta "${acc.name}"? Todas as transações associadas podem ficar órfãs.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", acc.id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      alert("Erro ao apagar conta.");
      return;
    }

    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <>
      {/* Header + botão nova conta */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          Regista bancos, limites e acompanha a fatura atual do cartão.
        </p>
        <button
          onClick={openCreate}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
        >
          Nova conta
        </button>
      </div>

      {/* Lista de contas */}
      {loading && initialAccounts.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">A carregar contas...</p>
      ) : initialAccounts.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Ainda não há contas registadas. Cria a tua primeira conta.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <AnimatePresence>
            {initialAccounts.map((acc) => {
              const utilizPercent =
                acc.current_invoice_utilization != null
                  ? Math.round(
                      acc.current_invoice_utilization * 100
                    )
                  : null;

              return (
                <motion.div
                  key={acc.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  whileHover={{ y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 text-[11px]">
                      <span className="text-sm text-zinc-100">
                        {acc.name}
                      </span>

                      <span className="text-zinc-500">
                        Saldo inicial:{" "}
                        <span className="text-zinc-100">
                          {formatCurrency(
                            Number(acc.initial_balance ?? 0)
                          )}
                        </span>
                      </span>

                      <span className="text-zinc-500">
                        Limite cartão:{" "}
                        <span className="text-zinc-100">
                          {acc.card_limit != null
                            ? formatCurrency(
                                Number(acc.card_limit ?? 0)
                              )
                            : "—"}
                        </span>
                      </span>

                      <span className="text-zinc-500">
                        Fechamento:{" "}
                        <span className="text-zinc-100">
                          {acc.closing_day ?? "—"}
                        </span>{" "}
                        · Vencimento:{" "}
                        <span className="text-zinc-100">
                          {acc.due_day ?? "—"}
                        </span>
                      </span>

                      <span className="text-zinc-500">
                        Fatura atual:{" "}
                        <span className="text-zinc-100">
                          {formatCurrency(
                            acc.current_invoice_amount
                          )}
                        </span>
                        {utilizPercent != null && (
                          <>
                            {" "}
                            ·{" "}
                            <span
                              className={
                                utilizPercent >= 90
                                  ? "text-red-400"
                                  : utilizPercent >= 75
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                              }
                            >
                              {utilizPercent}% do limite
                            </span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-2 text-[11px]">
                      <button
                        onClick={() => openEdit(acc)}
                        className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-100 hover:border-zinc-500"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(acc)}
                        className="rounded-full border border-zinc-800 bg-black px-3 py-1 text-[11px] text-zinc-500 hover:border-red-500/60 hover:text-red-400"
                      >
                        Apagar
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal criar/editar */}
      {(creating || editing) && (
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
                {creating ? "Nova conta" : "Editar conta"}
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
              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Nome da conta/banco
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Nubank, Itaú, PicPay..."
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Saldo inicial (R$)
                </label>
                <input
                  type="text"
                  value={form.initialBalance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      initialBalance: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Limite do cartão (R$) (opcional)
                </label>
                <input
                  type="text"
                  value={form.cardLimit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cardLimit: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de fechamento
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.closingDay}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        closingDay: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">
                    Dia de vencimento
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dueDay}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        dueDay: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    placeholder="Ex: 18"
                  />
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {saving
                  ? "A guardar..."
                  : creating
                  ? "Criar conta"
                  : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
