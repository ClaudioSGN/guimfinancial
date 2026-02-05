"use client";

import { useEffect, useState } from "react";

type UpdaterResult = {
  available?: boolean;
  version?: string;
  body?: string;
  downloadAndInstall?: () => Promise<void>;
  download?: () => Promise<void>;
  install?: () => Promise<void>;
};

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdaterResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isTauriRuntime()) return;
      setChecking(true);
      try {
        const [{ check }, { getBundleType, BundleType }] = await Promise.all([
          import("@tauri-apps/plugin-updater"),
          import("@tauri-apps/api/app"),
        ]);

        const bundleType = await getBundleType().catch(() => null);
        if (bundleType && bundleType !== BundleType.Msi) {
          return;
        }

        const result: UpdaterResult | null = await check();
        if (!cancelled && result?.available) {
          setUpdate(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao verificar atualizações.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

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
        throw new Error("Atualizador indisponível.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao instalar atualização.");
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
          <p className="text-sm font-semibold text-emerald-100">Nova atualizacao disponivel</p>
          <p className="text-xs text-emerald-200/80">
            Versao {update.version ?? "mais recente"} pronta para instalar.
          </p>
          {error ? <p className="text-xs text-red-200">{error}</p> : null}
          {checking ? <p className="text-xs text-emerald-200/70">Verificando...</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-emerald-200/30 px-3 py-1 text-xs text-emerald-100/80 transition hover:text-emerald-50"
            disabled={installing}
          >
            Depois
          </button>
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-emerald-400 px-4 py-1 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
            disabled={installing}
          >
            {installing ? "Atualizando..." : "Atualizar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}
