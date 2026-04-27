"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabaseClient";
import { getErrorMessage } from "@/lib/errorUtils";

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
      "category_budgets",
      "goals",
    ] as const;
    type ResettableTable = (typeof tables)[number];

    const errors: string[] = [];

    for (const table of tables) {
      // Some installations may not have optional tables (ex: goals) yet.
      const { error } = await supabase.from(table as ResettableTable)
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
      <div>
        <p className="ui-eyebrow">{t("tabs.more")}</p>
        <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">{t("more.title")}</p>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">{t("more.subtitle")}</p>
      </div>

      {/* Daily reminder */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">{t("more.dailyReminder")}</p>
        <div className="ui-card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">{t("more.enableReminder")}</p>
              <p className="text-xs text-[var(--text-3)]">{t("more.reminderHelper")}</p>
            </div>
            <button type="button" onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">{t("more.reminderTime")}</p>
              <p className="text-xs text-[var(--text-3)]">{t("more.reminderTimeHelper")}</p>
            </div>
            <input type="time" value={timeLabel}
              onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); if (!isNaN(h)) setHour(h); if (!isNaN(m)) setMinute(m); }}
              className="ui-input w-auto" />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`ui-badge ${enabled ? "ui-badge-income" : "ui-badge-neutral"}`}>
              {enabled ? t("more.active") : t("more.paused")}
            </span>
            <span className="text-[var(--text-3)]">
              {enabled ? `${t("more.next")}: ${timeLabel}` : t("more.notScheduled")}
            </span>
          </div>

          {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}
          {saved && !errorMsg ? <p className="text-xs text-[var(--green)]">{t("more.saved")}</p> : null}
          <button type="button" onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary w-full">
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      {/* 2FA */}
      {user ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">2FA (Google Authenticator)</p>
          <div className="ui-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {language === "pt" ? "Proteção da conta" : "Account protection"}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  {language === "pt" ? "Exige código do app autenticador ao entrar." : "Requires an authenticator app code on login."}
                </p>
              </div>
              <span className={`ui-badge ${verifiedTotpFactorId ? "ui-badge-income" : "ui-badge-neutral"}`}>
                {verifiedTotpFactorId ? (language === "pt" ? "Ativo" : "Enabled") : (language === "pt" ? "Inativo" : "Disabled")}
              </span>
            </div>

            {mfaLoading ? <p className="mt-3 text-xs text-[var(--text-3)]">{language === "pt" ? "Carregando..." : "Loading..."}</p> : null}

            {totpSetup ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-xs text-[var(--text-3)]">
                  {language === "pt" ? "Escaneie o QR code no Google Authenticator e confirme com o código de 6 dígitos." : "Scan the QR code in Google Authenticator and confirm using the 6-digit code."}
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="ui-card-inner p-2">
                    <img src={`data:image/svg+xml;utf-8,${encodeURIComponent(totpSetup.qrCode)}`} alt="QR code 2FA" className="h-40 w-40 rounded-lg" />
                  </div>
                  <div className="min-w-[220px] flex-1 flex flex-col gap-2">
                    <p className="text-xs text-[var(--text-3)]">{language === "pt" ? "Chave manual:" : "Manual key:"}</p>
                    <code className="ui-card-inner block overflow-x-auto px-3 py-2 text-[11px] text-[var(--text-2)]">{totpSetup.secret}</code>
                    <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder={language === "pt" ? "Código de 6 dígitos" : "6-digit code"} inputMode="numeric" className="ui-input" />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleConfirm2FASetup} disabled={mfaSaving} className="ui-btn ui-btn-primary flex-1">
                        {mfaSaving ? (language === "pt" ? "Verificando..." : "Verifying...") : (language === "pt" ? "Confirmar 2FA" : "Confirm 2FA")}
                      </button>
                      <button type="button" onClick={handleCancel2FASetup} disabled={mfaSaving} className="ui-btn ui-btn-secondary">
                        {language === "pt" ? "Cancelar" : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : verifiedTotpFactorId ? (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-xs text-[var(--text-3)]">
                  {language === "pt" ? "Para desativar, confirme com um código atual do autenticador." : "To disable, confirm with a current authenticator code."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input value={disableTotpCode} onChange={(e) => setDisableTotpCode(e.target.value)} placeholder={language === "pt" ? "Código de 6 dígitos" : "6-digit code"} inputMode="numeric" className="ui-input min-w-[200px] flex-1" />
                  <button type="button" onClick={handleDisable2FA} disabled={mfaSaving} className="ui-btn ui-btn-danger">
                    {mfaSaving ? (language === "pt" ? "Desativando..." : "Disabling...") : (language === "pt" ? "Desativar 2FA" : "Disable 2FA")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button type="button" onClick={handleStart2FA} disabled={mfaSaving} className="ui-btn ui-btn-primary">
                  {mfaSaving ? (language === "pt" ? "Preparando..." : "Preparing...") : (language === "pt" ? "Ativar 2FA" : "Enable 2FA")}
                </button>
              </div>
            )}

            {mfaError ? <p className="mt-3 text-xs text-[var(--red)]">{mfaError}</p> : null}
            {mfaSuccess ? <p className="mt-3 text-xs text-[var(--green)]">{mfaSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {/* Navigation links */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">{t("more.moreOptions")}</p>
        <div className="flex flex-col gap-2">
          {([
            { href: "/reports", label: language === "pt" ? "Relatórios" : "Reports", hint: language === "pt" ? "Resumo mensal, categorias e comparações." : "Monthly summary, categories, and comparisons." },
            { href: "/accounts", label: t("more.accounts"), hint: t("more.accountsHint") },
            { href: "/cards", label: t("more.cards"), hint: t("more.cardsHint") },
            { href: "/export", label: t("more.export"), hint: t("more.exportHint") },
          ] as const).map((item) => (
            <Link key={item.href} href={item.href} className="ui-card block p-4 transition-colors hover:border-[var(--border-bright)] hover:bg-[var(--surface-2)]">
              <p className="text-sm font-semibold text-[var(--text-1)]">{item.label}</p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">{item.hint}</p>
            </Link>
          ))}
        </div>

        {user ? (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={handleResetAllData} disabled={resettingData}
              className="w-full rounded-xl border border-[var(--amber)] border-opacity-30 bg-[var(--amber-dim)] p-4 text-left transition-opacity disabled:opacity-60">
              <p className="text-sm font-semibold text-[var(--amber)]">
                {resettingData ? t("common.loading") : t("more.resetData")}
              </p>
              <p className="mt-0.5 text-xs text-[var(--amber)] opacity-70">{t("more.resetDataHint")}</p>
            </button>
            {resetDataError ? <p className="text-xs text-[var(--red)]">{resetDataError}</p> : null}
            {resetDataSuccess ? <p className="text-xs text-[var(--green)]">{t("more.resetDataSuccess")}</p> : null}

            <button type="button" onClick={handleSignOut} disabled={signingOut}
              className="w-full rounded-xl border border-[var(--red)] border-opacity-30 bg-[var(--red-dim)] p-4 text-left transition-opacity disabled:opacity-60">
              <p className="text-sm font-semibold text-[var(--red)]">
                {signingOut ? t("common.loading") : t("more.signOut")}
              </p>
              <p className="mt-0.5 text-xs text-[var(--red)] opacity-70">{t("more.signOutHint")}</p>
            </button>
            {signOutError ? <p className="text-xs text-[var(--red)]">{signOutError}</p> : null}
          </div>
        ) : null}
      </div>

      {/* Language */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">{t("more.language")}</p>
        <div className="flex gap-2">
          {(["pt", "en"] as const).map((lang) => (
            <button key={lang} type="button" onClick={() => setLanguage(lang)}
              className={`ui-btn flex-1 ${language === lang ? "ui-btn-primary" : "ui-btn-secondary"}`}>
              {lang === "pt" ? t("more.portuguese") : t("more.english")}
            </button>
          ))}
        </div>
      </div>

      {/* Currency */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">{t("more.currency")}</p>
        <p className="text-xs text-[var(--text-3)]">{t("more.currencyHelper")}</p>
        <div className="flex gap-2">
          {(["BRL", "EUR"] as const).map((cur) => (
            <button key={cur} type="button" onClick={() => setCurrency(cur)}
              className={`ui-btn flex-1 ${currency === cur ? "ui-btn-primary" : "ui-btn-secondary"}`}>
              {cur === "BRL" ? t("more.currencyBrl") : t("more.currencyEur")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
