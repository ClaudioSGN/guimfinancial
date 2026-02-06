"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";

type UpdaterResult = {
  available?: boolean;
  version?: string;
  body?: string;
  downloadAndInstall?: () => Promise<void>;
  download?: () => Promise<void>;
  install?: () => Promise<void>;
};

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  // `window.__TAURI__` is only present when `app.withGlobalTauri` is enabled.
  // `window.__TAURI_INTERNALS__` is the default runtime surface used by the JS API.
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
}

export function CheckForUpdatesCard() {
  const { language } = useLanguage();

  const copy =
    language === "pt"
      ? {
          title: "Atualizacoes do app",
          hint: "Verifique se ha uma nova versao disponivel.",
          checking: "Verificando...",
          upToDate: "Voce ja esta na versao mais recente.",
          available: "Nova atualizacao disponivel!",
          install: "Atualizar agora",
          close: "Fechar",
          error: "Falha ao verificar atualizacoes.",
          tauriOnly: "Atualizacoes so funcionam no app instalado (MSI).",
          unsupported: "Este tipo de instalacao nao suporta atualizacoes automaticas.",
          installing: "Atualizando...",
        }
      : {
          title: "App updates",
          hint: "Check if there is a new version available.",
          checking: "Checking...",
          upToDate: "You're already up to date.",
          available: "Update available!",
          install: "Update now",
          close: "Close",
          error: "Failed to check for updates.",
          tauriOnly: "Updates only work in the installed desktop app (MSI).",
          unsupported: "This install type does not support automatic updates.",
          installing: "Updating...",
        };

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "available" | "upToDate" | "unsupported" | "error"
  >("idle");
  const [update, setUpdate] = useState<UpdaterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const runCheck = async () => {
    setOpen(true);
    setError(null);
    setUpdate(null);
    setStatus("idle");

    if (!isTauriRuntime()) {
      setStatus("error");
      setError(copy.tauriOnly);
      return;
    }

    setChecking(true);
    try {
      const [{ check }, { getBundleType, BundleType, getVersion }] =
        await Promise.all([
          import("@tauri-apps/plugin-updater"),
          import("@tauri-apps/api/app"),
        ]);

      const version = await getVersion().catch(() => null);
      setCurrentVersion(version);

      const bundleType = await getBundleType().catch(() => null);
      if (bundleType !== BundleType.Msi) {
        setStatus("unsupported");
        return;
      }

      const result: UpdaterResult | null = await check();
      if (result) {
        setUpdate(result);
        setStatus("available");
      } else {
        setStatus("upToDate");
      }
    } catch (err) {
      console.error("[updater] manual check failed:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setChecking(false);
    }
  };

  const onInstall = async () => {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      if (typeof update.downloadAndInstall === "function") {
        await update.downloadAndInstall();
      } else if (
        typeof update.download === "function" &&
        typeof update.install === "function"
      ) {
        await update.download();
        await update.install();
      } else {
        throw new Error("Updater indisponivel.");
      }
    } catch (err) {
      console.error("[updater] install failed:", err);
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={runCheck}
        className="w-full rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4 text-left"
      >
        <p className="text-sm font-semibold text-[#E4E7EC]">{copy.title}</p>
        <p className="text-xs text-[#8B94A6]">{copy.hint}</p>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            if (checking || installing) return;
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#1E232E] bg-[#121621] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-[#E5E8EF]">
                  {copy.title}
                </p>
                {currentVersion ? (
                  <p className="text-xs text-[#8A93A3]">
                    {language === "pt"
                      ? `Versao atual: ${currentVersion}`
                      : `Current version: ${currentVersion}`}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-[#8B94A6] hover:text-[#DCE3EE]"
                onClick={() => {
                  if (checking || installing) return;
                  setOpen(false);
                }}
              >
                {copy.close}
              </button>
            </div>

            <div className="space-y-2 text-sm">
              {checking ? (
                <p className="text-xs text-[#C7CEDA]">{copy.checking}</p>
              ) : null}

              {!checking && status === "upToDate" ? (
                <p className="text-xs text-[#5DD6C7]">{copy.upToDate}</p>
              ) : null}

              {!checking && status === "unsupported" ? (
                <p className="text-xs text-[#F6D38B]">{copy.unsupported}</p>
              ) : null}

              {!checking && status === "available" ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#5DD6C7]">
                    {copy.available}{" "}
                    {update?.version ? `(${update.version})` : null}
                  </p>
                  {update?.body ? (
                    <p className="whitespace-pre-wrap text-xs text-[#C7CEDA]">
                      {update.body}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={installing}
                    onClick={onInstall}
                    className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                  >
                    {installing ? copy.installing : copy.install}
                  </button>
                </div>
              ) : null}

              {!checking && error ? (
                <p className="text-xs text-red-400">{error}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
