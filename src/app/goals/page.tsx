"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GoalsPageClient } from "@/components/GoalsPageClient";
import { TopNav } from "@/components/TopNav";
import { getErrorMessage, hasMissingTableError } from "@/lib/errorUtils";

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
        <main className="min-h-screen bg-black text-zinc-100">
            <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-10">
                <TopNav/>

                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                                Metas financeiras
                            </span>
                            <span className="text-xs text-zinc-400">
                                Acompanha os objetivos que estás a construir.
                            </span>
                        </div>
                    </div>

                    {loading && goals.length === 0 ? (
                        <p className="text-xs text-zinc-400">A carregar metas...</p>
                    ) : schemaMissing ? (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                            <p className="font-medium">A tabela de metas ainda não existe.</p>
                            <p className="mt-1 text-xs text-amber-100/80">
                                Cria a tabela `goals` no Supabase e volta a abrir esta página.
                            </p>
                        </div>
                    ) : (
                        <GoalsPageClient initialGoals={goals}/>
                    )}
                </section>
            </div>
        </main>
    );
}
