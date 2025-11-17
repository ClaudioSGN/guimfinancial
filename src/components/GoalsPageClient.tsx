"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";

type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
};

type GoalFormState = {
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDeadline(dateStr: string | null) {
  if (!dateStr) return "Sem prazo";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Prazo inválido";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function GoalsPageClient({
  initialGoals,
}: {
  initialGoals: GoalRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState<GoalFormState>({
    name: "",
    targetAmount: "",
    currentAmount: "",
    deadline: "",
  });

  function openCreate() {
    setForm({
      name: "",
      targetAmount: "",
      currentAmount: "",
      deadline: "",
    });
    setErrorMsg(null);
    setCreating(true);
    setEditingGoal(null);
  }

  function openEdit(goal: GoalRow) {
    setForm({
      name: goal.name,
      targetAmount: String(goal.target_amount).replace(".", ","),
      currentAmount: String(goal.current_amount).replace(".", ","),
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : "",
    });
    setErrorMsg(null);
    setCreating(false);
    setEditingGoal(goal);
  }

  function closeModal() {
    setCreating(false);
    setEditingGoal(null);
    setSaving(false);
    setErrorMsg(null);
  }

  function parseMoney(input: string): number | null {
    if (!input.trim()) return null;
    const normalized = input.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const target = parseMoney(form.targetAmount);
    const current =
      parseMoney(form.currentAmount) ?? (editingGoal ? 0 : 0);

    if (!form.name.trim()) {
      setErrorMsg("Dá um nome à meta.");
      return;
    }

    if (target === null || target <= 0) {
      setErrorMsg("Define um valor-alvo maior que zero.");
      return;
    }

    if (current < 0 || current > target) {
      setErrorMsg(
        "O valor atual não pode ser negativo nem maior que o alvo."
      );
      return;
    }

    setSaving(true);

    if (creating) {
      const { error } = await supabase.from("goals").insert([
        {
          name: form.name.trim(),
          target_amount: target,
          current_amount: current,
          deadline: form.deadline || null,
        },
      ]);

      setSaving(false);

      if (error) {
        console.error(error);
        setErrorMsg("Erro ao criar meta.");
        return;
      }
    } else if (editingGoal) {
      const { error } = await supabase
        .from("goals")
        .update({
          name: form.name.trim(),
          target_amount: target,
          current_amount: current,
          deadline: form.deadline || null,
        })
        .eq("id", editingGoal.id);

      setSaving(false);

      if (error) {
        console.error(error);
        setErrorMsg("Erro ao guardar alterações.");
        return;
      }
    }

    closeModal();
    router.refresh();
  }

  async function handleDelete(goal: GoalRow) {
    const ok = window.confirm(
      `Apagar a meta "${goal.name}"? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("goals")
      .delete()
      .eq("id", goal.id);

    if (error) {
      console.error(error);
      alert("Erro ao apagar meta.");
      return;
    }

    router.refresh();
  }

  return (
    <>
      {/* Header + botão criar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          Cria metas para poupar, investir ou pagar dívidas.
        </p>
        <button
          onClick={openCreate}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200"
        >
          Nova meta
        </button>
      </div>

      {/* Lista de metas */}
      {initialGoals.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Ainda não há metas registadas. Começa por criar uma meta de
          poupança ou de pagamento de dívida.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <AnimatePresence>
            {initialGoals.map((goal) => {
              const target = Number(goal.target_amount) || 0;
              const current = Number(goal.current_amount) || 0;
              const progress =
                target > 0 ? Math.min(current / target, 1) : 0;
              const percent = Math.round(progress * 100);

              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-2xl border border-zinc-900 bg-zinc-950/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-zinc-100">
                        {goal.name}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        Alvo:{" "}
                        <span className="text-zinc-100">
                          {formatCurrency(target)}
                        </span>{" "}
                        · Atual:{" "}
                        <span className="text-zinc-100">
                          {formatCurrency(current)}
                        </span>
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        Prazo: {formatDeadline(goal.deadline)}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-2 text-[11px]">
                      <span
                        className={
                          percent >= 100
                            ? "text-emerald-400"
                            : "text-zinc-400"
                        }
                      >
                        {percent}%
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(goal)}
                          className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] text-zinc-300 hover:border-zinc-500"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(goal)}
                          className="rounded-full border border-zinc-800 px-3 py-1 text-[11px] text-zinc-500 hover:border-red-500/60 hover:text-red-400"
                        >
                          Apagar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className={`h-full rounded-full ${
                        percent >= 100
                          ? "bg-emerald-400"
                          : "bg-zinc-100"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal Create/Edit */}
      {(creating || editingGoal) && (
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
                {creating ? "Nova meta" : "Editar meta"}
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
                  Nome da meta
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="Ex: Reserva de emergência, novo PC..."
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Valor alvo (R$)
                </label>
                <input
                  type="text"
                  value={form.targetAmount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      targetAmount: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Quanto já tens (R$)
                </label>
                <input
                  type="text"
                  value={form.currentAmount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      currentAmount: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="text-xs text-zinc-400">
                  Prazo (opcional)
                </label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      deadline: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-zinc-100 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {saving
                  ? "A guardar..."
                  : creating
                  ? "Criar meta"
                  : "Guardar alterações"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
