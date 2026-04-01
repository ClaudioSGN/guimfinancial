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
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "GF";
}

export function TopBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  userName = "Usuario",
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
      alert("Envie uma imagem valida (png, jpg, svg...).");
      return;
    }
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  return (
    <div className="app-surface app-card glass-highlight flex flex-col gap-4 p-4 sm:p-5">
      {monthLabel ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-eyebrow">Mes em gestao</p>
            <p className="mt-1 text-base font-semibold text-[#122033]">{monthLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevMonth}
              disabled={!onPrevMonth}
              className="app-button app-button-secondary h-10 w-10 text-sm"
            >
              ←
            </button>
            <div className="app-pill px-4 py-2 text-xs font-semibold text-[#39516f]">
              {monthLabel}
            </div>
            <button
              onClick={onNextMonth}
              disabled={!onNextMonth}
              className="app-button app-button-secondary h-10 w-10 text-sm"
            >
              →
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="app-surface app-card-soft glass-tint flex flex-wrap items-center gap-2 rounded-full p-1">
            {tabs.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-white/90 text-[#204a87] shadow-[0_10px_24px_rgba(129,151,178,0.18)]"
                      : "text-[#617287] hover:bg-white/45 hover:text-[#122033]"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 self-end lg:self-auto">
          <div
            role="button"
            aria-label="Alterar foto do usuario"
            onClick={handleAvatarClick}
            className="app-surface glass-highlight relative h-12 w-12 overflow-hidden rounded-full ring-1 ring-transparent transition hover:ring-[#8db7ff]"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Avatar do usuario" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#18304e]">
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

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-[#122033]">{userName}</p>
            <p className="text-xs text-[#6a7890]">{role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
