"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
} from "recharts";

type CategoryStat = {
  category: string;
  total: number;
};

type MonthSummary = {
  key: string;
  labelShort: string; // "11/25"
  labelLong: string; // "novembro/25"
  income: number;
  expense: number;
  net: number;
  categories: CategoryStat[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// Paleta super neutra
const RING_TRACK = "#18181b"; // trilha escura
const RING_GRADIENT_FROM = "#f4f4f5"; // topo do anel
const RING_GRADIENT_TO = "#d4d4d8"; // base do anel

export function MonthlyDashboard({ months }: { months: MonthSummary[] }) {
  const [selectedKey, setSelectedKey] = useState(
    months[0]?.key ?? null
  );

  const selectedMonth = useMemo(() => {
    if (!months.length) return null;
    const found = months.find((m) => m.key === selectedKey);
    return found ?? months[0];
  }, [months, selectedKey]);

  if (!months.length || !selectedMonth) {
    return (
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4 text-xs">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          Visão mensal
        </p>
        <p className="mt-1 text-zinc-500">
          Ainda não há dados suficientes para mostrar os meses.
        </p>
      </section>
    );
  }

  const monthOptions = months
    .slice()
    .sort((a, b) => (a.key < b.key ? 1 : -1)); // mais recente primeiro

  const onlyExpensesCategories =
    selectedMonth.categories.length > 0
      ? selectedMonth.categories
      : [];

  const totalExpenses = onlyExpensesCategories.reduce(
    (sum, c) => sum + c.total,
    0
  );

  const donutValue = totalExpenses > 0 ? totalExpenses : 1;

  return (
    <section className="space-y-4">
      {/* Cabeçalho + seletor de meses em cima */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Visão mensal
            </p>
            <p className="text-[11px] text-zinc-400">
              Últimos meses · toca num mês para ver os detalhes.
            </p>
          </div>
        </div>

        <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
          {monthOptions.map((m) => {
            const active = m.key === selectedMonth.key;
            return (
              <motion.button
                key={m.key}
                onClick={() => setSelectedKey(m.key)}
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-zinc-100 bg-zinc-100 text-black"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {m.labelShort}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Card com números do mês selecionado */}
      <motion.div
        key={selectedMonth.key + "-summary"}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4"
      >
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">
              Mês selecionado
            </span>
            <span className="text-sm font-medium text-zinc-100">
              {selectedMonth.labelLong}
            </span>
          </div>
          <div className="flex flex-col gap-2 text-[11px] md:flex-row md:gap-6">
            <div className="flex flex-col">
              <span className="text-zinc-500">Recebido</span>
              <span className="text-emerald-400">
                {formatCurrency(selectedMonth.income)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500">Gasto</span>
              <span className="text-red-400">
                {formatCurrency(selectedMonth.expense)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500">Resultado do mês</span>
              <span
                className={
                  selectedMonth.net >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {formatCurrency(selectedMonth.net)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Card do donut + categorias */}
      <motion.div
        key={selectedMonth.key + "-categories"}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.18, delay: 0.05 }}
        className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Despesas por categoria
            </span>
            <span className="text-[11px] text-zinc-400">
              Apenas despesas · Total:{" "}
              <span className="text-zinc-100">
                {formatCurrency(totalExpenses)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          {/* Donut deluxe minimalista */}
          <div className="mx-auto h-40 w-full max-w-xs md:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter
                    id="ringShadow"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="4"
                      stdDeviation="6"
                      floodColor="#000"
                      floodOpacity="0.33"
                    />
                  </filter>

                  <linearGradient
                    id="ringGradient"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop
                      offset="0%"
                      stopColor={RING_GRADIENT_FROM}
                    />
                    <stop
                      offset="100%"
                      stopColor={RING_GRADIENT_TO}
                    />
                  </linearGradient>
                </defs>

                {/* Trilho de fundo */}
                <Pie
                  data={[{ name: "track", value: 1 }]}
                  dataKey="value"
                  innerRadius="68%"
                  outerRadius="88%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  fill={RING_TRACK}
                />

                {/* Anel principal */}
                <Pie
                  data={[{ name: "total", value: donutValue }]}
                  dataKey="value"
                  innerRadius="72%"
                  outerRadius="92%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  fill="url(#ringGradient)"
                  isAnimationActive
                  animationDuration={650}
                  animationBegin={0}
                  cornerRadius={999}
                  filter="url(#ringShadow)"
                />

                <Tooltip
                  formatter={(value: any) =>
                    formatCurrency(Number(value) || 0)
                  }
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid #27272a",
                    borderRadius: 9999,
                    fontSize: 11,
                    padding: "4px 8px",
                  }}
                  cursor={{ fill: "transparent" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Lista de categorias */}
          <div className="flex-1 space-y-1 text-[11px]">
            <AnimatePresence initial={false}>
              {onlyExpensesCategories.length === 0 ? (
                <motion.p
                  key="empty-cats"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-zinc-500"
                >
                  Ainda não há despesas categorizadas neste mês.
                </motion.p>
              ) : (
                onlyExpensesCategories.map((cat) => {
                  const percent =
                    totalExpenses > 0
                      ? Math.round((cat.total / totalExpenses) * 100)
                      : 0;

                  return (
                    <motion.div
                      key={cat.category}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      whileHover={{ y: -1, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-between rounded-xl bg-zinc-950 px-3 py-1.5"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs text-zinc-100">
                          {cat.category}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {percent}% do total
                        </span>
                      </div>
                      <span className="text-xs text-zinc-100">
                        {formatCurrency(cat.total)}
                      </span>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
