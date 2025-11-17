"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Resumo" },
  { href: "/transactions", label: "Transações" },
  { href: "/banks", label: "Bancos" },
  { href: "/goals", label: "Metas" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          Finanças
        </span>
        <span className="text-xl font-semibold tracking-tight">
          Resumo
        </span>
      </div>

      <nav className="flex gap-2 rounded-full bg-zinc-950/80 p-1 text-xs">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-zinc-100 text-black"
                  : "text-zinc-300 hover:bg-zinc-800/80"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
