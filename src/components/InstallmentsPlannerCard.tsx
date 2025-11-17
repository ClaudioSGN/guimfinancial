"use client";

import { motion } from "framer-motion";

type InstallmentMonthSummary = {
  key: string;
  labelShort: string;
  labelLong: string;
  total: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function InstallmentsPlannerCard({
  months,
}: {
  months: InstallmentMonthSummary[];
}) {
  if (!months || months.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          Parcelas futuras
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Não há parcelas futuras registadas em compras parceladas de
          cartão.
        </p>
      </section>
    );
  }

  const totalAll = months.reduce((s, m) => s + m.total, 0);

  return (
    <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
      <div className="flex items-center justify_between">
        <div className="flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Parcelas futuras
          </p>
          <p className="text-[11px] text-zinc-400">
            Próximos meses · total previsto:{" "}
            <span className="text-zinc-100">
              {formatCurrency(totalAll)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-[11px]">
        {months.map((m, index) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.03 }}
            className="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2"
          >
            <div className="flex flex-col">
              <span className="text-zinc-300">{m.labelLong}</span>
              <span className="text-[10px] text-zinc-500">
                {m.labelShort}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-zinc-100">
                {formatCurrency(m.total)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
