"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabaseClient";
import { getErrorMessage } from "@/lib/errorUtils";
import { CheckForUpdatesCard } from "@/components/CheckForUpdatesCard";

const STORAGE_KEYS = {
  enabled: "dailyReminderEnabled",
  time: "dailyReminderTime",
};
const REMINDER_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

type TotpSetupState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function MoreScreen() {
  const { language, setLanguage, t } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [resettingData, setResettingData] = useState(false);
  const [resetDataError, setResetDataError] = useState<string | null>(null);
  const [resetDataSuccess, setResetDataSuccess] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [verifiedTotpFactorId, setVerifiedTotpFactorId] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetupState | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [disableTotpCode, setDisableTotpCode] = useState("");

  useEffect(() => {
    const storedEnabled = window.localStorage.getItem(STORAGE_KEYS.enabled);
    const storedTime = window.localStorage.getItem(STORAGE_KEYS.time);
    if (storedEnabled != null) setEnabled(storedEnabled === "true");
    if (storedTime) {
      const [h, m] = storedTime.split(":").map((value) => Number(value));
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        setHour(h);
        setMinute(m);
      }
    }
  }, []);

  useEffect(() => {
    async function loadMfaState() {
      if (!user) {
        setVerifiedTotpFactorId(null);
        setTotpSetup(null);
        return;
      }

      setMfaLoading(true);
      setMfaError(null);
      const { data, error } = await supabase.auth.mfa.listFactors();
      setMfaLoading(false);
      if (error) {
        setMfaError(getErrorMessage(error));
        return;
      }
      setVerifiedTotpFactorId(data.totp[0]?.id ?? null);
    }

    loadMfaState();
  }, [user]);

  const timeLabel = useMemo(() => `${pad2(hour)}:${pad2(minute)}`, [hour, minute]);

  async function handleSave() {
    setErrorMsg(null);
    setSaved(false);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      setErrorMsg(language === "pt" ? "Hora inválida." : "Invalid time.");
      return;
    }

    setSaving(true);
    window.localStorage.setItem(STORAGE_KEYS.enabled, String(enabled));
    window.localStorage.setItem(STORAGE_KEYS.time, timeLabel);
    const { error } = await supabase.from("reminder_settings").upsert([
      {
        id: REMINDER_SETTINGS_ID,
        remind_enabled: enabled,
        remind_hour: hour,
        remind_minute: minute,
      },
    ]);
    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg(
        language === "pt"
          ? "Falha ao guardar lembrete."
          : "Failed to save reminder.",
      );
      return;
    }

    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("reminder-shown-")) {
        window.localStorage.removeItem(key);
      }
    }
    window.dispatchEvent(new Event("data-refresh"));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      console.error(error);
      setSignOutError(
        language === "pt" ? "Falha ao sair." : "Failed to sign out.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function handleResetAllData() {
    if (!user || resettingData) return;
    setResetDataError(null);
    setResetDataSuccess(false);

    const confirmed = window.confirm(t("more.resetDataConfirm"));
    if (!confirmed) return;

    const typed = window.prompt(`${t("more.resetDataTypeToConfirm")} RESET`);
    if (typed?.trim().toUpperCase() !== "RESET") {
      setResetDataError(t("more.resetDataTypingMismatch"));
      return;
    }

    setResettingData(true);

    const tables = [
      "investment_purchases",
      "investments",
      "transactions",
      "transfers",
      "credit_cards",
      "accounts",
      "reminder_settings",
      "goals",
    ] as const;

    const errors: string[] = [];

    for (const table of tables) {
      // Some installations may not have optional tables (ex: goals) yet.
      const { error } = await (supabase.from(table as any) as any)
        .delete()
        .eq("user_id", user.id);
      if (!error) continue;
      if (error.code === "42P01") continue;
      errors.push(`${table}: ${error.message}`);
    }

    setResettingData(false);

    if (errors.length > 0) {
      console.error("[more] reset data errors:", errors);
      setResetDataError(t("more.resetDataError"));
      return;
    }

    window.localStorage.removeItem(STORAGE_KEYS.enabled);
    window.localStorage.removeItem(STORAGE_KEYS.time);
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("reminder-shown-")) {
        window.localStorage.removeItem(key);
      }
    }
    setEnabled(true);
    setHour(9);
    setMinute(0);
    window.dispatchEvent(new Event("data-refresh"));
    setResetDataSuccess(true);
    setTimeout(() => setResetDataSuccess(false), 3000);
  }

  async function refreshMfaState() {
    if (!user) {
      setVerifiedTotpFactorId(null);
      setTotpSetup(null);
      return;
    }
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaError(getErrorMessage(error));
      return;
    }
    setVerifiedTotpFactorId(data.totp[0]?.id ?? null);
  }

  async function handleStart2FA() {
    if (!user) return;
    setMfaError(null);
    setMfaSuccess(null);
    setMfaSaving(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Google Authenticator",
      issuer: "GuimFinancial",
    });
    setMfaSaving(false);

    if (error || !data) {
      setMfaError(getErrorMessage(error ?? "Falha ao iniciar 2FA."));
      return;
    }

    setTotpSetup({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setTotpCode("");
  }

  async function handleCancel2FASetup() {
    if (!totpSetup) return;
    setMfaSaving(true);
    await supabase.auth.mfa.unenroll({ factorId: totpSetup.factorId });
    setMfaSaving(false);
    setTotpSetup(null);
    setTotpCode("");
  }

  async function handleConfirm2FASetup() {
    if (!totpSetup) return;
    const code = totpCode.trim();
    if (!code) {
      setMfaError(
        language === "pt"
          ? "Digite o codigo de 6 digitos do autenticador."
          : "Enter the 6-digit authenticator code.",
      );
      return;
    }

    setMfaError(null);
    setMfaSuccess(null);
    setMfaSaving(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: totpSetup.factorId,
      code,
    });
    setMfaSaving(false);

    if (error) {
      setMfaError(getErrorMessage(error));
      return;
    }

    setTotpSetup(null);
    setTotpCode("");
    setMfaSuccess(language === "pt" ? "2FA ativado com sucesso." : "2FA enabled.");
    await refreshMfaState();
  }

  async function handleDisable2FA() {
    if (!verifiedTotpFactorId) return;
    const code = disableTotpCode.trim();
    if (!code) {
      setMfaError(
        language === "pt"
          ? "Digite o codigo atual para desativar."
          : "Enter your current code to disable.",
      );
      return;
    }

    setMfaError(null);
    setMfaSuccess(null);
    setMfaSaving(true);

    const verifyRes = await supabase.auth.mfa.challengeAndVerify({
      factorId: verifiedTotpFactorId,
      code,
    });
    if (verifyRes.error) {
      setMfaSaving(false);
      setMfaError(getErrorMessage(verifyRes.error));
      return;
    }

    const { error } = await supabase.auth.mfa.unenroll({
      factorId: verifiedTotpFactorId,
    });
    setMfaSaving(false);

    if (error) {
      setMfaError(getErrorMessage(error));
      return;
    }

    setDisableTotpCode("");
    setMfaSuccess(language === "pt" ? "2FA desativado." : "2FA disabled.");
    await refreshMfaState();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
          {t("tabs.more")}
        </p>
        <p className="text-2xl font-semibold text-[#E5E8EF]">{t("more.title")}</p>
        <p className="text-sm text-[#9CA3AF]">{t("more.subtitle")}</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.dailyReminder")}</p>
        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.enableReminder")}</p>
              <p className="text-xs text-[#8A93A3]">{t("more.reminderHelper")}</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((value) => !value)}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                enabled ? "bg-[#2F6C73]" : "bg-[#2A2F3A]"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-[#E0F2F1] transition ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.reminderTime")}</p>
              <p className="text-xs text-[#8A93A3]">{t("more.reminderTimeHelper")}</p>
            </div>
            <input
              type="time"
              value={timeLabel}
              onChange={(event) => {
                const [h, m] = event.target.value.split(":").map((value) => Number(value));
                if (!Number.isNaN(h)) setHour(h);
                if (!Number.isNaN(m)) setMinute(m);
              }}
              className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 rounded-full border border-[#1B2232] bg-[#0C1018] px-3 py-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  enabled ? "bg-[#5DD6C7]" : "bg-[#5B667A]"
                }`}
              />
              <span className="text-[#C7CEDA]">
                {enabled ? t("more.active") : t("more.paused")}
              </span>
            </div>
            <span className="text-[#7F8694]">
              {enabled ? `${t("more.next")}: ${timeLabel}` : t("more.notScheduled")}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
            {saved && !errorMsg ? (
              <p className="text-xs text-[#5DD6C7]">{t("more.saved")}</p>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      {user ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#C7CEDA]">
            {language === "pt"
              ? "2FA (Google Authenticator)"
              : "2FA (Google Authenticator)"}
          </p>
          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#E4E7EC]">
                  {language === "pt" ? "Protecao da conta" : "Account protection"}
                </p>
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Exige codigo do app autenticador ao entrar."
                    : "Requires an authenticator app code on login."}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  verifiedTotpFactorId
                    ? "border-[#1E5B42] bg-[#113328] text-[#6CF1C2]"
                    : "border-[#2A3140] bg-[#151A27] text-[#A7AFBF]"
                }`}
              >
                {verifiedTotpFactorId
                  ? language === "pt"
                    ? "Ativo"
                    : "Enabled"
                  : language === "pt"
                    ? "Inativo"
                    : "Disabled"}
              </span>
            </div>

            {mfaLoading ? (
              <p className="mt-3 text-xs text-[#8A93A3]">
                {language === "pt" ? "Carregando estado do 2FA..." : "Loading 2FA state..."}
              </p>
            ) : null}

            {totpSetup ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Escaneie o QR code no Google Authenticator e confirme com o codigo de 6 digitos."
                    : "Scan the QR code in Google Authenticator and confirm using the 6-digit code."}
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="rounded-xl border border-[#243042] bg-[#0D131F] p-2">
                    <img
                      src={`data:image/svg+xml;utf-8,${encodeURIComponent(totpSetup.qrCode)}`}
                      alt="QR code 2FA"
                      className="h-40 w-40 rounded-lg"
                    />
                  </div>
                  <div className="min-w-[220px] flex-1 space-y-2">
                    <p className="text-xs text-[#8A93A3]">
                      {language === "pt" ? "Chave manual:" : "Manual key:"}
                    </p>
                    <code className="block overflow-x-auto rounded-lg border border-[#243042] bg-[#0D131F] px-3 py-2 text-[11px] text-[#C7CEDA]">
                      {totpSetup.secret}
                    </code>
                    <input
                      value={totpCode}
                      onChange={(event) => setTotpCode(event.target.value)}
                      placeholder={language === "pt" ? "Codigo de 6 digitos" : "6-digit code"}
                      inputMode="numeric"
                      className="w-full rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleConfirm2FASetup}
                        disabled={mfaSaving}
                        className="flex-1 rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                      >
                        {mfaSaving
                          ? language === "pt"
                            ? "Verificando..."
                            : "Verifying..."
                          : language === "pt"
                            ? "Confirmar 2FA"
                            : "Confirm 2FA"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel2FASetup}
                        disabled={mfaSaving}
                        className="rounded-xl border border-[#2A3140] bg-[#151A27] px-3 py-2 text-sm font-semibold text-[#DCE3EE] disabled:opacity-60"
                      >
                        {language === "pt" ? "Cancelar" : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : verifiedTotpFactorId ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Para desativar, confirme com um codigo atual do autenticador."
                    : "To disable, confirm with a current authenticator code."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={disableTotpCode}
                    onChange={(event) => setDisableTotpCode(event.target.value)}
                    placeholder={language === "pt" ? "Codigo de 6 digitos" : "6-digit code"}
                    inputMode="numeric"
                    className="min-w-[220px] flex-1 rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
                  />
                  <button
                    type="button"
                    onClick={handleDisable2FA}
                    disabled={mfaSaving}
                    className="rounded-xl border border-[#5A2D2D] bg-[#241416] px-4 py-2 text-sm font-semibold text-[#F4C4C4] disabled:opacity-60"
                  >
                    {mfaSaving
                      ? language === "pt"
                        ? "Desativando..."
                        : "Disabling..."
                      : language === "pt"
                        ? "Desativar 2FA"
                        : "Disable 2FA"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleStart2FA}
                  disabled={mfaSaving}
                  className="rounded-xl bg-[#E6EDF3] px-4 py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                >
                  {mfaSaving
                    ? language === "pt"
                      ? "Preparando..."
                      : "Preparing..."
                    : language === "pt"
                      ? "Ativar 2FA"
                      : "Enable 2FA"}
                </button>
              </div>
            )}

            {mfaError ? <p className="mt-3 text-xs text-red-400">{mfaError}</p> : null}
            {mfaSuccess ? <p className="mt-3 text-xs text-[#5DD6C7]">{mfaSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.moreOptions")}</p>
        <div className="space-y-3">
          <Link
            href="/accounts"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.accounts")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.accountsHint")}</p>
          </Link>
          <Link
            href="/cards"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.cards")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.cardsHint")}</p>
          </Link>
          <Link
            href="/export"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.export")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.exportHint")}</p>
          </Link>

          <CheckForUpdatesCard />

          {user ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleResetAllData}
                disabled={resettingData}
                className="w-full rounded-2xl border border-[#5D3A16] bg-[#24190E] p-4 text-left disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#F2C38B]">
                  {resettingData ? t("common.loading") : t("more.resetData")}
                </p>
                <p className="text-xs text-[#D6B086]">{t("more.resetDataHint")}</p>
              </button>
              {resetDataError ? <p className="text-xs text-red-400">{resetDataError}</p> : null}
              {resetDataSuccess ? (
                <p className="text-xs text-[#5DD6C7]">{t("more.resetDataSuccess")}</p>
              ) : null}

              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full rounded-2xl border border-[#3A1E1E] bg-[#1A0F0F] p-4 text-left disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#F3B5B5]">
                  {signingOut ? t("common.loading") : t("more.signOut")}
                </p>
                <p className="text-xs text-[#CFA5A5]">{t("more.signOutHint")}</p>
              </button>
              {signOutError ? <p className="text-xs text-red-400">{signOutError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.language")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setLanguage("pt")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              language === "pt"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.portuguese")}
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              language === "en"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.english")}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.currency")}</p>
        <p className="text-xs text-[#8A93A3]">{t("more.currencyHelper")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setCurrency("BRL")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              currency === "BRL"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.currencyBrl")}
          </button>
          <button
            type="button"
            onClick={() => setCurrency("EUR")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              currency === "EUR"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.currencyEur")}
          </button>
        </div>
      </div>
    </div>
  );
}
