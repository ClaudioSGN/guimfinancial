"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GoalsPageClient } from "@/components/GoalsPageClient";
import { RecurringPlanningPanel } from "@/components/RecurringPlanningPanel";
import { getErrorMessage, hasMissingTableError } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabaseClient";

type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
};

async function getGoals(): Promise<{ goals: GoalRow[]; schemaMissing: boolean }> {
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, deadline")
    .order("created_at", { ascending: true });

  if (!error) {
    return {
      goals: (data ?? []) as GoalRow[],
      schemaMissing: false,
    };
  }

  if (hasMissingTableError(error, ["goals"])) {
    return { goals: [], schemaMissing: true };
  }

  console.error("Erro ao carregar metas:", getErrorMessage(error), error);
  return { goals: [], schemaMissing: false };
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const result = await getGoals();
        if (active) {
          setGoals(result.goals);
          setSchemaMissing(result.schemaMissing);
        }
      } catch (error) {
        console.error("Erro ao carregar metas:", getErrorMessage(error), error);
      } finally {
        if (active) setLoading(false);
      }
    }

    function handleRefresh() {
      load();
    }

    load();
    window.addEventListener("data-refresh", handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("data-refresh", handleRefresh);
    };
  }, []);

  return (
    <AppShell activeTab="goals">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:gap-8">
        <section className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.25em] text-[#6E7686]">
            Metas
          </span>
          <h1 className="text-3xl font-semibold text-[#F8FAFC]">Planejamento financeiro</h1>
          <p className="max-w-2xl text-sm text-[#8B94A6]">
            Acompanha objetivos, orcamentos mensais e contas fixas em um so lugar.
          </p>
        </section>

        <section className="space-y-4">
          {loading && goals.length === 0 ? (
            <p className="text-sm text-[#8B94A6]">A carregar metas...</p>
          ) : schemaMissing ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-medium">A tabela de metas ainda nao existe.</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Cria a tabela `goals` no Supabase e volta a abrir esta pagina.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <GoalsPageClient initialGoals={goals} />
              <RecurringPlanningPanel language="pt" />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
