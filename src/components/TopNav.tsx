"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopNav() {
  const pathname = usePathname();

  const isResumo = pathname === "/" || pathname === "";
  const isTransacoes = pathname.startsWith("/transactions");
  const isBancos = pathname.startsWith("/accounts");

  function getTitle() {
    if (isResumo) return "Resumo";
    if (isTransacoes) return "Transações";
    if (isBancos) return "Bancos";
    return "Finanças";
  }

  return (
    <header className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          Finanças
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {getTitle()}
        </h1>
      </div>

      <nav className="flex items-center gap-1 rounded-full border border-zinc-900 bg-zinc-950/80 p-1 text-xs">
        <Link
          href="/"
          className={`rounded-full px-3 py-1.5 transition ${
            isResumo
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Resumo
        </Link>
        <Link
          href="/transactions"
          className={`rounded-full px-3 py-1.5 transition ${
            isTransacoes
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Transações
        </Link>
        <Link
          href="/accounts"
          className={`rounded-full px-3 py-1.5 transition ${
            isBancos
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Bancos
        </Link>
      </nav>
    </header>
  );
}
