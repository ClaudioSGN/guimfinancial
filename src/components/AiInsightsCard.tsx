"use client";

import { motion, AnimatePresence } from "framer-motion";

export type Insight = {
  id: string;
  title: string;
  detail?: string;
  severity: "high" | "medium" | "low" | "positive";
};

type Props = {
  insights: Insight[];
};

const severityStyles: Record<
  Insight["severity"],
  { badge: string; dot: string }
> = {
  high: {
    badge:
      "border-red-500/40 bg-red-500/5 text-red-300",
    dot: "bg-red-400",
  },
  medium: {
    badge:
      "border-amber-500/40 bg-amber-500/5 text-amber-200",
    dot: "bg-amber-400",
  },
  low: {
    badge:
      "border-zinc-600/60 bg-zinc-900 text-zinc-200",
    dot: "bg-zinc-400",
  },
  positive: {
    badge:
      "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
    dot: "bg-emerald-400",
  },
};

export function AiInsightsCard({ insights }: Props) {
  if (!insights.length) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Insights automáticos
          </span>
          <span className="text-[11px] text-zinc-400">
            Pequenas leituras do teu mês com base nos números.
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {insights.map((insight, index) => {
            const style = severityStyles[insight.severity];

            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, delay: index * 0.03 }}
                className="flex gap-3 rounded-xl bg-zinc-950 px-3 py-2"
              >
                <div className="mt-1">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${style.dot}`}
                  />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-zinc-100">
                      {insight.title}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-[2px] text-[9px] ${style.badge}`}
                    >
                      {insight.severity === "high" && "Alerta"}
                      {insight.severity === "medium" && "Atenção"}
                      {insight.severity === "low" && "Info"}
                      {insight.severity === "positive" && "Bom sinal"}
                    </span>
                  </div>
                  {insight.detail && (
                    <p className="text-[11px] text-zinc-400">
                      {insight.detail}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
