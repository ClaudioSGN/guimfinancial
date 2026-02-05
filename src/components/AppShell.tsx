"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { AppIcon } from "@/components/AppIcon";

type TabKey = "home" | "transactions" | "investments" | "more";

type Props = {
  activeTab: TabKey;
  children: ReactNode;
};

export function AppShell({ activeTab, children }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    let timeoutId: number | undefined;
    if (menuOpen) {
      setMenuVisible(true);
    } else if (menuVisible) {
      timeoutId = window.setTimeout(() => {
        setMenuVisible(false);
      }, 180);
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [menuOpen, menuVisible]);

  function openNewEntry(type: string) {
    if (type === "investment") {
      router.push(`/investments?new=${Date.now()}`);
      setMenuOpen(false);
      return;
    }
    router.push(`/new-entry?type=${type}`);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-none flex-col px-5 pb-28 pt-6 lg:flex-row lg:gap-8 lg:px-10 lg:pb-10">
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:gap-3">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[#6E7686]">
            {t("tabs.home")}
          </div>
          <Link
            href="/"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
              activeTab === "home"
                ? "bg-[#141A25] text-[#5DD6C7]"
                : "text-[#8B94A6] hover:bg-[#111723] hover:text-[#C7CEDA]"
            }`}
          >
            <AppIcon name="house" size={18} />
            <span>{t("tabs.home")}</span>
          </Link>
          <Link
            href="/transactions"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
              activeTab === "transactions"
                ? "bg-[#141A25] text-[#5DD6C7]"
                : "text-[#8B94A6] hover:bg-[#111723] hover:text-[#C7CEDA]"
            }`}
          >
            <AppIcon name="list" size={18} />
            <span>{t("tabs.transactions")}</span>
          </Link>
          <Link
            href="/investments"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
              activeTab === "investments"
                ? "bg-[#141A25] text-[#5DD6C7]"
                : "text-[#8B94A6] hover:bg-[#111723] hover:text-[#C7CEDA]"
            }`}
          >
            <AppIcon name="calendar" size={18} />
            <span>{t("tabs.investments")}</span>
          </Link>
          <Link
            href="/more"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
              activeTab === "more"
                ? "bg-[#141A25] text-[#5DD6C7]"
                : "text-[#8B94A6] hover:bg-[#111723] hover:text-[#C7CEDA]"
            }`}
          >
            <AppIcon name="more" size={18} />
            <span>{t("tabs.more")}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="mt-4 flex items-center gap-3 rounded-xl border border-[#20293A] bg-[#101520] px-3 py-2 text-sm text-[#E4E7EC]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5EDF4] text-[#0B0E13]">
              <AppIcon name="plus" size={14} color="#0B0E13" />
            </span>
            <span>{t("newEntry.title")}</span>
          </button>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center lg:hidden">
        <div className="relative w-full max-w-[980px] px-5">
          <div className="h-[74px] w-full rounded-t-3xl border-t border-[#1B2230] bg-[#0D1016] px-4 pb-3 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
            <div className="grid h-full grid-cols-5 items-center text-xs">
              <Link
                href="/"
                className={`flex flex-col items-center gap-1 ${
                  activeTab === "home" ? "text-[#5DD6C7]" : "text-[#8B94A6]"
                }`}
              >
                <AppIcon name="house" size={22} />
                <span>{t("tabs.home")}</span>
              </Link>
              <Link
                href="/transactions"
                className={`flex flex-col items-center gap-1 ${
                  activeTab === "transactions" ? "text-[#5DD6C7]" : "text-[#8B94A6]"
                }`}
              >
                <AppIcon name="list" size={22} />
                <span>{t("tabs.transactions")}</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-full border border-[#20293A] bg-[#101520]"
              >
                <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#E5EDF4] text-[#0B0E13]">
                  <div
                    className={`transition-transform duration-200 ${
                      menuOpen ? "rotate-45" : "rotate-0"
                    }`}
                  >
                    <AppIcon name="plus" size={22} color={menuOpen ? "#F8FAFC" : "#0B0E13"} />
                  </div>
                </div>
              </button>
              <Link
                href="/investments"
                className={`flex flex-col items-center gap-1 ${
                  activeTab === "investments" ? "text-[#5DD6C7]" : "text-[#8B94A6]"
                }`}
              >
                <AppIcon name="calendar" size={22} />
                <span>{t("tabs.investments")}</span>
              </Link>
              <Link
                href="/more"
                className={`flex flex-col items-center gap-1 ${
                  activeTab === "more" ? "text-[#5DD6C7]" : "text-[#8B94A6]"
                }`}
              >
                <AppIcon name="more" size={22} />
                <span>{t("tabs.more")}</span>
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
        <div className="absolute inset-0 bg-[#0B0E13]/70" />
        <div className="absolute bottom-[96px] left-1/2 -translate-x-1/2">
          <div ref={menuRef} className="relative h-[200px] w-[200px]">
            {menuItems.map((item) => {
              const radius = 88;
              const radians = (item.angle * Math.PI) / 180;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openNewEntry(item.key);
                  }}
                  className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 transition-all duration-200 ${
                    menuOpen
                      ? "opacity-100"
                      : "pointer-events-none opacity-0"
                  }`}
                  style={{
                    transform: menuOpen
                      ? `translate(${x}px, ${y}px) scale(1)`
                      : "translate(0px, 0px) scale(0.4)",
                  }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E5EDF4] text-[#0B0E13]">
                    <AppIcon name={item.icon} size={18} color="#0B0E13" />
                  </span>
                  <span className="text-xs font-semibold text-[#E4E7EC]">
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
