"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { AppIcon } from "@/components/AppIcon";

type TabKey =
  | "home"
  | "transactions"
  | "goals"
  | "investments"
  | "more"
  | "profile";

type Props = {
  activeTab: TabKey;
  children: ReactNode;
};

export function AppShell({ activeTab, children }: Props) {
  const { language, t } = useLanguage();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const investmentEntryCounter = useRef(0);
  const goalsLabel = language === "en" ? "Goals" : "Metas";

  const menuItems = useMemo(
    () => [
      { key: "transfer", label: t("newEntry.transfer"), icon: "transfer", angle: 210 },
      { key: "income", label: t("newEntry.income"), icon: "arrow-up", angle: 150 },
      { key: "investment", label: t("investments.newInvestment"), icon: "wallet", angle: 270 },
      { key: "card_expense", label: t("newEntry.cardExpense"), icon: "credit-card", angle: 30 },
      { key: "expense", label: t("newEntry.expense"), icon: "arrow-down", angle: 330 },
    ] as const,
    [t],
  );

  const navItems = [
    { href: "/", key: "home", icon: "house", label: t("tabs.home") },
    { href: "/transactions", key: "transactions", icon: "list", label: t("tabs.transactions") },
    { href: "/investments", key: "investments", icon: "calendar", label: t("tabs.investments") },
    { href: "/goals", key: "goals", icon: "target", label: goalsLabel },
    { href: "/more", key: "more", icon: "more", label: t("tabs.more") },
  ] as const;

  useEffect(() => {
    let timeoutId: number | undefined;
    if (menuOpen) {
      timeoutId = window.setTimeout(() => setMenuVisible(true), 0);
    } else if (menuVisible) {
      timeoutId = window.setTimeout(() => setMenuVisible(false), 180);
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
    router.push(`/new-entry?type=${type}`);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen text-slate-950">
      <div className="flex min-h-screen w-full max-w-none flex-col px-3 pb-28 pt-4 sm:px-4 lg:px-4 lg:pb-10 lg:pt-5 xl:px-5 2xl:px-6">
        <div className="pointer-events-none fixed left-3 top-3 z-30 hidden lg:block">
          <div className="group pointer-events-auto relative h-14 w-14">
            <div className="app-surface glass-highlight absolute left-0 top-0 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_45px_rgba(7,10,18,0.3)] transition-opacity duration-200 group-hover:opacity-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[#dbe8ff]">
                <AppIcon name="more" size={18} color="currentColor" />
              </div>
            </div>

            <div className="absolute left-3 top-0 -translate-x-4 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100">
              <div className="glass-dark glass-dark-card flex w-[min(920px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 overflow-hidden px-2 py-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {navItems.map((item) => {
                    const isActive = activeTab === item.key;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`flex items-center gap-2 rounded-full px-2.5 py-2 text-xs transition sm:px-3 sm:text-sm ${
                          isActive
                            ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "text-[#b8c4d8] hover:bg-white/6 hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            isActive ? "bg-[#17355d] text-[#7ab3ff]" : "bg-white/6 text-[#9fb2cb]"
                          }`}
                        >
                          <AppIcon name={item.icon} size={16} />
                        </span>
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="ml-auto flex h-10 shrink-0 items-center gap-2 rounded-full bg-[linear-gradient(180deg,rgba(35,87,180,0.98),rgba(22,70,151,0.94))] px-3 text-xs font-semibold text-[#f4f8ff] shadow-[0_16px_34px_rgba(14,51,120,0.34)] sm:text-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <AppIcon name="plus" size={14} color="#f8fbff" />
                  </span>
                  <span>{t("newEntry.title")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center lg:hidden">
        <div className="w-full max-w-[980px] px-4 pb-3 sm:px-5">
          <div className="app-surface glass-highlight rounded-[34px] px-2 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_20px_50px_rgba(136,153,176,0.28)]">
            <div className="grid h-full grid-cols-[1fr_1fr_1fr_auto_1fr_1fr] items-center gap-1 text-[10px] max-[380px]:text-[9px]">
              <Link
                href="/"
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1 py-2 ${
                  activeTab === "home" ? "bg-white/65 text-[#3d7de2]" : "text-[#617287]"
                }`}
              >
                <AppIcon name="house" size={20} />
                <span className="w-full text-center leading-tight">{t("tabs.home")}</span>
              </Link>
              <Link
                href="/transactions"
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1 py-2 ${
                  activeTab === "transactions" ? "bg-white/65 text-[#3d7de2]" : "text-[#617287]"
                }`}
              >
                <AppIcon name="list" size={20} />
                <span className="w-full text-center leading-tight">{t("tabs.transactions")}</span>
              </Link>
              <Link
                href="/goals"
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1 py-2 ${
                  activeTab === "goals" ? "bg-white/65 text-[#3d7de2]" : "text-[#617287]"
                }`}
              >
                <AppIcon name="target" size={20} />
                <span className="w-full text-center leading-tight">{goalsLabel}</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(95,160,255,0.98),rgba(66,130,230,0.92))] shadow-[0_18px_36px_rgba(89,141,223,0.34)]"
              >
                <div className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : "rotate-0"}`}>
                  <AppIcon name="plus" size={20} color="#F8FAFC" />
                </div>
              </button>
              <Link
                href="/investments"
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1 py-2 ${
                  activeTab === "investments" ? "bg-white/65 text-[#3d7de2]" : "text-[#617287]"
                }`}
              >
                <AppIcon name="calendar" size={20} />
                <span className="w-full text-center leading-tight">{t("tabs.investments")}</span>
              </Link>
              <Link
                href="/more"
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1 py-2 ${
                  activeTab === "more" ? "bg-white/65 text-[#3d7de2]" : "text-[#617287]"
                }`}
              >
                <AppIcon name="more" size={20} />
                <span className="w-full text-center leading-tight">{t("tabs.more")}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-20 transition-opacity duration-150 ${
          menuVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
      >
        <div className="app-modal-backdrop absolute inset-0" />
        <div className="absolute bottom-[108px] left-1/2 -translate-x-1/2">
          <div
            ref={menuRef}
            className="relative h-[220px] w-[220px]"
            onClick={(event) => event.stopPropagation()}
          >
            {menuItems.map((item) => {
              const radius = 94;
              const radians = (item.angle * Math.PI) / 180;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openNewEntry(item.key);
                  }}
                  className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 transition-all duration-200 ${
                    menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                  style={{
                    transform: menuOpen
                      ? `translate(${x}px, ${y}px) scale(1)`
                      : "translate(0px, 0px) scale(0.4)",
                  }}
                >
                  <span className="app-surface glass-highlight flex h-12 w-12 items-center justify-center rounded-full bg-white/70">
                    <AppIcon name={item.icon} size={18} color="#1b3354" />
                  </span>
                  <span className="rounded-full bg-white/40 px-2.5 py-1 text-xs font-semibold text-[#1b2d45] backdrop-blur-md">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
