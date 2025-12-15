"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU_ITEMS = [{ href: "/", label: "Dashboard", icon: "📊" }];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#0f172a] text-white h-screen fixed left-0 top-0 shadow-2xl shadow-black/40 z-50 border-r border-[#1d253d]">
      <div className="h-16 flex items-center justify-center border-b border-[#1d253d] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e293b] text-[#3b82f6] font-semibold">
            GF
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Guim</span>
            <span className="text-xs text-slate-400">Finanças</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        {MENU_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? "bg-[#111a30] text-white border border-[#1f2a45] shadow-lg shadow-black/30"
                  : "text-slate-400 hover:bg-[#111a30] hover:text-white border border-transparent"
              }`}
            >
              <span className="mr-3 text-lg" aria-hidden>
                {item.icon}
              </span>
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#1d253d]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#2563eb] to-[#22c55e] flex items-center justify-center text-xs font-bold text-white">
            GF
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-white">UsuÇ­rio</span>
            <span className="text-[10px] text-slate-500">Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
