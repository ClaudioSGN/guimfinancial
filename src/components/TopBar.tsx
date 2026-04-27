"use client";

import { useMemo } from "react";
import { AppIcon } from "@/components/AppIcon";

type Props<T extends string> = {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  userName?: string;
  role?: string;
  monthLabel?: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
};

function getInitials(name?: string) {
  if (!name) return "GF";
  const parts = name.trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "GF";
}

export function TopBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  userName,
  role,
  monthLabel,
  onPrevMonth,
  onNextMonth,
}: Props<T>) {
  const initials = useMemo(() => getInitials(userName), [userName]);

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* Month navigation row */}
      {monthLabel ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="ui-eyebrow">Mês em gestão</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-1)]">{monthLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevMonth}
              disabled={!onPrevMonth}
              className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 p-0"
              aria-label="Mês anterior"
            >
              <AppIcon name="arrow-left" size={14} />
            </button>
            <span className="rounded-full border border-[var(--border-bright)] bg-[var(--surface-3)] px-3 py-1 text-xs font-medium text-[var(--text-2)]">
              {monthLabel}
            </span>
            <button
              onClick={onNextMonth}
              disabled={!onNextMonth}
              className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 p-0"
              aria-label="Próximo mês"
            >
              <AppIcon name="arrow-right" size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Tabs + user row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tab pills */}
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
          {tabs.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-[var(--surface-3)] text-[var(--text-1)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* User chip */}
        {userName ? (
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 text-right">
              <p className="text-sm font-semibold leading-tight text-[var(--text-1)]">{userName}</p>
              {role ? <p className="text-xs text-[var(--text-3)]">{role}</p> : null}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--surface-3)] text-xs font-semibold text-[var(--text-1)]">
              {initials}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
