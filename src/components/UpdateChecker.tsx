"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

type UpdaterResult = {
  available?: boolean;
  version?: string;
  body?: string;
  downloadAndInstall?: () => Promise<void>;
  download?: () => Promise<void>;
  install?: () => Promise<void>;
};

function isLikelyNonTauriRuntimeError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return /__TAURI|TAURI_INTERNALS|ipc|invoke|not available|not initialized/i.test(
    message,
  );
}

async function notifyUpdateAvailable(language: "pt" | "en", version?: string) {
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification,
    } = await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (!granted) return;

    const title =
      language === "pt" ? "Atualizacao disponivel" : "Update available";
    const body =
      language === "pt"
        ? `Nova versao ${version ?? ""} pronta para instalar.`.trim()
        : `New version ${version ?? ""} is ready to install.`.trim();
    sendNotification({ title, body });
  } catch (err) {
    console.warn("[updater] notification failed:", err);
  }
}

export function UpdateChecker() {
  const { language } = useLanguage();
  const [update, setUpdate] = useState<UpdaterResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCheckedRef = useRef(false);

  const copy =
    language === "pt"
      ? {
          title: "Nova atualizacao disponivel",
          subtitle: "Versao",
          subtitleFallback: "mais recente",
          subtitleSuffix: "pronta para instalar.",
          installNow: "Atualizar agora",
          later: "Depois",
          checking: "Verificando...",
          installing: "Atualizando...",
          unavailable: "Atualizador indisponivel.",
          installFail: "Falha ao instalar atualizacao.",
          checkFail: "Falha ao verificar atualizacoes.",
        }
      : {
          title: "New update available",
          subtitle: "Version",
          subtitleFallback: "latest",
          subtitleSuffix: "is ready to install.",
          installNow: "Update now",
          later: "Later",
          checking: "Checking...",
          installing: "Updating...",
          unavailable: "Updater unavailable.",
          installFail: "Failed to install update.",
          checkFail: "Failed to check for updates.",
        };

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    let cancelled = false;

    const run = async () => {
      setChecking(true);
      try {
        const [{ check }, { getBundleType, BundleType }] = await Promise.all([
          import("@tauri-apps/plugin-updater"),
          import("@tauri-apps/api/app"),
        ]);

        const bundleType = await getBundleType().catch(() => null);
        // Only prompt updates for the MSI distribution channel.
        if (bundleType !== BundleType.Msi) {
          return;
        }

        const result: UpdaterResult | null = await check();
        if (!cancelled && result) {
          setUpdate(result);
          const version = result.version ?? "latest";
          const key = `updater-notified:${version}`;
          if (window.localStorage.getItem(key) !== "yes") {
            void notifyUpdateAvailable(language, result.version);
            window.localStorage.setItem(key, "yes");
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isLikelyNonTauriRuntimeError(err)) {
            // Expected when running in a regular browser context.
            return;
          }
          console.error("[updater] check failed:", err);
          setError(err instanceof Error ? err.message : copy.checkFail);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [copy.checkFail, language]);

  const onInstall = async () => {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      if (typeof update.downloadAndInstall === "function") {
        await update.downloadAndInstall();
      } else if (typeof update.download === "function" && typeof update.install === "function") {
        await update.download();
        await update.install();
      } else {
        throw new Error(copy.unavailable);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.installFail);
    } finally {
      setInstalling(false);
    }
  };

  if (dismissed || !update) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-emerald-500/30 bg-emerald-950/90 p-4 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-100">{copy.title}</p>
          <p className="text-xs text-emerald-200/80">
            {copy.subtitle} {update.version ?? copy.subtitleFallback} {copy.subtitleSuffix}
          </p>
          {error ? <p className="text-xs text-red-200">{error}</p> : null}
          {checking ? <p className="text-xs text-emerald-200/70">{copy.checking}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-emerald-200/30 px-3 py-1 text-xs text-emerald-100/80 transition hover:text-emerald-50"
            disabled={installing}
          >
            {copy.later}
          </button>
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-emerald-400 px-4 py-1 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
            disabled={installing}
          >
            {installing ? copy.installing : copy.installNow}
          </button>
        </div>
      </div>
    </div>
  );
}
