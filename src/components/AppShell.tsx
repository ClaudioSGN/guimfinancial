"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { AppIcon } from "@/components/AppIcon";
import { NewEntryScreen } from "@/components/screens/NewEntryScreen";

type TabKey =
  | "home"
  | "transactions"
  | "goals"
  | "investments"
  | "more";

type Props = {
  activeTab: TabKey;
  children: ReactNode;
};

export function AppShell({ activeTab, children }: Props) {
  const { language, t } = useLanguage();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeModalType, setActiveModalType] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const investmentEntryCounter = useRef(0);
  const goalsLabel = language === "en" ? "Goals" : "Metas";

  const menuItems = useMemo(
    () => [
      { key: "transfer",    label: t("newEntry.transfer"),           icon: "transfer",     color: "#A78BFA" },
      { key: "income",      label: t("newEntry.income"),             icon: "arrow-up",     color: "#34D399" },
      { key: "investment",  label: t("investments.newInvestment"),   icon: "wallet",       color: "#60A5FA" },
      { key: "card_expense",label: t("newEntry.cardExpense"),        icon: "credit-card",  color: "#FBBF24" },
      { key: "expense",     label: t("newEntry.expense"),            icon: "arrow-down",   color: "#F87171" },
    ] as const,
    [t],
  );

  const navItems = [
    { href: "/",             key: "home",         icon: "house",    label: t("tabs.home") },
    { href: "/transactions", key: "transactions", icon: "list",     label: t("tabs.transactions") },
    { href: "/investments",  key: "investments",  icon: "calendar", label: t("tabs.investments") },
    { href: "/goals",        key: "goals",        icon: "target",   label: goalsLabel },
    { href: "/more",         key: "more",         icon: "more",     label: t("tabs.more") },
  ] as const;

  useEffect(() => {
    let timeoutId: number | undefined;
    if (menuOpen) {
      timeoutId = window.setTimeout(() => setMenuVisible(true), 0);
    } else if (menuVisible) {
      timeoutId = window.setTimeout(() => setMenuVisible(false), 200);
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [menuOpen, menuVisible]);

  function openNewEntry(type: string) {
    if (type === "investment") {
      investmentEntryCounter.current += 1;
      router.push(`/investments?new=${investmentEntryCounter.current}`);
      setMenuOpen(false);
      return;
    }
    setActiveModalType(type);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-[60px] flex-col items-center border-r border-[var(--border)] bg-[var(--surface)] py-4 md:flex">
        <div className="flex flex-1 flex-col items-center gap-1 pt-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                title={item.label}
                className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  isActive
                    ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)]"
                }`}
              >
                <AppIcon name={item.icon} size={20} />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--border-bright)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-1)] opacity-0 shadow-[var(--shadow-md)] transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* FAB ── */}
        <button
          type="button"
          title={t("newEntry.title")}
          onClick={() => setMenuOpen((v) => !v)}
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-[0_4px_16px_rgba(79,142,255,0.35)] transition-transform hover:scale-105 active:scale-95"
        >
          <div className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : "rotate-0"}`}>
            <AppIcon name="plus" size={18} color="#fff" />
          </div>
        </button>
      </aside>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6 md:pl-[60px]">
        <div className="px-3 pt-4 sm:px-4 md:px-6 md:pt-6">
          {children}
        </div>
      </div>

      {/* ── Mobile bottom bar ───────────────────────────────────────────── */}
      <nav className="nav-bar fixed bottom-0 left-0 right-0 z-40 md:hidden">
        <div className="flex w-full items-center justify-around px-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 xs:px-2">
          {navItems.slice(0, 2).map((item) => {
            const isActive = activeTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-3)]"
                }`}
              >
                <AppIcon name={item.icon} size={22} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {/* Center FAB */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] shadow-[0_6px_20px_rgba(79,142,255,0.4)] transition-transform active:scale-95"
          >
            <div className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : "rotate-0"}`}>
              <AppIcon name="plus" size={22} color="#fff" />
            </div>
          </button>

          {navItems.slice(2).map((item) => {
            const isActive = activeTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-3)]"
                }`}
              >
                <AppIcon name={item.icon} size={22} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── New entry modal ─────────────────────────────────────────────── */}
      {activeModalType ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setActiveModalType(null)}
        >
          <div
            className="ui-card-2 ui-slide-up w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
            style={{
              maxHeight: "min(92dvh, 760px)",
              paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 1.25rem))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--text-1)]" />
              <button
                type="button"
                onClick={() => setActiveModalType(null)}
                className="ui-btn ui-btn-ghost ui-btn-sm"
              >
                {language === "pt" ? "Fechar" : "Close"}
              </button>
            </div>
            <NewEntryScreen entryType={activeModalType} onClose={() => setActiveModalType(null)} />
          </div>
        </div>
      ) : null}

      {/* ── Action menu overlay ──────────────────────────────────────────── */}
      {menuVisible && (
        <div
          className={`ui-modal-backdrop fixed inset-0 z-50 transition-opacity duration-200 ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        >
          {/* Desktop: dropdown panel next to FAB */}
          <div
            className="absolute bottom-16 left-[72px] hidden md:block"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-card-2 ui-slide-up flex flex-col gap-1 overflow-hidden p-2">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openNewEntry(item.key);
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface-3)]"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${item.color}18`, color: item.color }}
                  >
                    <AppIcon name={item.icon} size={16} />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile: radial menu above FAB */}
          <div
            className="absolute left-1/2 -translate-x-1/2 md:hidden"
            style={{ bottom: "calc(100px + env(safe-area-inset-bottom))" }}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-[200px] w-[200px]">
              {menuItems.map((item, index) => {
                const angles = [210, 150, 270, 30, 330];
                const angle = angles[index] ?? 0;
                const radius = 88;
                const rad = (angle * Math.PI) / 180;
                const x = Math.cos(rad) * radius;
                const y = Math.sin(rad) * radius;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNewEntry(item.key);
                    }}
                    className={`absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5 transition-all duration-200 ${
                      menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      transform: menuOpen
                        ? `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(1)`
                        : "translate(-50%, -50%) scale(0.3)",
                      transitionDelay: menuOpen ? `${index * 30}ms` : "0ms",
                    }}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--surface-2)] shadow-[var(--shadow-md)]"
                      style={{ color: item.color }}
                    >
                      <AppIcon name={item.icon} size={18} />
                    </span>
                    <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-1)]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
