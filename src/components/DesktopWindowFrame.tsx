"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/language";
import type { Language } from "../../shared/i18n";

type WindowControlApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (handler: () => void | Promise<void>) => Promise<(() => void | Promise<void>)>;
};

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(
    tauriWindow.__TAURI__ ||
    tauriWindow.__TAURI_INTERNALS__ ||
    /tauri/i.test(navigator.userAgent),
  );
}

function getCurrentSectionTitle(
  pathname: string,
  language: Language,
  t: (key: string) => string,
) {
  if (pathname === "/") return t("tabs.home");
  if (pathname.startsWith("/transactions")) return t("tabs.transactions");
  if (pathname.startsWith("/investments")) return t("tabs.investments");
  if (pathname.startsWith("/more")) return t("tabs.more");
  if (pathname.startsWith("/profile")) return language === "pt" ? "Perfil" : "Profile";
  if (pathname.startsWith("/new-entry")) return language === "pt" ? "Nova entrada" : "New entry";
  if (pathname.startsWith("/accounts")) return language === "pt" ? "Contas" : "Accounts";
  if (pathname.startsWith("/cards")) return language === "pt" ? "Cartoes" : "Cards";
  if (pathname.startsWith("/banks")) return language === "pt" ? "Bancos" : "Banks";
  if (pathname.startsWith("/goals")) return language === "pt" ? "Metas" : "Goals";
  if (pathname.startsWith("/export")) return language === "pt" ? "Exportar" : "Export";
  return "GuimFinancial";
}

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, t } = useLanguage();
  const [isTauri, setIsTauri] = useState(false);
  const [windowApi, setWindowApi] = useState<WindowControlApi | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const currentSectionTitle = useMemo(
    () => getCurrentSectionTitle(pathname, language, t),
    [pathname, language, t],
  );

  useEffect(() => {
    const tauri = isTauriRuntime();
    setIsTauri(tauri);
    if (!tauri) return;

    let disposed = false;
    let unlistenResize: (() => void | Promise<void>) | null = null;

    async function setupWindowApi() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const api = getCurrentWindow() as unknown as WindowControlApi;
        if (disposed) return;
        setWindowApi(api);

        try {
          setIsMaximized(await api.isMaximized());
        } catch {
          setIsMaximized(false);
        }

        try {
          unlistenResize = await api.onResized(async () => {
            try {
              setIsMaximized(await api.isMaximized());
            } catch {
              setIsMaximized(false);
            }
          });
        } catch {
          // Keep controls functional even if resize listener is unavailable.
        }
      } catch {
        // Ignore: not running in a Tauri desktop window.
      }
    }

    void setupWindowApi();

    return () => {
      disposed = true;
      if (unlistenResize) {
        const maybePromise = unlistenResize();
        if (maybePromise instanceof Promise) {
          void maybePromise;
        }
      }
    };
  }, []);

  async function runWindowAction(action: (() => Promise<void> | void) | undefined) {
    if (!action) return;
    try {
      await action();
    } catch (error) {
      // Keep UI responsive and leave a breadcrumb for debugging permission/runtime issues.
      console.warn("[window-frame] action failed:", error);
    }
  }

  async function handleToggleMaximize() {
    await runWindowAction(() => windowApi?.toggleMaximize());
    if (!windowApi) return;
    try {
      setIsMaximized(await windowApi.isMaximized());
    } catch {
      setIsMaximized(false);
    }
  }

  if (!isTauri) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] h-14 px-2 pt-2">
        <div className="relative flex h-10 items-stretch rounded-xl border border-[#293345] bg-[linear-gradient(180deg,#1B2433_0%,#141C29_100%)] shadow-[0_8px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div
            data-tauri-drag-region
            onDoubleClick={() => {
              void handleToggleMaximize();
            }}
            className="flex min-w-0 flex-1 items-center gap-2 px-3"
          >
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[linear-gradient(135deg,#75E2D4_0%,#45B3A4_100%)]" />
            <span className="truncate text-[12px] font-semibold tracking-[0.02em] text-[#DEE6F3]">
              GuimFinancial
            </span>
          </div>

          <div
            data-tauri-drag-region
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <span className="max-w-[40vw] truncate rounded-md border border-[#2A3446] bg-[#101722]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#C6D0E2]">
              {currentSectionTitle}
            </span>
          </div>

          <div className="mr-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => runWindowAction(() => windowApi?.minimize())}
              aria-label="Minimize window"
              title="Minimize"
              className="flex h-8 w-9 items-center justify-center rounded-md text-[#B8C1D3] transition-colors hover:bg-[#2A3447] hover:text-[#E7EDF8]"
            >
              <span className="h-[1.5px] w-3.5 rounded-full bg-current" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
              title={isMaximized ? "Restore" : "Maximize"}
              className="flex h-8 w-9 items-center justify-center rounded-md text-[#B8C1D3] transition-colors hover:bg-[#2A3447] hover:text-[#E7EDF8]"
            >
              {isMaximized ? (
                <span className="relative block h-3.5 w-3.5">
                  <span className="absolute left-[2px] top-0 h-[9px] w-[9px] rounded-[1px] border border-current" />
                  <span className="absolute bottom-0 right-[2px] h-[9px] w-[9px] rounded-[1px] border border-current bg-[#151D2A]" />
                </span>
              ) : (
                <span className="block h-[9px] w-[9px] rounded-[1px] border border-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => runWindowAction(() => windowApi?.close())}
              aria-label="Close window"
              title="Close"
              className="group flex h-8 w-9 items-center justify-center rounded-md text-[#B8C1D3] transition-colors hover:bg-[#E23D4D] hover:text-white"
            >
              <span className="relative block h-3.5 w-3.5">
                <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 rotate-45 rounded-full bg-current" />
                <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 -rotate-45 rounded-full bg-current" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="pt-14">{children}</div>
    </>
  );
}
