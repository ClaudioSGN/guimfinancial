"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return initials.join("") || "GF";
}

export function TopBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  userName = "Usuário",
  role = "Admin",
  monthLabel,
  onPrevMonth,
  onNextMonth,
}: Props<T>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const initials = useMemo(() => getInitials(userName), [userName]);

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Envie uma imagem válida (png, jpg, svg...).");
      return;
    }
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#1d253d] bg-[#0d1427] px-4 py-3 shadow-lg shadow-black/30">
      {monthLabel && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Mês em gestão
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevMonth}
              disabled={!onPrevMonth}
              className="rounded-full border border-[#1f2a45] bg-[#0b1226] px-3 py-1 text-[11px] text-slate-300 transition hover:text-white disabled:opacity-40"
            >
              ←
            </button>
            <div className="rounded-full border border-[#1f2a45] bg-[#0b1226] px-4 py-1 text-[11px] text-slate-100">
              {monthLabel}
            </div>
            <button
              onClick={onNextMonth}
              disabled={!onNextMonth}
              className="rounded-full border border-[#1f2a45] bg-[#0b1226] px-3 py-1 text-[11px] text-slate-300 transition hover:text-white disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 justify-center">
          <div className="flex items-center gap-1 rounded-full border border-[#1f2a45] bg-[#0b1226] p-1 text-sm text-slate-100 shadow-inner shadow-black/30">
            {tabs.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`rounded-full px-4 py-1.5 transition ${
                    isActive
                      ? "bg-white text-[#0f172a] shadow"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            role="button"
            aria-label="Alterar foto do usuário"
            onClick={handleAvatarClick}
            className="relative h-11 w-11 overflow-hidden rounded-full border border-[#1f2a45] bg-[#0b1226] ring-1 ring-transparent transition hover:ring-[#3b82f6]"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt="Avatar do usuário"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
                {initials}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-semibold text-white">{userName}</span>
            <span className="text-[10px] text-slate-500">{role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
