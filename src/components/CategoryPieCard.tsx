"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";

type CategoryStat = {
  category: string;
  total: number;
};

const PIE_COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#ec4899",
  "#a855f7",
  "#facc15",
  "#14b8a6",
  "#6366f1",
  "#fb7185",
  "#737373",
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function CategoryPieCard({
  data,
  periodLabel,
}: {
  data: CategoryStat[];
  periodLabel: string;
}) {
  const totalExpenses = data.reduce((sum, item) => sum + item.total, 0);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          Despesas por categoria
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Ainda não há despesas registadas para {periodLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4 md:flex-row md:items-center">
      {/* Gráfico – largura/altura fixas pra não dar erro de -1 */}
      <div className="flex w-full justify-center md:w-1/2">
        <PieChart width={220} height={220}>
          <Pie
            data={data}
            dataKey="total"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${entry.category}-${index}`}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            labelFormatter={(label) => `${label ?? ""}`}
            contentStyle={{
              backgroundColor: "#09090b",
              border: "1px solid #27272a",
              borderRadius: "999px",
              padding: "6px 10px",
              fontSize: "11px",
            }}
          />
        </PieChart>
      </div>

      {/* Legenda / textos */}
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Despesas por categoria
          </p>
          <p className="text-xs text-zinc-400">
            Apenas despesas · {periodLabel} · Total:{" "}
            <span className="text-zinc-100">
              {formatCurrency(totalExpenses)}
            </span>
          </p>
        </div>

        <div className="mt-1 flex flex-col gap-1.5">
          {data.map((item, index) => {
            const percent =
              totalExpenses > 0
                ? Math.round((item.total / totalExpenses) * 100)
                : 0;

            return (
              <div
                key={item.category}
                className="flex items-center justify-between text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        PIE_COLORS[index % PIE_COLORS.length],
                    }}
                  />
                  <span className="text-zinc-300">
                    {item.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">
                    {formatCurrency(item.total)}
                  </span>
                  <span className="text-zinc-500">
                    {percent}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
