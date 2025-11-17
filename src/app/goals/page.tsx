import { supabase } from "@/lib/supabaseClient";
import { GoalsPageClient } from "@/components/GoalsPageClient";
import { TopNav } from "@/components/TopNav";

type GoalRow = {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    deadline: string | null;
};

async function getGoals(): Promise<GoalRow[]> {
    const { data, error } = await supabase
        .from("goals")
        .select("id, name, target_amount, current_amount, deadline")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Erro ao carregar metas:", error.message);
        return [];
    }

    return (data ?? []) as GoalRow[];
}

export default async function GoalsPage() {
    const goals = await getGoals();

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

                    <GoalsPageClient initialGoals={goals}/>
                </section>
            </div>
        </main>
    );
}