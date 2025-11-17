"use client";

import { useState } from "react";

export function ExportMonthlyPdfButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const res = await fetch(
        `/api/reports/monthly-expenses?year=${year}&month=${month}`
      );

      if (!res.ok) {
        alert("Erro ao gerar PDF.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `gastos-${String(month).padStart(
        2,
        "0"
      )}-${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao baixar o PDF.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-100 hover:border-zinc-500 disabled:opacity-60"
    >
      {loading ? "Exportando..." : "Exportar PDF (mês atual)"}
    </button>
  );
}
